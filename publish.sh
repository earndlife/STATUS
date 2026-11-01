#!/usr/bin/env bash
# Publish the status page: put this folder, as committed, into the PUBLIC repository
# earndlife/STATUS as one new commit on its main; the push runs the workflow there, which
# redeploys the page in a couple of minutes. Owner-run: it pushes to a public repository.
#
#   bash status/publish.sh            publish the committed folder
#   bash status/publish.sh --create   create the public repository first (needs an admin token),
#                                     then enable Pages from Actions and run the first check
#
# Why a separate, public repository: the organisation is on GitHub's free plan, where Pages and
# unmetered Actions minutes exist only for public repositories. The page carries nothing private:
# the components' public addresses, the checks' results, and the incidents written for readers.
#
# Who owns what there. Everything but incidents/ is this folder's: a publish makes the public main
# match it, deletions included. incidents/ belongs to the public repository, where incidents are
# written (README.md, "Writing an incident"), so a publish never deletes or rewrites one: an
# incident only the public repository has is kept, one only this folder has is added, and where
# both have a file and they differ the public copy wins and this script says so. The template,
# incidents/_template.md, follows this folder like the rest of the page.
#
# Two guards: what goes out is the folder as committed (git archive), and a folder with changes
# not yet committed is refused, so what you see here is what is published; and the push goes on
# top of the public main's history, never over it (no force: if main moved meanwhile, the push is
# refused and nothing is lost; run it again).
#
# STATUS_REMOTE points the publish at another git remote (a local bare repository, to try it);
# then nothing is asked of GitHub's API. The token is the one git already holds for github.com
# (git credential fill), never typed here.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ORG="${STATUS_ORG:-earndlife}"
REPO="${STATUS_REPO:-STATUS}"
REMOTE="${STATUS_REMOTE:-https://github.com/$ORG/$REPO.git}"
API="https://api.github.com"
# Pages serves a project under its repository's name, case and all: /STATUS/, not /status/.
PAGE="https://$ORG.github.io/$REPO/"
CREATE=0
[ "${1:-}" = "--create" ] && CREATE=1

token() {
  printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p'
}

api() {
  curl -sS -H "Authorization: Bearer $(token)" -H "Accept: application/vnd.github+json" "$@"
}

on_github() {
  case "$REMOTE" in https://github.com/*) return 0 ;; *) return 1 ;; esac
}

# 1. The folder as committed, and nothing waiting to be.
git -C "$HERE" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "publish.sh runs from the website checkout" >&2; exit 1; }
changes="$(git -C "$HERE" status --porcelain -- .)"
if [ -n "$changes" ]; then
  echo "status/ has changes that are not committed; commit them first, so what goes out is what you see:" >&2
  printf '%s\n' "$changes" >&2
  exit 1
fi
SOURCE="$(git -C "$HERE" rev-parse --short HEAD)"
TOP="$(git -C "$HERE" rev-parse --show-toplevel)"
PREFIX="$(git -C "$HERE" rev-parse --show-prefix)"

if [ "$CREATE" = 1 ]; then
  on_github || { echo "--create needs GitHub's remote, not $REMOTE" >&2; exit 1; }
  echo "→ creating $ORG/$REPO (public)"
  api -X POST "$API/orgs/$ORG/repos" \
    -d "{\"name\":\"$REPO\",\"visibility\":\"public\",\"description\":\"Earnd status page: whether earnd.life and the waitlist are up.\",\"has_issues\":false,\"has_wiki\":false,\"has_projects\":false}" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("html_url") or d.get("message"))'
fi

TMP="$(mktemp -d)"
trap 'rm -rf -- "${TMP:?}"' EXIT
PAGE_DIR="$TMP/page"
OUT="$TMP/public"
mkdir -p "$PAGE_DIR"
# From the top of the checkout: run inside status/, git archive keeps only status/ of the tree it
# is given, which inside the status tree is nothing.
git -C "$TOP" archive --format=tar "HEAD:${PREFIX%/}" | tar -x -C "$PAGE_DIR"
# A page without its page is never published: the copy below deletes what it does not bring.
for needed in index.html components.json scripts/build.mjs .github/workflows/status.yml; do
  [ -f "$PAGE_DIR/$needed" ] || { echo "the committed folder has no $needed; nothing published" >&2; exit 1; }
done

# 2. The public main as it is now, incidents and all.
set +e
git ls-remote --exit-code --heads "$REMOTE" main >/dev/null 2>&1
has_main=$?
set -e
case "$has_main" in
  0)
    echo "→ fetching main from $REMOTE"
    git clone -q --single-branch --branch main "$REMOTE" "$OUT"
    ;;
  2)
    echo "→ $REMOTE has no main yet: this is its first commit"
    git init -q -b main "$OUT"
    git -C "$OUT" remote add origin "$REMOTE"
    ;;
  *)
    echo "could not read $REMOTE (git ls-remote exit $has_main)" >&2
    exit 1
    ;;
esac

# 3. The page over it: everything but incidents/ follows this folder, deletions included.
echo "→ copying status/ at $SOURCE in"
rsync -a --delete --exclude /.git --exclude /incidents/ "$PAGE_DIR/" "$OUT/"
# incidents/: what the public repository lacks is added, what it has is kept.
mkdir -p "$OUT/incidents"
for file in "$PAGE_DIR"/incidents/*; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"
  target="$OUT/incidents/$name"
  case "$name" in
    _*) cp "$file" "$target" ;;
    *)
      if [ ! -e "$target" ]; then
        cp "$file" "$target"
      elif ! cmp -s "$file" "$target"; then
        echo "   kept the public copy of incidents/$name (it differs from this folder's)"
      fi
      ;;
  esac
done

# 4. One commit on top of the public history, pushed without force.
cd "$OUT"
git add -A
pushed=0
if git diff --cached --quiet; then
  echo "→ nothing to publish: the public main already holds this page"
else
  git -c user.name=earnd-status -c user.email=status@earnd.life commit -qm "status page $(date -u +%F) (website $SOURCE)"
  echo "→ pushing main to $REMOTE"
  git push -q origin main
  pushed=1
fi

# 5. A new repository: Pages from Actions, and the first check.
if [ "$CREATE" = 1 ]; then
  echo "→ enabling Pages from Actions"
  code=$(api -o /dev/null -w '%{http_code}' -X POST "$API/repos/$ORG/$REPO/pages" -d '{"build_type":"workflow"}')
  case "$code" in
    201) echo "   Pages enabled" ;;
    409) echo "   Pages was already enabled" ;;
    *) echo "   Pages could not be enabled by the API (HTTP $code): Settings → Pages → Source: GitHub Actions" ;;
  esac
  echo "→ running the first check"
  api -o /dev/null -w '   dispatch: HTTP %{http_code}\n' -X POST "$API/repos/$ORG/$REPO/actions/workflows/status.yml/dispatches" -d '{"ref":"main"}'
  echo "For status.earnd.life: a CNAME record at Spaceship pointing at $ORG.github.io, then Settings → Pages → Custom domain."
fi

if ! on_github; then
  echo "Done ($REMOTE is not GitHub's: no Pages, no run)."
elif [ "$pushed" = 1 ]; then
  echo "Done. The push runs the workflow; the page updates in a couple of minutes: $PAGE"
else
  echo "Done. The page: $PAGE"
fi

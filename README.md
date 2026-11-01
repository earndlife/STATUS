# Earnd status page

A public page that says whether earnd.life and the waitlist are up, checked on a schedule
**from GitHub's servers, not Earnd's own box**, with 90 days of history per component and every
incident written for readers. It lives at https://status.earnd.life/.

Everything in this folder is public the moment it is published, and it is live before the site
says everything it will. So it names only what earnd.life already shows: a component joins the
list when the site has said what it is, not before.

Why off the box: the site runs on one server. A status page on that server is down exactly when
it is needed. GitHub Pages is free, served from GitHub's CDN, and the checks run in GitHub
Actions, which are free for a public repository. The organisation is on GitHub's free plan, where
Pages exists only for public repositories, so this folder is **published into a separate public
repository**, `earndlife/STATUS`, by `publish.sh`. Nothing in it is private: public addresses,
the checks' results, incident text meant for readers.

## Where things change

| What | Changed in | Goes out by |
| --- | --- | --- |
| The page, its scripts, the components, the workflow | `status/` in the website repository, the source | `bash status/publish.sh`, after the commit |
| Incidents | `incidents/` in the public repository, `earndlife/STATUS` | The push to its `main` |
| The history | Nowhere by hand: the workflow keeps it on the public repository's `data` branch | Every run |

The public repository's `main` is this folder plus its incidents. `publish.sh` adds one commit on
top of it and never deletes or rewrites an incident, so the two never fight. Any other file edited
in the public repository is replaced by the next publish: change it here.

## What is here

| Path | What |
| --- | --- |
| `index.html` | The page: HTML, CSS and its scripts, no build step (one for the header and the back-to-top control, a module for the results). It wears earnd.life's look (the site's tokens, fonts, header, lockup, pills, back-to-top control and footer wordmark) and loads nothing from earnd.life, so it stands when the site does not; the header's button opens earnd.life in a new tab |
| `components.json` | What is checked: name, address, expected statuses, time-out, the "degraded" latency, enabled |
| `scripts/lib.mjs` | The rules: samples to a state, history, uptime, incident files, and the words the page shows. The page imports it; `lib.test.ts` pins it (the website's `pnpm test`) |
| `scripts/probe.mjs` | One run: asks every enabled component twice, writes `site/status.json`, folds the day into the history |
| `scripts/build.mjs` | Assembles `site/`: the page, `lib.mjs`, the assets, `status.json`, `history.json`, `incidents.json` from `incidents/*.md` |
| `incidents/` | One markdown file per incident, front matter plus plain text. `_template.md` is the shape; underscored files are not published |
| `.github/workflows/status.yml` | In the public repository, on its schedule, on a push to `main` and by hand: probe, keep the history on the `data` branch, build, deploy to Pages |
| `publish.sh` | Publishes this folder, as committed, into `earndlife/STATUS` (above) |
| `assets/` | The owl mark for the header and the footer, and the browser tab's icons (`favicon.ico`, `icon.png`, `apple-icon.png`): byte copies of the logo folder's, which the website's `content/brand-files.test.ts` holds to their source. `fonts/`: the variable Manrope and Space Grotesk the site uses, Latin only, with their licences |

## The rules

- **Up**: an expected status came back within the degraded latency on the first attempt.
- **Degraded**: it came back, but slower than `degradedMs`, or only on the second attempt.
- **Down**: no expected status came back in two attempts (a time-out, a refused connection, a
  5xx, a DNS miss).
- **Disabled**: listed for later, shown as "not live yet", never counted.
- **Uptime** over 90 days is the share of checks that were not down; degraded counts as up,
  because slow is not out. It reads 100% only when no check was down, and is otherwise rounded
  down to two decimals, so it never reads 100% after an outage.
- Days are **UTC** in the history and on the strip; the page shows times in IST.

## How often it runs

The workflow is scheduled every 30 minutes, but GitHub runs scheduled workflows later than planned
when it is busy: in October 2026 the runs came every 3 to 7 hours. The page says when it last
checked, and its "How this page works" section says the schedule is not exact. A push to `main`
(a publish, an incident) runs it at once, and so does **Actions → Status → Run workflow**.

## Owner steps, once (done 2026-10-20)

1. `bash status/publish.sh --create` from the website checkout. It creates the public repository
   under the organisation with the token git already holds, pushes this folder as its `main`,
   enables Pages from Actions, and dispatches the first run. If the Pages call is refused, enable
   it by hand: repository **Settings → Pages → Source: GitHub Actions**.
2. Open `https://earndlife.github.io/STATUS/` a few minutes later. Pages serves a repository under
   its own name, case and all: `/status/` is a 404.
3. `status.earnd.life`: a `CNAME` record in earnd.life's DNS pointing at `earndlife.github.io`, then
   **Settings → Pages → Custom domain** and **Enforce HTTPS** (both set; HTTPS enforced since
   2026-11-01). The github.io address now redirects there.
4. The waitlist's address in `components.json` is the function's public URL (the same one the
   site's bundle carries).

Whenever this folder changes here: commit, then `bash status/publish.sh` (no `--create`). It
refuses a folder with changes not yet committed, adds one commit on top of the public `main`
(never a force push), and leaves the incidents there alone.

## Writing an incident

Incidents live in the public repository. Copy `incidents/_template.md` to
`incidents/YYYY-MM-DD-short-name.md` there, in the GitHub web editor (it works from a phone) or in
a checkout of `earndlife/STATUS` (`git pull` first), fill the front matter, write what a reader
would want to know, and commit to `main`. The push runs the workflow, so the incident is on the
page in a couple of minutes. Update it by appending lines and moving `status` forward:
investigating, identified, monitoring, resolved (with a `resolved:` time). A publish from the
website never deletes or rewrites an incident; to take one down, delete it in the public
repository. Who writes it and when is `docs/incidents/INCIDENT_PROCESS.md` in the website
repository.

## Running it here

```bash
node status/scripts/probe.mjs --components status/components.json --history /tmp/earnd-status-history.json --out /tmp/earnd-status-site
node status/scripts/build.mjs --root status --history /tmp/earnd-status-history.json --out /tmp/earnd-status-site
python3 -m http.server --directory /tmp/earnd-status-site 4180   # then http://127.0.0.1:4180/
```

The page imports `lib.mjs` as a module, so open it through a server, not as a file. `site/` and
`data/` are build outputs and are neither committed here nor published.

## Credits

Fonts: Manrope (The Manrope Project Authors) and Space Grotesk (The Space Grotesk Project
Authors), under the SIL Open Font Licence 1.1, with each licence beside its font in
`assets/fonts/`. The social and arrow icons are from Hugeicons' free set (MIT).

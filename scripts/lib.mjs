// The status page's logic with nothing async in it: how samples become a state, how a day's
// history accumulates, what an uptime figure is, how an incident file is read, and the words the
// page shows. probe.mjs and build.mjs are the thin CLIs around it and index.html imports it as a
// module; lib.test.ts (run by the website's vitest) pins the rules.

/** How a component ended up after its samples. */
export const STATES = ["up", "degraded", "down", "disabled"];

/**
 * One sample is one request. `ok` is whether a response arrived at all; `status` and `latencyMs`
 * when it did; `error` when it did not (a timeout, a refused connection, a DNS miss).
 */
export function classify(samples, component) {
  if (component.enabled === false) return { state: "disabled", httpStatus: null, latencyMs: null, error: null };
  const expect = component.expect ?? [200];
  const good = samples.filter((s) => s.ok && expect.includes(s.status));
  if (good.length === 0) {
    const last = samples[samples.length - 1];
    return {
      state: "down",
      httpStatus: last?.ok ? last.status : null,
      latencyMs: last?.latencyMs ?? null,
      error: last?.ok ? `answered ${last.status}` : (last?.error ?? "no answer"),
    };
  }
  const best = good.reduce((a, b) => (a.latencyMs <= b.latencyMs ? a : b));
  const slow = best.latencyMs > (component.degradedMs ?? 3000);
  const flaky = good.length < samples.length;
  return {
    state: slow || flaky ? "degraded" : "up",
    httpStatus: best.status,
    latencyMs: best.latencyMs,
    error: flaky ? "one attempt failed" : slow ? "slow" : null,
  };
}

/** The page's overall banner: the worst state among enabled components. */
export function overall(components) {
  const live = components.filter((c) => c.state !== "disabled");
  if (live.length === 0) return "unknown";
  if (live.some((c) => c.state === "down")) return "down";
  if (live.some((c) => c.state === "degraded")) return "degraded";
  return "up";
}

/** The UTC calendar day of an instant. */
export function utcDay(at) {
  return new Date(at).toISOString().slice(0, 10);
}

/** An empty history. */
export function emptyHistory() {
  return { version: 1, days: {} };
}

/** One run's results folded into the per-day counters. Disabled components leave no mark. */
export function appendHistory(history, status, now = status.generatedAt) {
  const next = { version: 1, days: { ...(history?.days ?? {}) } };
  const day = utcDay(now);
  const today = { ...(next.days[day] ?? {}) };
  for (const c of status.components) {
    if (c.state === "disabled") continue;
    const counters = { checks: 0, up: 0, degraded: 0, down: 0, ...(today[c.id] ?? {}) };
    counters.checks += 1;
    counters[c.state] += 1;
    today[c.id] = counters;
  }
  next.days[day] = today;
  return next;
}

/** Days older than `keepDays` before `now` are dropped, so the file stays small. */
export function prune(history, now, keepDays = 90) {
  const cutoff = utcDay(new Date(new Date(now).getTime() - (keepDays - 1) * 86_400_000));
  const days = Object.fromEntries(Object.entries(history.days ?? {}).filter(([day]) => day >= cutoff));
  return { version: 1, days };
}

/**
 * Uptime over the last `days` days as a share of checks that were not down, or null with no
 * checks. Degraded counts as up: slow is not out.
 */
export function uptimeOf(history, id, days, now) {
  const cutoff = utcDay(new Date(new Date(now).getTime() - (days - 1) * 86_400_000));
  let checks = 0;
  let down = 0;
  for (const [day, byId] of Object.entries(history.days ?? {})) {
    if (day < cutoff) continue;
    const c = byId[id];
    if (!c) continue;
    checks += c.checks;
    down += c.down;
  }
  return checks === 0 ? null : (checks - down) / checks;
}

/** The state of one component on one day, for the 90-square strip: the worst thing that happened. */
export function dayState(counters) {
  if (!counters || counters.checks === 0) return "none";
  if (counters.down > 0) return "down";
  if (counters.degraded > 0) return "degraded";
  return "up";
}

/** How many of the last `days` days have a check of `id`: the span an uptime figure stands on. */
export function daysWithChecks(history, id, days, now) {
  const cutoff = utcDay(new Date(new Date(now).getTime() - (days - 1) * 86_400_000));
  return Object.entries(history?.days ?? {}).filter(([day, byId]) => day >= cutoff && (byId[id]?.checks ?? 0) > 0).length;
}

// ── The page's words ───────────────────────────────────────────────────────
// index.html imports this file as a module (build.mjs copies it beside the page), so what a
// reader is told is pinned here by lib.test.ts rather than written into the page's script.

/**
 * An uptime share as a reader sees it: "100%" only when no check was down, otherwise two
 * decimals rounded down, so one failed check in thousands reads 99.99% and never 100%.
 */
export function formatUptime(share) {
  if (share === null || share === undefined || !Number.isFinite(share)) return null;
  if (share >= 1) return "100%";
  // The epsilon undoes binary fractions (0.29 * 10000 is 2899.99...); a real shortfall is far larger.
  return `${(Math.floor(share * 10_000 + 1e-6) / 100).toFixed(2)}%`;
}

/** One component's day in words, for the strip: "6 checks, all up", "6 checks: 1 down, 2 degraded". */
export function describeDay(counters) {
  if (!counters || !counters.checks) return "No checks";
  if (counters.checks === 1) return `1 check, ${counters.down ? "down" : counters.degraded ? "degraded" : "up"}`;
  const problems = [counters.down && `${counters.down} down`, counters.degraded && `${counters.degraded} degraded`].filter(Boolean);
  return `${counters.checks} checks${problems.length ? `: ${problems.join(", ")}` : ", all up"}`;
}

/** How long ago an instant was, coarsely: "just now", "12 min ago", "3 hours ago", "2 days ago". */
export function sinceText(at, now = Date.now()) {
  const minutes = Math.floor((new Date(now).getTime() - new Date(at).getTime()) / 60_000);
  if (Number.isNaN(minutes)) return null;
  // A reader's clock a little behind the check's reads "just now", never a time to come.
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** How long an incident lasted: "40 min", "2 hours 5 min", "1 day 3 hours". */
export function durationText(fromAt, toAt) {
  const minutes = Math.max(0, Math.round((new Date(toAt).getTime() - new Date(fromAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}${hours % 24 ? ` ${hours % 24} ${hours % 24 === 1 ? "hour" : "hours"}` : ""}`;
}

/** Names as a reader lists them: "a", "a and b", "a, b and c". */
export function listOf(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The banner's second line: what is not normal, by name, or that everything answered. */
export function overallDetail(components) {
  const live = components.filter((c) => c.state !== "disabled");
  if (live.length === 0) return "No check has run yet.";
  const lines = [];
  for (const state of ["down", "degraded"]) {
    const names = live.filter((c) => c.state === state).map((c) => c.name);
    if (names.length) lines.push(`${listOf(names)} ${names.length === 1 ? "is" : "are"} ${state}.`);
  }
  if (lines.length) return lines.join(" ");
  if (live.length === 1) return `${live[0].name} answered normally.`;
  return `${live.length === 2 ? "Both" : `All ${live.length}`} components answered normally.`;
}

// ── Incidents ──────────────────────────────────────────────────────────────
// A markdown file per incident, with a small front matter. Written by a person, by hand, in
// the public repository, which keeps it (publish.sh never deletes or rewrites one); the push to
// main runs the workflow, which publishes it. Nothing here parses YAML in general: a
// `key: value` line per field is all an incident needs.
export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"];

export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fields: {}, body: text.trim() };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/i.exec(line.trim());
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim();
  }
  return { fields, body: m[2].trim() };
}

/** An incident, or null (and a reason) when the file is not one the page can show. */
export function parseIncident(slug, text) {
  const { fields, body } = parseFrontMatter(text);
  const problems = [];
  if (!fields.title) problems.push("no title");
  if (!INCIDENT_STATUSES.includes(fields.status)) problems.push(`status must be one of ${INCIDENT_STATUSES.join(", ")}`);
  if (!fields.started || Number.isNaN(Date.parse(fields.started))) problems.push("started must be a date-time");
  if (fields.resolved && Number.isNaN(Date.parse(fields.resolved))) problems.push("resolved must be a date-time");
  if (fields.status === "resolved" && !fields.resolved) problems.push("a resolved incident needs a resolved time");
  if (problems.length) return { incident: null, problems };
  return {
    incident: {
      slug,
      title: fields.title,
      status: fields.status,
      started: new Date(fields.started).toISOString(),
      resolved: fields.resolved ? new Date(fields.resolved).toISOString() : null,
      components: (fields.components ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      body,
    },
    problems: [],
  };
}

/** Newest first; unresolved ones first among equals. */
export function sortIncidents(list) {
  return [...list].sort((a, b) => {
    const open = Number(a.status !== "resolved") - Number(b.status !== "resolved");
    if (open !== 0) return -open;
    return b.started.localeCompare(a.started);
  });
}

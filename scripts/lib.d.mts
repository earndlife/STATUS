// Types for lib.mjs, so the website's TypeScript test can import it. Kept by hand and small: the
// test is the thing that would notice a drift.

export type State = "up" | "degraded" | "down" | "disabled";

export interface Component {
  id: string;
  name: string;
  description?: string;
  url: string;
  expect?: number[];
  timeoutMs?: number;
  degradedMs?: number;
  enabled?: boolean;
}

export type Sample =
  | { ok: true; status: number; latencyMs: number }
  | { ok: false; error: string; latencyMs?: number };

export interface Classified {
  state: State;
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface ComponentStatus extends Classified {
  id: string;
  name: string;
  description?: string;
  url: string;
}

export interface Status {
  generatedAt: string;
  components: ComponentStatus[];
}

export interface DayCounters {
  checks: number;
  up: number;
  degraded: number;
  down: number;
}

export interface History {
  version: 1;
  days: Record<string, Record<string, DayCounters>>;
}

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export interface Incident {
  slug: string;
  title: string;
  status: IncidentStatus;
  started: string;
  resolved: string | null;
  components: string[];
  body: string;
}

export const STATES: readonly State[];
export const INCIDENT_STATUSES: readonly IncidentStatus[];
export function classify(samples: Sample[], component: Pick<Component, "expect" | "degradedMs" | "enabled">): Classified;
export function overall(components: Pick<ComponentStatus, "state">[]): "up" | "degraded" | "down" | "unknown";
export function utcDay(at: string | number | Date): string;
export function emptyHistory(): History;
export function appendHistory(history: History | null | undefined, status: Status, now?: string | number | Date): History;
export function prune(history: History, now: string | number | Date, keepDays?: number): History;
export function uptimeOf(history: History, id: string, days: number, now: string | number | Date): number | null;
export function dayState(counters: DayCounters | undefined): "none" | "up" | "degraded" | "down";
export function daysWithChecks(history: History, id: string, days: number, now: string | number | Date): number;
export function formatUptime(share: number | null | undefined): string | null;
export function describeDay(counters: DayCounters | undefined): string;
export function sinceText(at: string | number | Date, now?: string | number | Date): string | null;
export function durationText(fromAt: string | number | Date, toAt: string | number | Date): string;
export function listOf(names: readonly string[]): string;
export function overallDetail(components: Pick<ComponentStatus, "name" | "state">[]): string;
export function parseFrontMatter(text: string): { fields: Record<string, string>; body: string };
export function parseIncident(slug: string, text: string): { incident: Incident | null; problems: string[] };
export function sortIncidents(list: Incident[]): Incident[];

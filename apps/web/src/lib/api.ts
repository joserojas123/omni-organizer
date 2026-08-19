import type { Area, Objective, Task } from "@omni-organizer/shared";
import { AREAS_KEY, OBJECTIVES_KEY, STORE_KEY, buildSeed } from "./seed";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

export const hasBackend = Boolean(API_URL);

/** Everything the home screen needs, in one shot. */
export interface Snapshot {
  areas: Area[];
  tasks: Task[];
  objectives: Objective[];
}

/* ── localStorage (fallback + offline cache) ─────────────────────────────── */

function readLocal<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as T[]) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* storage unavailable */
  }
  return null;
}

function writeLocalKey<T>(key: string, rows: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* no space / unavailable */
  }
}

export function writeLocal(snap: Snapshot): void {
  writeLocalKey(AREAS_KEY, snap.areas);
  writeLocalKey(STORE_KEY, snap.tasks);
  writeLocalKey(OBJECTIVES_KEY, snap.objectives);
}

/* ── API ─────────────────────────────────────────────────────────────────── */

async function getJson<T>(path: string): Promise<T[] | null> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) return null;
  const rows = (await res.json()) as T[];
  return Array.isArray(rows) ? rows : null;
}

/**
 * Loads areas, tasks and objectives. With a backend configured it fetches from
 * the API and caches locally; otherwise it falls back to localStorage, and
 * finally to the (empty) seed.
 */
export async function loadAll(): Promise<Snapshot> {
  if (hasBackend) {
    try {
      const [areas, tasks, objectives] = await Promise.all([
        getJson<Area>("/areas"),
        getJson<Task>("/tasks"),
        getJson<Objective>("/objectives"),
      ]);
      if (areas && tasks && objectives) {
        const snap = { areas, tasks, objectives };
        writeLocal(snap);
        return snap;
      }
    } catch {
      /* offline — fall through to the local cache */
    }
  }
  const local = {
    areas: readLocal<Area>(AREAS_KEY),
    tasks: readLocal<Task>(STORE_KEY),
    objectives: readLocal<Objective>(OBJECTIVES_KEY),
  };
  if (local.areas || local.tasks || local.objectives)
    return {
      areas: local.areas ?? [],
      tasks: local.tasks ?? [],
      objectives: local.objectives ?? [],
    };
  return buildSeed();
}

function changed<T extends { id: string }>(a: T, b: T | undefined): boolean {
  return !b || JSON.stringify(a) !== JSON.stringify(b);
}

async function send(path: string, method: string, body?: unknown): Promise<void> {
  await fetch(`${API_URL}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

/**
 * Persists the whole snapshot. Tasks still sync wholesale (the canvas mutates
 * the graph as a unit); areas and objectives reconcile against the previously
 * saved snapshot so each one uses its own REST endpoint.
 *
 * The order matters and is not arbitrary:
 *   1. areas created/updated — a project's FK needs its area to exist already;
 *   2. tasks replaced wholesale;
 *   3. objectives created/updated/deleted;
 *   4. areas deleted last — the API rejects an area that still has content, so
 *      its projects and objectives must be gone by now.
 */
export async function saveAll(next: Snapshot, prev: Snapshot | null): Promise<void> {
  writeLocal(next);
  if (!hasBackend) return;

  const before = prev ?? { areas: [], tasks: [], objectives: [] };
  const prevAreas = new Map(before.areas.map((a) => [a.id, a]));
  const prevObjectives = new Map(before.objectives.map((o) => [o.id, o]));
  const nextAreaIds = new Set(next.areas.map((a) => a.id));
  const nextObjectiveIds = new Set(next.objectives.map((o) => o.id));

  try {
    for (const area of next.areas) {
      const old = prevAreas.get(area.id);
      if (!old) await send("/areas", "POST", area);
      else if (changed(area, old))
        await send(`/areas/${area.id}`, "PATCH", {
          name: area.name,
          description: area.description,
          modifiedAt: area.modifiedAt,
        });
    }

    await send("/tasks", "PUT", { tasks: next.tasks });

    for (const obj of next.objectives) {
      const old = prevObjectives.get(obj.id);
      if (!old) await send("/objectives", "POST", obj);
      else if (changed(obj, old))
        await send(`/objectives/${obj.id}`, "PATCH", {
          name: obj.name,
          nameHtml: obj.nameHtml ?? null,
          status: obj.status,
          linkedProjectIds: obj.linkedProjectIds,
          favorite: obj.favorite,
          modifiedAt: obj.modifiedAt,
        });
    }
    for (const obj of before.objectives)
      if (!nextObjectiveIds.has(obj.id))
        await send(`/objectives/${obj.id}`, "DELETE");

    for (const area of before.areas)
      if (!nextAreaIds.has(area.id)) await send(`/areas/${area.id}`, "DELETE");
  } catch {
    /* offline — the local cache still holds the latest */
  }
}

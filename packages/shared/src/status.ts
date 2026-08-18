/**
 * The four task statuses. This is the ONLY place color enters the product — a
 * small dot next to a task communicates its state and nothing else.
 * (Mirrors STATUS_META from the Claude Design "Task designer" export.)
 */
export const TASK_STATUSES = [
  "pendiente",
  "en_progreso",
  "bloqueada",
  "completada",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface StatusMeta {
  /** Soft background tint used behind the editor canvas. */
  tint: string;
  /** Sentence-case label shown to the user. */
  label: string;
  /** Dot / accent color for the status. */
  color: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  pendiente: { tint: "#e6e6e2", label: "Pendiente", color: "#9ca3af" },
  en_progreso: { tint: "#dbe6f8", label: "En progreso", color: "#3b82f6" },
  bloqueada: { tint: "#f9dcdc", label: "Bloqueada", color: "#ef4444" },
  completada: { tint: "#d9ecd9", label: "Completada", color: "#22c55e" },
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (TASK_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The three objective statuses. An objective's status is ALWAYS set by hand: it
 * is never derived from the progress of the projects linked to it, and every
 * transition between the three is valid (a `logrado` objective can be reopened
 * back to `activo`).
 *
 * Colors reuse the task palette as-is — no new color enters the product.
 */
export const OBJECTIVE_STATUSES = ["activo", "logrado", "fallido"] as const;

export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const OBJECTIVE_STATUS_META: Record<ObjectiveStatus, StatusMeta> = {
  activo: { tint: "#dbe6f8", label: "Activo", color: "#3b82f6" },
  logrado: { tint: "#d9ecd9", label: "Logrado", color: "#22c55e" },
  fallido: { tint: "#f9dcdc", label: "Fallido", color: "#ef4444" },
};

export function isObjectiveStatus(value: unknown): value is ObjectiveStatus {
  return (
    typeof value === "string" &&
    (OBJECTIVE_STATUSES as readonly string[]).includes(value)
  );
}

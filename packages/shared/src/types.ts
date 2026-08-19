import type { ObjectiveStatus, TaskStatus } from "./status";

/**
 * The ceiling of the hierarchy: a permanent scope of life or work ("Salud",
 * "Finanzas", "AxelyaLabs").
 *
 * An Area never contains another Area, has no status (it is never completed,
 * only maintained or neglected) and cannot be deleted while it still holds
 * projects or objectives — there is no cascade and no reassignment.
 */
export interface Area {
  id: string;
  name: string;
  /** Short optional description, shown under the name. */
  description: string | null;
  /** Epoch millis of last modification — the area dropdown sorts by this, desc. */
  modifiedAt: number;
}

/**
 * The single canvas entity. Everything on a canvas is a Task; tasks relate to
 * each other only by:
 *  - composition (nesting) via `parentId` — a task has at most one parent;
 *  - sequence via `seqNext` — a task can precede others with an arrow.
 *
 * A task with `parentId === null` is a **Project**: the root of a canvas and
 * the only kind of task that belongs directly to an Area. A Project is not a
 * new entity — it is this same model plus a mandatory, immutable `areaId`.
 */
export interface Task {
  id: string;
  name: string;
  /** Author-set status. The *displayed* status may be derived (see engine). */
  status: TaskStatus;
  favorite: boolean;
  /** Epoch millis of last modification — the home list sorts by this, desc. */
  modifiedAt: number;
  parentId: string | null;
  /**
   * Short optional description. Only Projects ever get one: they are the only
   * task the editor opens, and it is edited there, under the name. Nested tasks
   * leave it null.
   */
  description?: string | null;
  /**
   * Owning Area. Mandatory and immutable on Projects (`parentId === null`);
   * null on nested tasks, which inherit the Area of the Project at the top of
   * their ancestor chain.
   */
  areaId?: string | null;
  /** IDs this task points to in sequence (outgoing arrows). */
  seqNext: string[];
  /** Position within the parent's content box (canvas coordinates). */
  x: number;
  y: number;
  collapsed: boolean;
  /** Optional manual minimum size when a container was resized by hand. */
  minW?: number | null;
  minH?: number | null;
  /** Optional rich-text HTML for the name (used only when it contains links). */
  nameHtml?: string | null;
}

/**
 * A desired outcome inside an Area. It lives in its own collection and never on
 * a canvas: no `parentId`, no coordinates, no `seqNext`, no `collapsed`.
 *
 * The link to the projects that contribute to it is stored on one side only —
 * here, in `linkedProjectIds` — the same convention `seqNext` follows.
 */
export interface Objective {
  id: string;
  name: string;
  /** Optional rich-text HTML for the name (used only when it contains links). */
  nameHtml?: string | null;
  /** Owning Area. Mandatory and immutable after creation. */
  areaId: string;
  /** Always set by hand; never derived from the linked projects' progress. */
  status: ObjectiveStatus;
  /** IDs of the root-level Projects that contribute to this objective. */
  linkedProjectIds: string[];
  favorite: boolean;
  modifiedAt: number;
}

/** Payload the web app sends to persist the full task graph. */
export interface SyncTasksPayload {
  tasks: Task[];
}

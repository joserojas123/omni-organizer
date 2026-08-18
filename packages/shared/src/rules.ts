/**
 * Domain rules for Areas, Projects and Objectives.
 *
 * These live in `shared` on purpose: the API enforces them and the web UI only
 * *reflects* them (a disabled button, a red drag line). Neither side may skip a
 * check by rendering its way around it.
 *
 * Every function returns `null` when the operation is allowed, or a
 * ready-to-show Spanish reason when it is not — the same string the interface
 * uses to explain itself.
 */
import type { Area, Objective, Task } from "./types";

/** A Project is a root-level task. Nothing else distinguishes it. */
export function isProject(task: Pick<Task, "parentId">): boolean {
  return task.parentId === null;
}

/** Walks up the ancestor chain; the chain of a Task always ends in a Project. */
export function projectOf(tasks: Task[], id: string): Task | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  let cur = byId.get(id) ?? null;
  while (cur && cur.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId) ?? null;
  }
  return cur && isProject(cur) ? cur : null;
}

/** The Area a task belongs to, inherited from the Project at the top. */
export function areaOfTask(tasks: Task[], id: string): string | null {
  return projectOf(tasks, id)?.areaId ?? null;
}

/** Follows `seqNext` forward: is `bId` reachable from `aId`? Used for cycles. */
export function canReach(tasks: Task[], aId: string, bId: string): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [aId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === bId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (byId.get(cur)?.seqNext ?? []).forEach((n) => stack.push(n));
  }
  return false;
}

/**
 * Project → Project sequence. It carries order, never blocking (see
 * `statusResolver`): a project behind another is still perfectly workable.
 * Both ends must be root projects of the same Area, and a cycle is meaningless
 * even when it blocks nothing.
 */
export function canLinkProjects(
  tasks: Task[],
  sourceId: string,
  targetId: string,
): string | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return "El proyecto no existe.";
  if (sourceId === targetId) return "Un proyecto no puede precederse a sí mismo.";
  if (!isProject(source) || !isProject(target))
    return "La secuencia entre proyectos solo enlaza proyectos raíz.";
  if (source.areaId !== target.areaId)
    return "Los dos proyectos deben pertenecer a la misma área.";
  if (canReach(tasks, targetId, sourceId))
    return "Ese enlace crearía un ciclo entre proyectos.";
  return null;
}

/**
 * Objective ↔ Project link. Many-to-many, binary (no weights), and never
 * across Areas. Only root Projects qualify: a nested Task can never be linked,
 * so validating this never has to walk a project's inner tree.
 */
export function canLinkObjective(
  objective: Pick<Objective, "areaId">,
  project: Pick<Task, "parentId" | "areaId"> | undefined,
): string | null {
  if (!project) return "El proyecto no existe.";
  if (!isProject(project))
    return "Un objetivo solo se vincula con proyectos, no con tareas anidadas.";
  if (project.areaId !== objective.areaId)
    return "El proyecto y el objetivo deben pertenecer a la misma área.";
  return null;
}

/**
 * An Area with content is never deleted: no cascade, no reassignment. The
 * caller shows this reason as-is.
 */
export function canDeleteArea(
  areaId: string,
  tasks: Pick<Task, "parentId" | "areaId">[],
  objectives: Pick<Objective, "areaId">[],
): string | null {
  const projects = tasks.filter((t) => isProject(t) && t.areaId === areaId).length;
  const objs = objectives.filter((o) => o.areaId === areaId).length;
  if (!projects && !objs) return null;
  const parts: string[] = [];
  if (projects) parts.push(`${projects} proyecto${projects > 1 ? "s" : ""}`);
  if (objs) parts.push(`${objs} objetivo${objs > 1 ? "s" : ""}`);
  return `No se puede eliminar un área con contenido: todavía tiene ${parts.join(
    " y ",
  )}. Elimina o vacía su contenido primero.`;
}

/**
 * `parentId: null` without an `areaId` is no longer a valid state. Nested tasks
 * must NOT carry one — their Area comes from their Project.
 */
export function checkTaskArea(
  task: Pick<Task, "parentId" | "areaId">,
  areas: Pick<Area, "id">[],
): string | null {
  if (!isProject(task)) return null;
  if (!task.areaId) return "Un proyecto necesita un área.";
  if (!areas.some((a) => a.id === task.areaId))
    return "El área indicada no existe.";
  return null;
}

/**
 * Deleting a Project must clear its id from every objective that references it
 * — the same cleanup already applied to `seqNext`. Returns a new array only
 * when something actually changed.
 */
export function detachProjects(
  objectives: Objective[],
  removedIds: Set<string> | string[],
): Objective[] {
  const gone = removedIds instanceof Set ? removedIds : new Set(removedIds);
  let touched = false;
  const next = objectives.map((o) => {
    const keep = (o.linkedProjectIds || []).filter((id) => !gone.has(id));
    if (keep.length === o.linkedProjectIds.length) return o;
    touched = true;
    return { ...o, linkedProjectIds: keep };
  });
  return touched ? next : objectives;
}

/**
 * How many of an objective's linked projects are done. Purely informative — it
 * never moves the objective's status, which is only ever set by hand.
 */
export function objectiveProgress(
  objective: Objective,
  isProjectComplete: (projectId: string) => boolean,
): { done: number; total: number } {
  const ids = objective.linkedProjectIds || [];
  return { done: ids.filter(isProjectComplete).length, total: ids.length };
}

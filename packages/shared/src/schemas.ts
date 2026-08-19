import { z } from "zod";
import { OBJECTIVE_STATUSES, TASK_STATUSES } from "./status";
import { sanitizeNameHtml } from "./nameHtml";

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const objectiveStatusSchema = z.enum(OBJECTIVE_STATUSES);

const nameHtmlSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => sanitizeNameHtml(v));

/* ── Area ──────────────────────────────────────────────────────────────── */

export const areaSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable().optional().transform((v) => v ?? null),
  modifiedAt: z.number().int().nonnegative(),
});

/** PATCH /api/areas/:id — `areaId` has no equivalent here; an Area has no parent. */
export const areaPatchSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    modifiedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

/* ── Task ──────────────────────────────────────────────────────────────── */

export const taskSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: taskStatusSchema,
  favorite: z.boolean(),
  modifiedAt: z.number().int().nonnegative(),
  parentId: z.string().nullable(),
  description: z.string().nullable().optional().transform((v) => v ?? null),
  // Nullable in the schema because nested tasks have none; the "a root task
  // always has an area" rule is enforced in the domain layer (checkTaskArea),
  // which is the only place that can see the whole graph.
  areaId: z.string().nullable().optional().transform((v) => v ?? null),
  seqNext: z.array(z.string()),
  x: z.number(),
  y: z.number(),
  collapsed: z.boolean(),
  minW: z.number().nullable().optional(),
  minH: z.number().nullable().optional(),
  nameHtml: nameHtmlSchema,
});

export const syncTasksSchema = z.object({
  tasks: z.array(taskSchema),
});

/* ── Objective ─────────────────────────────────────────────────────────── */

export const objectiveSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  nameHtml: nameHtmlSchema,
  areaId: z.string().min(1),
  status: objectiveStatusSchema,
  linkedProjectIds: z.array(z.string()),
  favorite: z.boolean(),
  modifiedAt: z.number().int().nonnegative(),
});

/**
 * PATCH /api/objectives/:id. `areaId` is deliberately absent: an objective
 * never moves between areas, so the API gives no way to try.
 */
export const objectivePatchSchema = z
  .object({
    name: z.string().optional(),
    nameHtml: nameHtmlSchema,
    status: objectiveStatusSchema.optional(),
    linkedProjectIds: z.array(z.string()).optional(),
    favorite: z.boolean().optional(),
    modifiedAt: z.number().int().nonnegative().optional(),
  })
  .strict();

export type AreaInput = z.infer<typeof areaSchema>;
export type AreaPatchInput = z.infer<typeof areaPatchSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type SyncTasksInput = z.infer<typeof syncTasksSchema>;
export type ObjectiveInput = z.infer<typeof objectiveSchema>;
export type ObjectivePatchInput = z.infer<typeof objectivePatchSchema>;

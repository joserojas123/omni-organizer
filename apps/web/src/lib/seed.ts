import type { Area, Objective, Task } from "@omni-organize/shared";

/**
 * The app starts completely empty: no default area is ever created. The home
 * screen has a dedicated empty state for exactly this case (see HomeScreen),
 * so seeding anything here would only get in the way.
 */
export function buildSeed(): {
  areas: Area[];
  tasks: Task[];
  objectives: Objective[];
} {
  return { areas: [], tasks: [], objectives: [] };
}

export const AREAS_KEY = "omni-organize:areas:v1";
export const STORE_KEY = "omni-organize:tasks:v1";
export const OBJECTIVES_KEY = "omni-organize:objectives:v1";

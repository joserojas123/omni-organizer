import type { Area, Objective, Task } from "@omni-organizer/shared";

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

export const AREAS_KEY = "omni-organizer:areas:v1";
export const STORE_KEY = "omni-organizer:tasks:v1";
export const OBJECTIVES_KEY = "omni-organizer:objectives:v1";

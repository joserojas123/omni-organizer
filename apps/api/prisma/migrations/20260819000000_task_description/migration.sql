-- AlterTable
-- Short optional description for a task. In practice only Projects carry one:
-- they are the only task the editor opens, and it is edited there under the
-- name. Nested tasks leave it NULL.
ALTER TABLE "tasks" ADD COLUMN "description" TEXT;

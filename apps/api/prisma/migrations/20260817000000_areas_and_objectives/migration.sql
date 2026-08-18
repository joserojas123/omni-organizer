-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sin nombre',
    "description" TEXT,
    "modified_at" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objectives" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sin nombre',
    "name_html" TEXT,
    "area_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "linked_project_ids" TEXT[],
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "modified_at" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "objectives_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "area_id" TEXT;

-- Backfill: a root task without an area is no longer a valid state. On an empty
-- database (the documented default) this does nothing; on a database that
-- already holds root tasks it parks them in one migration area rather than
-- guessing where they belong.
DO $$
DECLARE
    fallback_area_id TEXT := 'area_migracion_inicial';
BEGIN
    IF EXISTS (SELECT 1 FROM "tasks" WHERE "parent_id" IS NULL AND "area_id" IS NULL) THEN
        INSERT INTO "areas" ("id", "name", "description", "modified_at", "created_at", "updated_at")
        VALUES (
            fallback_area_id,
            'Área sin clasificar',
            'Creada por la migración para alojar los proyectos que existían antes de las áreas.',
            (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT ("id") DO NOTHING;

        UPDATE "tasks"
        SET "area_id" = fallback_area_id
        WHERE "parent_id" IS NULL AND "area_id" IS NULL;
    END IF;
END $$;

-- CreateIndex
CREATE INDEX "tasks_area_id_idx" ON "tasks"("area_id");

-- CreateIndex
CREATE INDEX "objectives_area_id_idx" ON "objectives"("area_id");

-- AddForeignKey
-- RESTRICT on both sides: an area holding projects or objectives is never
-- deleted, and there is no cascade to fall back on.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

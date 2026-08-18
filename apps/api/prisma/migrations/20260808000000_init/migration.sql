-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sin nombre',
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "modified_at" BIGINT NOT NULL,
    "parent_id" TEXT,
    "seq_next" TEXT[],
    "x" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "collapsed" BOOLEAN NOT NULL DEFAULT false,
    "min_w" DOUBLE PRECISION,
    "min_h" DOUBLE PRECISION,
    "name_html" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_parent_id_idx" ON "tasks"("parent_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

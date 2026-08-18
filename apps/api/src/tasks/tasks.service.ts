import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Task as TaskDto, TaskInput } from "@omni-organize/shared";
import { canLinkProjects, checkTaskArea, isProject } from "@omni-organize/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { Task as PrismaTask } from "@prisma/client";

/** Maps a Prisma row (BigInt modifiedAt) to the shared JSON-friendly Task. */
function toDto(row: PrismaTask): TaskDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status as TaskDto["status"],
    favorite: row.favorite,
    modifiedAt: Number(row.modifiedAt),
    parentId: row.parentId,
    areaId: row.areaId,
    seqNext: row.seqNext,
    x: row.x,
    y: row.y,
    collapsed: row.collapsed,
    minW: row.minW,
    minH: row.minH,
    nameHtml: row.nameHtml,
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<TaskDto[]> {
    const rows = await this.prisma.task.findMany({
      orderBy: { modifiedAt: "desc" },
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<TaskDto> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Task ${id} not found`);
    return toDto(row);
  }

  /**
   * Replaces the entire task graph with the provided set. The editor mutates the
   * whole graph locally (nesting, sequencing, layout) and syncs it wholesale, so
   * a transactional replace keeps the server a faithful mirror of the canvas.
   * Parents are written before children to satisfy the self-relation FK.
   *
   * Projects deleted along the way are also pulled out of every objective that
   * still points at them — the same cleanup `seqNext` gets on the client.
   */
  async sync(tasks: TaskInput[]): Promise<TaskDto[]> {
    await this.assertGraph(tasks);
    const ordered = orderByDepth(tasks);

    await this.prisma.$transaction([
      this.prisma.task.deleteMany({}),
      ...ordered.map((t) =>
        this.prisma.task.create({
          data: {
            id: t.id,
            name: t.name,
            status: t.status,
            favorite: t.favorite,
            modifiedAt: BigInt(t.modifiedAt),
            parentId: t.parentId,
            // Only projects carry an area; nested tasks inherit it from the
            // project above them, so storing one there would be a second,
            // divergeable source of truth.
            areaId: isProject(t) ? t.areaId : null,
            seqNext: t.seqNext,
            x: t.x,
            y: t.y,
            collapsed: t.collapsed,
            minW: t.minW ?? null,
            minH: t.minH ?? null,
            nameHtml: t.nameHtml ?? null,
          },
        }),
      ),
    ]);

    await this.detachMissingProjects();
    return this.findAll();
  }

  async create(input: TaskInput): Promise<TaskDto> {
    const existing = await this.prisma.task.findMany();
    await this.assertGraph([...existing.map(toDto), input]);
    const row = await this.prisma.task.create({
      data: {
        id: input.id,
        name: input.name,
        status: input.status,
        favorite: input.favorite,
        modifiedAt: BigInt(input.modifiedAt),
        parentId: input.parentId,
        areaId: isProject(input) ? input.areaId : null,
        seqNext: input.seqNext,
        x: input.x,
        y: input.y,
        collapsed: input.collapsed,
        minW: input.minW ?? null,
        minH: input.minH ?? null,
        nameHtml: input.nameHtml ?? null,
      },
    });
    return toDto(row);
  }

  /** Deleting cascades to nested tasks and clears the id from every objective. */
  async remove(id: string): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
    await this.detachMissingProjects();
  }

  /**
   * The two graph-wide rules the schema cannot express on its own: a root task
   * always has a real area, and a project sequence stays inside one area and
   * never closes a cycle.
   */
  private async assertGraph(tasks: TaskDto[]): Promise<void> {
    const areas = await this.prisma.area.findMany({ select: { id: true } });
    for (const t of tasks) {
      const reason = checkTaskArea(t, areas);
      if (reason) throw new BadRequestException(`${reason} (tarea ${t.id})`);
    }
    for (const t of tasks) {
      if (!isProject(t)) continue;
      for (const next of t.seqNext) {
        const reason = canLinkProjects(tasks, t.id, next);
        if (reason) throw new BadRequestException(reason);
      }
    }
  }

  /**
   * Drops from `linkedProjectIds` every id that is no longer a root project.
   * Runs after any delete/replace, so an objective can never keep a dangling
   * link.
   */
  private async detachMissingProjects(): Promise<void> {
    const [projects, objectives] = await Promise.all([
      this.prisma.task.findMany({
        where: { parentId: null },
        select: { id: true },
      }),
      this.prisma.objective.findMany({
        select: { id: true, linkedProjectIds: true },
      }),
    ]);
    const alive = new Set(projects.map((p) => p.id));
    await Promise.all(
      objectives
        .map((o) => ({
          id: o.id,
          keep: o.linkedProjectIds.filter((id) => alive.has(id)),
          before: o.linkedProjectIds.length,
        }))
        .filter((o) => o.keep.length !== o.before)
        .map((o) =>
          this.prisma.objective.update({
            where: { id: o.id },
            data: { linkedProjectIds: o.keep },
          }),
        ),
    );
  }
}

/** Roots first, then children — so FK-referenced parents always exist on insert. */
function orderByDepth(tasks: TaskInput[]): TaskInput[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = (t: TaskInput): number => {
    let d = 0;
    let cur: TaskInput | undefined = t;
    const seen = new Set<string>();
    while (cur?.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
      d += 1;
    }
    return d;
  };
  return [...tasks].sort((a, b) => depth(a) - depth(b));
}

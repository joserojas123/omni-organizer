import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  Area as AreaDto,
  AreaInput,
  AreaPatchInput,
} from "@omni-organizer/shared";
import { canDeleteArea } from "@omni-organizer/shared";
import type { Area as PrismaArea } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Maps a Prisma row (BigInt modifiedAt) to the shared JSON-friendly Area. */
function toDto(row: PrismaArea): AreaDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    modifiedAt: Number(row.modifiedAt),
  };
}

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<AreaDto[]> {
    const rows = await this.prisma.area.findMany({
      orderBy: { modifiedAt: "desc" },
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<AreaDto> {
    const row = await this.prisma.area.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Area ${id} not found`);
    return toDto(row);
  }

  async create(input: AreaInput): Promise<AreaDto> {
    const row = await this.prisma.area.create({
      data: {
        id: input.id,
        name: input.name,
        description: input.description,
        modifiedAt: BigInt(input.modifiedAt),
      },
    });
    return toDto(row);
  }

  /** Renames / edits the description. An area has nothing else to change. */
  async update(id: string, patch: AreaPatchInput): Promise<AreaDto> {
    await this.findOne(id);
    const row = await this.prisma.area.update({
      where: { id },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.description === undefined
          ? {}
          : { description: patch.description }),
        modifiedAt: BigInt(patch.modifiedAt ?? Date.now()),
      },
    });
    return toDto(row);
  }

  /**
   * Refuses an area that still holds projects or objectives, and answers with
   * the reason — there is no cascade and no reassignment on purpose.
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const [tasks, objectives] = await Promise.all([
      this.prisma.task.findMany({
        where: { areaId: id },
        select: { parentId: true, areaId: true },
      }),
      this.prisma.objective.findMany({
        where: { areaId: id },
        select: { areaId: true },
      }),
    ]);
    const reason = canDeleteArea(id, tasks, objectives);
    if (reason) throw new ConflictException(reason);
    await this.prisma.area.delete({ where: { id } });
  }
}

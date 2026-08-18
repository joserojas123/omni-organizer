import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Objective as ObjectiveDto,
  ObjectiveInput,
  ObjectivePatchInput,
} from "@omni-organize/shared";
import { canLinkObjective } from "@omni-organize/shared";
import type { Objective as PrismaObjective } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Maps a Prisma row (BigInt modifiedAt) to the shared JSON-friendly Objective. */
function toDto(row: PrismaObjective): ObjectiveDto {
  return {
    id: row.id,
    name: row.name,
    nameHtml: row.nameHtml,
    areaId: row.areaId,
    status: row.status as ObjectiveDto["status"],
    linkedProjectIds: row.linkedProjectIds,
    favorite: row.favorite,
    modifiedAt: Number(row.modifiedAt),
  };
}

@Injectable()
export class ObjectivesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ObjectiveDto[]> {
    const rows = await this.prisma.objective.findMany({
      orderBy: { modifiedAt: "desc" },
    });
    return rows.map(toDto);
  }

  async findOne(id: string): Promise<ObjectiveDto> {
    const row = await this.prisma.objective.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Objective ${id} not found`);
    return toDto(row);
  }

  async create(input: ObjectiveInput): Promise<ObjectiveDto> {
    await this.assertArea(input.areaId);
    await this.assertLinks(input.areaId, input.linkedProjectIds);
    const row = await this.prisma.objective.create({
      data: {
        id: input.id,
        name: input.name,
        nameHtml: input.nameHtml ?? null,
        areaId: input.areaId,
        status: input.status,
        linkedProjectIds: input.linkedProjectIds,
        favorite: input.favorite,
        modifiedAt: BigInt(input.modifiedAt),
      },
    });
    return toDto(row);
  }

  /**
   * Status, name, favorite and links. `areaId` is absent from the patch schema:
   * an objective never moves between areas, so there is nothing to check here.
   * Any of the three statuses is accepted from any other — reopening a
   * `logrado` or `fallido` objective is a normal operation, not an exception.
   */
  async update(id: string, patch: ObjectivePatchInput): Promise<ObjectiveDto> {
    const current = await this.findOne(id);
    if (patch.linkedProjectIds)
      await this.assertLinks(current.areaId, patch.linkedProjectIds);
    const row = await this.prisma.objective.update({
      where: { id },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.nameHtml === undefined ? {} : { nameHtml: patch.nameHtml }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.linkedProjectIds === undefined
          ? {}
          : { linkedProjectIds: patch.linkedProjectIds }),
        ...(patch.favorite === undefined ? {} : { favorite: patch.favorite }),
        modifiedAt: BigInt(patch.modifiedAt ?? Date.now()),
      },
    });
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.objective.delete({ where: { id } });
  }

  private async assertArea(areaId: string): Promise<void> {
    const area = await this.prisma.area.findUnique({ where: { id: areaId } });
    if (!area)
      throw new BadRequestException("Un objetivo necesita un área existente.");
  }

  /**
   * Every linked id must be a root project of the objective's own area. Nested
   * tasks are rejected here too, so the rule cannot be bypassed by calling the
   * API directly.
   */
  private async assertLinks(areaId: string, projectIds: string[]): Promise<void> {
    const unique = [...new Set(projectIds)];
    if (!unique.length) return;
    const rows = await this.prisma.task.findMany({
      where: { id: { in: unique } },
      select: { id: true, parentId: true, areaId: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of unique) {
      const reason = canLinkObjective({ areaId }, byId.get(id));
      if (reason) throw new BadRequestException(reason);
    }
  }
}

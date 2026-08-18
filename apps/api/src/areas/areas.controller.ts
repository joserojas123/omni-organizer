import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  areaPatchSchema,
  areaSchema,
  type AreaInput,
  type AreaPatchInput,
} from "@omni-organize/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AreasService } from "./areas.service";

@Controller("areas")
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  findAll() {
    return this.areas.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.areas.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(areaSchema)) body: AreaInput) {
    return this.areas.create(body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(areaPatchSchema)) body: AreaPatchInput,
  ) {
    return this.areas.update(id, body);
  }

  /** Fails with 409 and an explanation when the area still has content. */
  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.areas.remove(id);
  }
}

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
  objectivePatchSchema,
  objectiveSchema,
  type ObjectiveInput,
  type ObjectivePatchInput,
} from "@omni-organizer/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ObjectivesService } from "./objectives.service";

@Controller("objectives")
export class ObjectivesController {
  constructor(private readonly objectives: ObjectivesService) {}

  @Get()
  findAll() {
    return this.objectives.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.objectives.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(objectiveSchema)) body: ObjectiveInput) {
    return this.objectives.create(body);
  }

  /** Status, name, favorite and `linkedProjectIds`. Never the area. */
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(objectivePatchSchema)) body: ObjectivePatchInput,
  ) {
    return this.objectives.update(id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.objectives.remove(id);
  }
}

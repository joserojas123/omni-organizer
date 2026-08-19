import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UsePipes,
} from "@nestjs/common";
import {
  syncTasksSchema,
  taskSchema,
  type SyncTasksInput,
  type TaskInput,
} from "@omni-organizer/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  findAll() {
    return this.tasks.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.tasks.findOne(id);
  }

  /** Replace the whole graph (the canvas syncs wholesale). */
  @Put()
  @UsePipes(new ZodValidationPipe(syncTasksSchema))
  sync(@Body() body: SyncTasksInput) {
    return this.tasks.sync(body.tasks);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(taskSchema))
  create(@Body() body: TaskInput) {
    return this.tasks.create(body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.tasks.remove(id);
  }
}

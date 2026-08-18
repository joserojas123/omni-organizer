import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { AreasModule } from "./areas/areas.module";
import { ObjectivesModule } from "./objectives/objectives.module";
import { TasksModule } from "./tasks/tasks.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [PrismaModule, AreasModule, ObjectivesModule, TasksModule],
  controllers: [HealthController],
})
export class AppModule {}

import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger("Bootstrap").log(`Omni organize API listening on :${port}/api`);
}

void bootstrap();

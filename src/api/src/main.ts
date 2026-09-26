import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, mountOpenApi } from './app.setup.js';
import { AppConfig } from './core/config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  mountOpenApi(app);
  const { port } = app.get(AppConfig);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Evenhand API listening on :${port} (docs at /api/docs)`, 'Bootstrap');
}

await bootstrap();

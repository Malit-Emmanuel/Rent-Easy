import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true }); // raw body needed for vendor signature checks
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

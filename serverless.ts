import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

type ExpressLike = (req: any, res: any) => void;
let cached: Promise<ExpressLike> | undefined;

async function bootstrap(): Promise<ExpressLike> {
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ['log', 'warn', 'error'] });
  configureApp(app);
  await app.init();                                   // no listen(): the platform owns the socket
  return app.getHttpAdapter().getInstance();
}

/** Vercel function entry. The Nest app is built once per warm instance and reused across requests. */
export default async function handler(req: any, res: any) {
  try {
    cached ??= bootstrap();
    (await cached)(req, res);
  } catch (e) {
    cached = undefined;                               // retry on the next request instead of caching a failure
    res.statusCode = 500; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ statusCode: 500, message: 'Service unavailable' }));
    console.error('bootstrap failed', (e as Error).message);
  }
}

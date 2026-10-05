import { INestApplication } from '@nestjs/common';

/** Shared by the long-running server (main.ts) and the serverless handler. */
export function configureApp(app: INestApplication) {
  const origins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins?.length ? origins : false, credentials: false });
}

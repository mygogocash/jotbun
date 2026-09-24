import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // rawBody preserves the unparsed buffer on request.rawBody for the
    // Salt Edge callback signature check.
    rawBody: true,
  });
  app.use(helmet());
  // Body size limits — file uploads use Multer (multipart), unaffected by this.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '256kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
    }),
  );
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: [...DEFAULT_CORS_ORIGINS, ...extra] });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[REQ] ${req.method} ${req.originalUrl || req.url}`);
    }
    next();
  });
  const port = Number(process.env.PORT ?? 8090);
  await app.listen(port);
}

void bootstrap();

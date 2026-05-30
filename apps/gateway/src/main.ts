import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppConfig } from './core/config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // The web PWA (Vite, :5173) calls the gateway cross-origin.
  app.enableCors({ origin: true, credentials: true });

  // Validate + strip unknown fields on every DTO at the controller boundary.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });

  await app.listen(port);
  Logger.log(`HPHII gateway listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();

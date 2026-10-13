import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './config/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableShutdownHooks();
  configureApp(app);

  try {
    const config = app.get(ConfigService);
    await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
  } catch (error) {
    await app.close();
    throw error;
  }
}

bootstrap().catch(() => {
  Logger.error(
    'Backend startup failed. Check configuration and database availability.',
    'Bootstrap',
  );
  process.exitCode = 1;
});

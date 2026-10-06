import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { SanitizedLogger } from './common/sanitized-logger';
import { AppModule } from './app.module';
import { requireDatabaseCredentials, validateEnvironment, Environment } from './config/environment';
import { configureApp } from './common/configure-app';
async function bootstrap() {
  config({ quiet: true });
  const env = validateEnvironment(process.env);
  requireDatabaseCredentials(env);
  const levels = ['fatal','error','warn','log','debug','verbose'] as const;
  const app = await NestFactory.create(AppModule,{ abortOnError: false, logger: new SanitizedLogger(levels.slice(0,levels.indexOf(env.LOG_LEVEL) + 1)) });
  const configuration = app.get(ConfigService<Environment,true>);
  configureApp(app,configuration);
  app.enableShutdownHooks();
  await app.listen(env.PORT,env.APP_HOST);
}
bootstrap().catch(() => { console.error('No se pudo iniciar la API. Verifica variables de entorno y disponibilidad de MariaDB; no se muestran credenciales.'); process.exitCode = 1; });

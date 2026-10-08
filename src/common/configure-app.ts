import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { Environment } from '../config/environment';
import { HttpExceptionFilter } from './http-exception.filter';
export function configureApp(app: INestApplication, config: ConfigService<Environment,true>): void {
  app.use(json({ limit: '6mb' }));
  app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }));
  if (config.get('HELMET_ENABLED', { infer: true })) app.use(helmet());
  if (config.get('CORS_ENABLED', { infer: true })) app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }).split(',').filter(Boolean), methods: ['GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE'], credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, validationError: { target: false, value: false } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  if (config.get('SWAGGER_ENABLED', { infer: true }) && config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle(config.get('APP_NAME', { infer: true }))
      .addBearerAuth().setVersion(config.get('API_VERSION', { infer: true })).setDescription('Catálogo IPTV de fuentes públicas y autorizadas. Streams UNKNOWN hasta verificación.').build());
    SwaggerModule.setup(config.get('SWAGGER_PATH', { infer: true }),app,document);
  }
}

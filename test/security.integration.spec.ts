import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { configureApp } from '../src/common/configure-app';
import { ConfigurableThrottlerGuard } from '../src/common/configurable-throttler.guard';
import { Environment, validateEnvironment } from '../src/config/environment';
@Controller('probe')
class ProbeController {
  @Get() get() { return { ok: true }; }
  @Get('error') error() { throw new Error('private-password database-connection token-secret'); }
}
describe('Protecciones HTTP', () => {
  let app: INestApplication; let config: ConfigService<Environment,true>;
  beforeEach(async () => {
    config = new ConfigService(validateEnvironment({ ...{ ...parse(readFileSync('.env.example')), PROVIDER_CREDENTIALS_KEY: Buffer.alloc(32,7).toString('base64') }, SWAGGER_ENABLED: 'false', RATE_LIMIT_MAX: '2' })) as ConfigService<Environment,true>;
    const module = await Test.createTestingModule({ imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 2 }])],
      controllers: [ProbeController], providers: [{ provide: ConfigService, useValue: config },{ provide: APP_GUARD, useClass: ConfigurableThrottlerGuard }] }).compile();
    app = module.createNestApplication(); configureApp(app,config); await app.init();
  });
  afterEach(async () => { await app.close(); });
  it('devuelve 429 al superar el límite y permite desactivarlo explícitamente', async () => {
    await request(app.getHttpServer()).get('/api/probe').expect(200);
    await request(app.getHttpServer()).get('/api/probe').expect(200);
    const limited = await request(app.getHttpServer()).get('/api/probe').expect(429);
    expect(limited.body.statusCode).toBe(429);
    config.set('RATE_LIMIT_ENABLED',false);
    await request(app.getHttpServer()).get('/api/probe').expect(200);
  });
  it('oculta detalles internos y deja Swagger desactivado', async () => {
    const res = await request(app.getHttpServer()).get('/api/probe/error').expect(500);
    expect(res.body.message).toBe('Error interno del servidor');
    expect(JSON.stringify(res.body)).not.toMatch(/password|connection|token|stack/);
    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });
});

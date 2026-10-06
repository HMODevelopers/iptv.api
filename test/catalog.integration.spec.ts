import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import request from 'supertest';
import { Category, Channel, ChannelCategory, ENTITIES, Stream, StreamStatus } from '../src/database/entities';
import { ChannelsModule } from '../src/channels/channels.module';
import { CatalogsModule } from '../src/catalogs/catalogs.module';
import { HealthModule } from '../src/health/health.module';
import { Environment, validateEnvironment } from '../src/config/environment';
import { configureApp } from '../src/common/configure-app';
import { ConfigurableThrottlerGuard } from '../src/common/configurable-throttler.guard';
import { IptvOrgSyncService } from '../src/providers/iptv-org/sync.service';
import { IptvOrgClient } from '../src/providers/iptv-org/iptv-org.client';
import { fixture } from './fixtures';

describe('Integración HTTP + TypeORM + sincronización (SQL.js aislado)', () => {
  let app: INestApplication; let db: DataSource; let service: IptvOrgSyncService;
  const client = { source: 'iptv-org', fetchSnapshot: jest.fn() };
  beforeAll(async () => {
    const env = validateEnvironment({ ...parse(readFileSync('.env.example')), NODE_ENV: 'test', RATE_LIMIT_MAX: '1000' });
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      // Schema sync is exclusively for this ephemeral in-memory test DB.
      TypeOrmModule.forRoot({ type: 'sqljs', entities: ENTITIES, synchronize: true, dropSchema: true, autoSave: false }),
      ChannelsModule,CatalogsModule,HealthModule,
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }]),
    ], providers: [{ provide: APP_GUARD, useClass: ConfigurableThrottlerGuard }] }).compile();
    app = module.createNestApplication();
    const config = app.get(ConfigService<Environment,true>);
    configureApp(app,config); await app.init();
    db = app.get(DataSource);
    service = new IptvOrgSyncService(db,client as unknown as IptvOrgClient,config);
  });
  beforeEach(async () => {
    await db.synchronize(true);
    client.fetchSnapshot.mockResolvedValue(fixture());
    await service.sync();
  });
  afterAll(async () => { if (app) await app.close(); });
  it('sincroniza dos veces sin duplicados y conserva estado de verificación', async () => {
    const stream = await db.getRepository(Stream).findOneByOrFail({ channelId: 1 });
    await db.getRepository(Stream).update(stream.id,{ status: StreamStatus.OFFLINE, lastCheckedAt: new Date() });
    const stats = await service.sync();
    expect(stats).toMatchObject({ processed: 2, created: 0, updated: 2, streams: 2, errors: 0 });
    expect(await db.getRepository(Channel).count()).toBe(2);
    expect(await db.getRepository(Stream).count()).toBe(2);
    expect(await db.getRepository(ChannelCategory).count()).toBe(3);
    expect((await db.getRepository(Stream).findOneByOrFail({ id: stream.id })).status).toBe(StreamStatus.OFFLINE);
  });
  it('elimina canales que pasan a bloqueados y reconcilia streams retirados', async () => {
    const raw = fixture(); raw.blocklist.push({ channel: 'Sports.us', reason: 'dmca' }); raw.streams = [];
    client.fetchSnapshot.mockResolvedValue(raw); await service.sync();
    expect(await db.getRepository(Channel).count()).toBe(1);
    expect(await db.getRepository(Stream).count()).toBe(0);
    expect(await db.getRepository(ChannelCategory).count()).toBe(2);
  });
  it('desactiva canales ausentes sin afectar otros proveedores', async () => {
    await db.getRepository(Channel).save({ externalId: 'Other', name: 'Other', source: 'other', isActive: true });
    const raw = fixture(); raw.channels = raw.channels.filter(item => (item as { id: string }).id !== 'Sports.us');
    client.fetchSnapshot.mockResolvedValue(raw); await service.sync();
    expect((await db.getRepository(Channel).findOneByOrFail({ externalId: 'Sports.us' })).isActive).toBe(false);
    expect((await db.getRepository(Channel).findOneByOrFail({ source: 'other' })).isActive).toBe(true);
  });
  it('no modifica el catálogo cuando falla la descarga o la blocklist', async () => {
    client.fetchSnapshot.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.sync()).rejects.toThrow('timeout');
    client.fetchSnapshot.mockResolvedValueOnce({ ...fixture(), blocklist: [{}] });
    await expect(service.sync()).rejects.toThrow('Blocklist');
    expect(await db.getRepository(Channel).count()).toBe(2);
  });
  it('revierte un lote fallido y reporta errores', async () => {
    const runner = db.createQueryRunner();
    const createRunner = jest.spyOn(db,'createQueryRunner').mockReturnValueOnce(runner);
    const save = jest.spyOn(runner.manager.getRepository(Stream),'save').mockRejectedValueOnce(new Error('write failed'));
    const stats = await service.sync();
    expect(stats.errors).toBe(1); expect(stats.processed).toBe(0);
    expect(await db.getRepository(ChannelCategory).count()).toBe(3);
    save.mockRestore(); createRunner.mockRestore();
  });
  it('filtra país/categoría y mantiene todas las categorías del canal', async () => {
    const res = await request(app.getHttpServer()).get('/api/channels?country=MX&category=sports').expect(200);
    expect(res.body.total).toBe(1); expect(res.body.data[0].name).toBe('Noticias');
    expect(res.body.data[0].channelCategories).toHaveLength(2);
  });
  it('busca con parámetros y pagina con orden estable', async () => {
    const search = await request(app.getHttpServer()).get('/api/channels?search=noticias').expect(200);
    expect(search.body.total).toBe(1);
    const page = await request(app.getHttpServer()).get('/api/channels?page=2&limit=1&sortBy=name&order=ASC').expect(200);
    expect(page.body).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(page.body.data[0].name).toBe('Sports');
    expect((await request(app.getHttpServer()).get('/api/channels?search=%25').expect(200)).body.total).toBe(0);
  });
  it.each(['limit=101','page=0','page=abc','sortBy=password','country=mx','status=ONLINE','unknown=true'])('valida query %s', async query => {
    const res = await request(app.getHttpServer()).get(`/api/channels?${query}`).expect(400);
    expect(res.body.statusCode).toBe(400); expect(res.body.timestamp).toBeDefined();
  });
  it('expone metadatos de reproducción sin marcar streams ONLINE', async () => {
    const res = await request(app.getHttpServer()).get('/api/channels/1/streams').expect(200);
    expect(res.body.channel.logo).toBeDefined();
    expect(res.body.data[0]).toMatchObject({ status: 'UNKNOWN', lastCheckedAt: null, format: 'HLS' });
    expect(res.body.data[0].identityKey).toBeUndefined();
    await request(app.getHttpServer()).get('/api/channels/99999').expect(404);
    await request(app.getHttpServer()).get('/api/channels/0').expect(400);
  });
  it('expone catálogos, health y OpenAPI; aplica Helmet y CORS', async () => {
    const countries = await request(app.getHttpServer()).get('/api/countries').expect(200);
    expect(countries.body).toHaveLength(2);
    expect(countries.headers['x-content-type-options']).toBe('nosniff');
    expect((await request(app.getHttpServer()).get('/api/categories').expect(200)).body).toHaveLength(2);
    expect((await request(app.getHttpServer()).get('/api/health').expect(200)).body.database).toBe('ok');
    const docs = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(docs.body.paths['/api/channels']).toBeDefined();
    const allowed = await request(app.getHttpServer()).get('/api/health').set('Origin','http://localhost:3001');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    const denied = await request(app.getHttpServer()).get('/api/health').set('Origin','https://unknown.public.tv');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(await db.getRepository(Category).count()).toBe(2);
  });
});

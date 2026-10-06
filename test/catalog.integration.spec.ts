import { SecurityModule } from '../src/security/security.module';
import { AuthService } from '../src/security/auth.service';
import { seedSecurity } from '../src/security/policy';
import { Role, User, UserRole, ChannelPublication, UserChannelAccess, ChannelCollection, ChannelCollectionItem, UserChannelCollection } from '../src/database/entities';
import { authTestEnvironment } from './auth-fixture';
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
  let token: string; let app: INestApplication; let db: DataSource; let service: IptvOrgSyncService;
  const client = { source: 'iptv-org', fetchSnapshot: jest.fn() };
  beforeAll(async () => {
    const env = validateEnvironment({ ...parse(readFileSync('.env.example')), NODE_ENV: 'test', RATE_LIMIT_MAX: '1000' });
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ ...env, ...authTestEnvironment() })] }),
      // Schema sync is exclusively for this ephemeral in-memory test DB.
      TypeOrmModule.forRoot({ type: 'sqljs', entities: ENTITIES, synchronize: true, dropSchema: true, autoSave: false }),
      SecurityModule,ChannelsModule,CatalogsModule,HealthModule,
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
    await seedSecurity(db.manager);
    const user = await db.manager.save(User,{ username: 'catalog', email: 'catalog@test.dev', firstName: 'Catalog', passwordHash: await app.get(AuthService).hash('Catalog-Test!123'), requiresPasswordChange: false });
    const role = await db.manager.findOneByOrFail(Role,{ name: 'USER' });
    await db.manager.save(UserRole,{ userId: user.id, roleId: role.id });
    for (const channel of await db.manager.find(Channel)) {
      await db.manager.update(ChannelPublication,{ channelId: channel.id },{ status: 'PUBLISHED' });
      await db.manager.save(UserChannelAccess,{ userId: user.id, channelId: channel.id, accessType: 'ALLOW' });
    }
    token = (await app.get(AuthService).login({ username: 'catalog', password: 'Catalog-Test!123' })).accessToken;
  });
  afterAll(async () => { if (app) await app.close(); });
  it('SUPER_ADMIN conserva acceso global después de sincronizar sin modificar privilegios ni decisiones editoriales', async () => {
    const user = await db.manager.save(User,{ username: 'owner',email: 'owner@test.dev',firstName: 'Owner',passwordHash: await app.get(AuthService).hash('Owner-Secure!123'),requiresPasswordChange: false });
    const role = await db.manager.findOneByOrFail(Role,{ name: 'SUPER_ADMIN' });
    await db.manager.save(UserRole,{ userId: user.id,roleId: role.id });
    const accessToken = (await app.get(AuthService).login({ username: 'owner',password: 'Owner-Secure!123' })).accessToken;
    await db.manager.update(ChannelPublication,{ channelId: 1 },{ status: 'HIDDEN' });
    await db.manager.save(UserChannelAccess,{ userId: user.id,channelId: 1,accessType: 'DENY' });
    const raw = fixture(); raw.channels.push({ id: 'New.mx',name: 'New',country: 'MX',categories: [],is_nsfw: false }); raw.streams = [];
    client.fetchSnapshot.mockResolvedValue(raw);
    for (let i = 0; i < 2; i++) {
      await service.sync();
      for (const base of ['/api/channels','/api/me/channels','/api/admin/channels']) {
        expect((await request(app.getHttpServer()).get(base).set('Authorization',`Bearer ${accessToken}`).expect(200)).body.total).toBe(3);
        expect((await request(app.getHttpServer()).get(`${base}/1/streams`).set('Authorization',`Bearer ${accessToken}`).expect(200)).body.total).toBe(1);
      }
    }
    expect((await db.manager.findOneByOrFail(ChannelPublication,{ channelId: 1 })).status).toBe('HIDDEN');
    expect((await app.get(AuthService).authenticate(accessToken)).roles).toEqual(['SUPER_ADMIN']);
    expect(await db.manager.countBy(UserChannelCollection,{ userId: user.id })).toBe(0);
  });
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
  it('deshabilita canales bloqueados y reconcilia streams retirados sin perder historial', async () => {
    const raw = fixture(); raw.blocklist.push({ channel: 'Sports.us', reason: 'dmca' }); raw.streams = [];
    client.fetchSnapshot.mockResolvedValue(raw); await service.sync();
    expect(await db.getRepository(Channel).count()).toBe(2);
    expect((await db.manager.findOneByOrFail(Channel,{ externalId: 'Sports.us' })).isActive).toBe(false);
    expect(await db.getRepository(Stream).count()).toBe(2);
    expect(await db.getRepository(Stream).countBy({ isAvailable: true })).toBe(0);
    expect(await db.getRepository(ChannelCategory).count()).toBe(3);
  });
  it('sincronización conserva publicaciones, colecciones y grants; nuevos canales quedan DRAFT', async () => {
    const viewer = await db.manager.findOneByOrFail(User,{ username: 'catalog' });
    const col = await db.manager.save(ChannelCollection,{ name: 'Editorial',createdBy: viewer.id });
    await db.manager.save(ChannelCollectionItem,{ collectionId: col.id,channelId: 1,position: 0 });
    await db.manager.save(UserChannelCollection,{ userId: viewer.id,collectionId: col.id,assignedBy: viewer.id,assignedAt: new Date(),revokedAt: null });
    await db.manager.update(ChannelPublication,{ channelId: 1 },{ status: 'HIDDEN',publishedBy: viewer.id });
    await db.manager.update(UserChannelAccess,{ userId: viewer.id,channelId: 1 },{ accessType: 'DENY' });
    const raw = fixture(); raw.channels.push({ id: 'New.mx',name: 'New',country: 'MX',categories: [],is_nsfw: false });
    client.fetchSnapshot.mockResolvedValue(raw); await service.sync();
    expect((await db.manager.findOneByOrFail(ChannelPublication,{ channelId: 1 })).status).toBe('HIDDEN');
    expect((await db.manager.findOneByOrFail(UserChannelAccess,{ userId: viewer.id,channelId: 1 })).accessType).toBe('DENY');
    expect(await db.manager.count(ChannelCollectionItem)).toBe(1); expect(await db.manager.count(UserChannelCollection)).toBe(1);
    const imported = await db.manager.findOneByOrFail(Channel,{ externalId: 'New.mx' });
    expect((await db.manager.findOneByOrFail(ChannelPublication,{ channelId: imported.id })).status).toBe('DRAFT');
  });
  it('conserva streams y relaciones de categoría retirados sin devolverlos al cliente', async () => {
    const raw = fixture(); (raw.channels[0] as { categories: string[] }).categories = ['news']; raw.streams = [];
    client.fetchSnapshot.mockResolvedValue(raw); await service.sync();
    expect(await db.manager.count(ChannelCategory)).toBe(3);
    expect(await db.manager.countBy(ChannelCategory,{ isCurrent: true })).toBe(2);
    expect(await db.manager.count(Stream)).toBe(2);
    expect(await db.manager.countBy(Stream,{ isAvailable: true })).toBe(0);
    const detail = await request(app.getHttpServer()).get('/api/channels/1').set('Authorization',`Bearer ${token}`).expect(200);
    expect(detail.body.channelCategories).toHaveLength(1);
    const streams = await request(app.getHttpServer()).get('/api/channels/1/streams').set('Authorization',`Bearer ${token}`).expect(200);
    expect(streams.body.total).toBe(0);
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
    const res = await request(app.getHttpServer()).get('/api/channels?country=MX&category=sports').set('Authorization',`Bearer ${token}`).expect(200);
    expect(res.body.total).toBe(1); expect(res.body.data[0].name).toBe('Noticias');
    expect(res.body.data[0].channelCategories).toHaveLength(2);
  });
  it('busca con parámetros y pagina con orden estable', async () => {
    const search = await request(app.getHttpServer()).get('/api/channels?search=noticias').set('Authorization',`Bearer ${token}`).expect(200);
    expect(search.body.total).toBe(1);
    const page = await request(app.getHttpServer()).get('/api/channels?page=2&limit=1&sortBy=name&order=ASC').set('Authorization',`Bearer ${token}`).expect(200);
    expect(page.body).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(page.body.data[0].name).toBe('Sports');
    expect((await request(app.getHttpServer()).get('/api/channels?search=%25').set('Authorization',`Bearer ${token}`).expect(200)).body.total).toBe(0);
  });
  it.each(['limit=101','page=0','page=abc','sortBy=password','country=mx','status=ONLINE','unknown=true'])('valida query %s', async query => {
    const res = await request(app.getHttpServer()).get(`/api/channels?${query}`).set('Authorization',`Bearer ${token}`).expect(400);
    expect(res.body.statusCode).toBe(400); expect(res.body.timestamp).toBeDefined();
  });
  it('expone metadatos de reproducción sin marcar streams ONLINE', async () => {
    const res = await request(app.getHttpServer()).get('/api/channels/1/streams').set('Authorization',`Bearer ${token}`).expect(200);
    expect(res.body.channel.logo).toBeDefined();
    expect(res.body.data[0]).toMatchObject({ status: 'UNKNOWN', lastCheckedAt: null, format: 'HLS' });
    expect(res.body.data[0].identityKey).toBeUndefined();
    await request(app.getHttpServer()).get('/api/channels/99999').set('Authorization',`Bearer ${token}`).expect(404);
    await request(app.getHttpServer()).get('/api/channels/0').set('Authorization',`Bearer ${token}`).expect(400);
  });
  it('expone catálogos, health y OpenAPI; aplica Helmet y CORS', async () => {
    const countries = await request(app.getHttpServer()).get('/api/countries').set('Authorization',`Bearer ${token}`).expect(200);
    expect(countries.body).toHaveLength(2);
    expect(countries.headers['x-content-type-options']).toBe('nosniff');
    expect((await request(app.getHttpServer()).get('/api/categories').set('Authorization',`Bearer ${token}`).expect(200)).body).toHaveLength(2);
    expect((await request(app.getHttpServer()).get('/api/health').set('Authorization',`Bearer ${token}`).expect(200)).body.database).toBe('ok');
    const docs = await request(app.getHttpServer()).get('/api/docs-json').set('Authorization',`Bearer ${token}`).expect(200);
    expect(docs.body.paths['/api/channels']).toBeDefined();
    // Swagger must render scalar pagination inputs, including inherited DTO fields.
    for (const path of ['/api/channels','/api/channels/{id}/streams']) {
      const parameters = docs.body.paths[path].get.parameters;
      expect(parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query', schema: expect.objectContaining({ type: 'integer', default: 1, minimum: 1, maximum: 1000000 }) }),
        expect.objectContaining({ name: 'limit', in: 'query', schema: expect.objectContaining({ type: 'integer', default: 20, minimum: 1, maximum: 100 }) }),
      ]));
    }
    const allowed = await request(app.getHttpServer()).get('/api/health').set('Authorization',`Bearer ${token}`).set('Origin','http://localhost:3001');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    const denied = await request(app.getHttpServer()).get('/api/health').set('Authorization',`Bearer ${token}`).set('Origin','https://unknown.public.tv');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(await db.getRepository(Category).count()).toBe(2);
  });
});

import { m3uFixture } from './m3u-fixture';
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { ENTITIES, SyncStatus, Provider, ProviderChannel, ProviderSyncRun, ProviderType, Channel, Stream, ChannelPublication, User, Role, UserRole, Permission, RolePermission, AuditLog, UserChannelAccess, ChannelCollection, ChannelCollectionItem } from '../src/database/entities';
import { SecurityModule } from '../src/security/security.module';
import { AuthService } from '../src/security/auth.service';
import { seedSecurity } from '../src/security/policy';
import { ProvidersModule } from '../src/providers/providers.module';
import { ProviderSyncEngine, ensureReservedProvider } from '../src/providers/sync-engine';
import { ProvidersService } from '../src/providers/providers.service';
import { IptvOrgClient } from '../src/providers/iptv-org/iptv-org.client';
import { Environment, validateEnvironment } from '../src/config/environment';
import { configureApp } from '../src/common/configure-app';
import { authTestEnvironment } from './auth-fixture';
import { parseM3u } from '../src/providers/m3u';
import { fixture } from './fixtures';
import { normalizeSnapshot } from '../src/providers/iptv-org/normalizer';
const playlist = '#EXTM3U\n#EXTINF:-1 tvg-id="News.mx" group-title="News",Noticias\nhttps://cdn.public.tv/live.m3u8\n';
describe('Multiproveedor HTTP y persistencia (SQL.js aislado)', () => {
  let app: INestApplication; let db: DataSource; let token: string; let actor: number; let engine: ProviderSyncEngine; let service: ProvidersService;
  const client = { source: 'iptv-org',fetchSnapshot: jest.fn().mockImplementation(async () => fixture()) };
  beforeAll(async () => {
    const env = validateEnvironment({ ...{ ...parse(readFileSync('.env.example')), PROVIDER_CREDENTIALS_KEY: Buffer.alloc(32,7).toString('base64') },NODE_ENV: 'test' });
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true,ignoreEnvFile: true,load: [() => ({ ...env,...authTestEnvironment(),PROVIDER_CREDENTIALS_KEY: randomBytes(32).toString('base64') })] }),
      TypeOrmModule.forRoot({ type: 'sqljs',entities: ENTITIES,synchronize: true,dropSchema: true,autoSave: false }),SecurityModule,ProvidersModule,
    ] }).overrideProvider(IptvOrgClient).useValue(client).compile();
    app = module.createNestApplication(); configureApp(app,app.get(ConfigService<Environment,true>)); await app.init();
    db = app.get(DataSource); engine = app.get(ProviderSyncEngine); service = app.get(ProvidersService);
  });
  beforeEach(async () => {
    await db.synchronize(true); await seedSecurity(db.manager);
    const user = await db.manager.save(User,{ username: 'owner',email: 'owner@test.dev',firstName: 'Owner',passwordHash: await app.get(AuthService).hash('Owner-Secure!123'),requiresPasswordChange: false });
    actor = user.id; const role = await db.manager.findOneByOrFail(Role,{ name: 'SUPER_ADMIN' }); await db.manager.save(UserRole,{ userId: actor,roleId: role.id });
    token = (await app.get(AuthService).login({ username: 'owner',password: 'Owner-Secure!123' })).accessToken;
    await ensureReservedProvider(db,ProviderType.IPTV_ORG); await ensureReservedProvider(db,ProviderType.MANUAL);
  });
  afterAll(async () => { await app.close(); });
  const http = () => request(app.getHttpServer());
  async function provider(slug = 'list-a') {
    const r = await http().post('/api/admin/providers').set('Authorization',`Bearer ${token}`).send({ name: slug,slug,type: 'M3U_UPLOAD',config: {} }).expect(201);
    return db.manager.findOneByOrFail(Provider,{ id: r.body.id });
  }
  it('crea/edita/desactiva proveedor y jamás devuelve secretos o cifrados', async () => {
    const r = await http().post('/api/admin/providers').set('Authorization',`Bearer ${token}`).send({ name: 'Protected',slug: 'protected',type: 'M3U_URL',config: { url: 'https://public.tv/list.m3u' },credentials: { token: 'sensitive-value' } }).expect(201);
    await http().patch(`/api/admin/providers/${r.body.id}`).set('Authorization',`Bearer ${token}`).send({ name: 'Updated',isActive: false,credentials: { token: 'second-secret' } }).expect(200);
    for (const path of ['/api/admin/providers',`/api/admin/providers/${r.body.id}`]) {
      const result = await http().get(path).set('Authorization',`Bearer ${token}`).expect(200);
      expect(JSON.stringify(result.body)).not.toMatch(/sensitive-value|second-secret|credentialsEncrypted|uploadEncrypted/);
    }
    const raw = await db.getRepository(Provider).createQueryBuilder('p').addSelect('p.credentialsEncrypted').where('p.id = :id',{ id: r.body.id }).getOneOrFail();
    expect(raw.credentialsEncrypted).not.toContain('second-secret');
    expect(JSON.stringify(await db.manager.find(AuditLog))).not.toMatch(/sensitive-value|second-secret/);
    await http().post(`/api/admin/providers/${raw.id}/sync`).set('Authorization',`Bearer ${token}`).expect(400);
  });
  it('USER aun con permiso no administra; ADMIN sin permiso recibe 403; SUPER_ADMIN accede', async () => {
    for (const name of ['USER','ADMIN']) {
      const role = await db.manager.findOneByOrFail(Role,{ name });
      const user = await db.manager.save(User,{ username: name,email: `${name}@test.dev`,firstName: name,passwordHash: await app.get(AuthService).hash('Role-Secure!123'),requiresPasswordChange: false });
      await db.manager.save(UserRole,{ userId: user.id,roleId: role.id });
      if (name === 'USER') { const permission = await db.manager.findOneByOrFail(Permission,{ code: 'providers.read' }); await db.manager.save(RolePermission,{ roleId: role.id,permissionId: permission.id }); }
      const jwt = (await app.get(AuthService).login({ username: name,password: 'Role-Secure!123' })).accessToken;
      await http().get('/api/admin/providers').set('Authorization',`Bearer ${jwt}`).expect(403);
    }
    await http().get('/api/admin/providers').set('Authorization',`Bearer ${token}`).expect(200);
  });
  it('valida SSRF/config/credenciales y recursos inexistentes', async () => {
    await http().post('/api/admin/providers').set('Authorization',`Bearer ${token}`).send({ name: 'bad',slug: 'bad',type: 'M3U_URL',config: { url: 'https://127.0.0.1/a' } }).expect(400);
    await http().post('/api/admin/providers').set('Authorization',`Bearer ${token}`).send({ name: 'bad',slug: 'bad',type: 'M3U_UPLOAD',config: null }).expect(400);
    await http().get('/api/admin/providers/999').set('Authorization',`Bearer ${token}`).expect(404);
    await http().post('/api/admin/providers').set('Authorization',`Bearer ${token}`).send({ name: 'bad',slug: 'bad',type: 'M3U_URL',config: { url: 'https://public.tv/a',token: 'bad' } }).expect(400);
  });
  it('upload UTF-8 importa streams y categorías en DRAFT; HTTP retorna 202 y persiste historial', async () => {
    const p = await provider();
    await http().post(`/api/admin/providers/${p.id}/upload`).set('Authorization',`Bearer ${token}`).send({ content: playlist }).expect(200);
    await http().post(`/api/admin/providers/${p.id}/test`).set('Authorization',`Bearer ${token}`).expect(200);
    const r = await http().post(`/api/admin/providers/${p.id}/sync`).set('Authorization',`Bearer ${token}`).expect(202);
    for (let i = 0; i < 100; i++) { const run = await db.manager.findOneByOrFail(ProviderSyncRun,{ id: r.body.id }); if (run.finishedAt) break; await new Promise(resolve => setTimeout(resolve,10)); }
    const run = await db.manager.findOneByOrFail(ProviderSyncRun,{ id: r.body.id }); expect(run.status).toBe('SUCCESS'); expect(run.channelsCreated).toBe(1);
    expect((await db.manager.findOneByOrFail(ChannelPublication,{})).status).toBe('DRAFT');
    const stream = await db.manager.findOneByOrFail(Stream,{}); expect(stream.providerChannelId).toBeDefined(); expect(stream.format).toBe('HLS');
    const history = await http().get(`/api/admin/sync-runs?providerId=${p.id}&status=SUCCESS&limit=1`).set('Authorization',`Bearer ${token}`).expect(200);
    expect(history.body.total).toBe(1);
  });
  it('persiste SUCCESS con descartes sin guardar credenciales y FAILED si todas son inválidas', async () => {
    const p = await provider();
    const stats = await engine.sync(p,async () => parseM3u(m3uFixture('mixed')));
    expect(stats).toMatchObject({ processed: 1,discarded: 3,errors: 0 });
    const run = await db.manager.findOneByOrFail(ProviderSyncRun,{ providerId: p.id });
    expect(run).toMatchObject({ status: SyncStatus.SUCCESS,discarded: 3,errors: 0,errorCodes: [] });
    expect((await db.manager.find(Stream)).map(s => s.url)).toEqual(['https://cdn.public.tv/live.m3u8']);
    expect((await db.manager.findOneByOrFail(Provider,{ id: p.id })).lastSuccessfulSyncAt).not.toBeNull();
    await expect(engine.sync(p,async () => parseM3u(m3uFixture('all-invalid')))).rejects.toThrow();
    expect(await db.manager.countBy(ProviderSyncRun,{ providerId: p.id,status: SyncStatus.FAILED })).toBe(1);
    expect(await db.manager.countBy(Stream,{ isAvailable: true })).toBe(1);
  });
  it('rechaza upload inválido y declara XTREAM/REST pendientes', async () => {
    const p = await provider(); await http().post(`/api/admin/providers/${p.id}/upload`).set('Authorization',`Bearer ${token}`).send({ content: 'bad' }).expect(400);
    for (const type of ['XTREAM','REST_API']) {
      const r = await http().post('/api/admin/providers').set('Authorization',`Bearer ${token}`).send({ name: type,slug: type.toLowerCase(),type,config: { baseUrl: 'https://public.tv/api' } }).expect(201);
      expect(r.body.syncSupported).toBe(false);
      await http().post(`/api/admin/providers/${r.body.id}/test`).set('Authorization',`Bearer ${token}`).expect(501);
      await http().post(`/api/admin/providers/${r.body.id}/sync`).set('Authorization',`Bearer ${token}`).expect(400);
    }
  });
  it('dos fuentes enlazadas aportan la misma URL; retirada no afecta alternativa ni historial', async () => {
    const a = await provider('a'); const b = await provider('b');
    await engine.sync(a,async () => parseM3u(playlist)); await engine.sync(b,async () => parseM3u(playlist));
    const la = await db.manager.findOneByOrFail(ProviderChannel,{ providerId: a.id }); const lb = await db.manager.findOneByOrFail(ProviderChannel,{ providerId: b.id });
    expect(la.channelId).not.toBe(lb.channelId);
    await http().patch(`/api/admin/provider-channels/${lb.id}/channel`).set('Authorization',`Bearer ${token}`).send({ channelId: la.channelId }).expect(200);
    await engine.sync(b,async () => parseM3u(playlist));
    expect(await db.manager.countBy(Stream,{ channelId: la.channelId,isAvailable: true })).toBe(2);
    const other = playlist.replaceAll('News.mx','Other').replaceAll('live.m3u8','other.m3u8');
    await engine.sync(a,async () => parseM3u(other));
    expect((await db.manager.findOneByOrFail(Channel,{ id: la.channelId })).isActive).toBe(true);
    expect(await db.manager.countBy(Stream,{ channelId: la.channelId,isAvailable: true })).toBe(1);
    expect(await db.manager.countBy(ProviderChannel,{ providerId: b.id })).toBe(1);
    expect(await db.manager.count(Channel)).toBe(3);
  });
  it('IPTV-org adopta legacy con IDs existentes y conserva publicación, colección y DENY', async () => {
    const p = await ensureReservedProvider(db,ProviderType.IPTV_ORG);
    const channel = await db.manager.save(Channel,{ source: 'iptv-org',externalId: 'News.mx',name: 'Legacy' });
    await db.manager.save(ChannelPublication,{ channelId: channel.id,status: 'HIDDEN' });
    await db.manager.save(UserChannelAccess,{ userId: actor,channelId: channel.id,accessType: 'DENY' });
    const col = await db.manager.save(ChannelCollection,{ name: 'keep' }); await db.manager.save(ChannelCollectionItem,{ collectionId: col.id,channelId: channel.id,position: 0 });
    await engine.sync(p,async () => normalizeSnapshot(fixture())); await engine.sync(p,async () => normalizeSnapshot(fixture()));
    expect((await db.manager.findOneByOrFail(ProviderChannel,{ providerId: p.id,externalId: 'News.mx' })).channelId).toBe(channel.id);
    expect(await db.manager.count(ProviderChannel)).toBe(2); expect((await db.manager.findOneByOrFail(ChannelPublication,{ channelId: channel.id })).status).toBe('HIDDEN');
    expect((await db.manager.findOneByOrFail(UserChannelAccess,{ channelId: channel.id })).accessType).toBe('DENY'); expect(await db.manager.count(ChannelCollectionItem)).toBe(1);
  });
  it('overrides editoriales y desactivación manual de streams sobreviven a sync', async () => {
    const p = await provider(); await engine.sync(p,async () => parseM3u(playlist)); const channel = await db.manager.findOneByOrFail(Channel,{});
    await http().patch(`/api/admin/channels/${channel.id}`).set('Authorization',`Bearer ${token}`).send({ name: 'Editorial',categoryIds: [],isActive: false }).expect(200);
    const stream = await db.manager.findOneByOrFail(Stream,{});
    await http().patch(`/api/admin/streams/${stream.id}`).set('Authorization',`Bearer ${token}`).send({ title: 'Cannot overwrite' }).expect(400);
    await http().delete(`/api/admin/streams/${stream.id}`).set('Authorization',`Bearer ${token}`).expect(200);
    await engine.sync(p,async () => parseM3u(playlist));
    expect((await db.manager.findOneByOrFail(Channel,{ id: channel.id }))).toMatchObject({ name: 'Editorial',isActive: false });
    expect((await db.manager.findOneByOrFail(Stream,{ id: stream.id })).isAvailable).toBe(false);
  });
  it('CRUD manual y sincronización externa no retiran fuentes MANUAL', async () => {
    const r = await http().post('/api/admin/channels').set('Authorization',`Bearer ${token}`).send({ name: 'Manual' }).expect(201);
    const s = await http().post(`/api/admin/channels/${r.body.id}/streams`).set('Authorization',`Bearer ${token}`).send({ title: 'Manual HLS',url: 'https://cdn.public.tv/manual.m3u8',priority: 2,feedId: 'HD',referrer: 'https://public.tv/',userAgent: 'Authorized player',labels: ['Manual'] }).expect(201);
    expect(s.body).toMatchObject({ feedId: 'HD',userAgent: 'Authorized player',labels: ['Manual'] });
    await http().patch(`/api/admin/streams/${s.body.id}`).set('Authorization',`Bearer ${token}`).send({ quality: '1080p',priority: 3 }).expect(200);
    const p = await provider(); await engine.sync(p,async () => parseM3u(playlist));
    expect((await db.manager.findOneByOrFail(Channel,{ id: r.body.id })).isActive).toBe(true);
    expect((await db.manager.findOneByOrFail(Stream,{ id: s.body.id })).isAvailable).toBe(true);
    await http().delete(`/api/admin/channels/${r.body.id}`).set('Authorization',`Bearer ${token}`).expect(200);
    expect(await db.manager.count(Channel)).toBe(2);
  });
  it('rechaza sync concurrente mismo proveedor y registra fallo sanitizado sin reconciliar', async () => {
    const p = await provider(); await engine.sync(p,async () => parseM3u(playlist));
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const first = engine.sync(p,async () => { await gate; throw new Error('sensitive-token'); });
    for (let i=0;i<50 && !ProviderSyncEngine.isActive(p.id);i++) await new Promise(resolve => setTimeout(resolve,1));
    await expect(engine.sync(p,async () => parseM3u(playlist))).rejects.toThrow('activa');
    await expect(service.update(p.id,{ isActive: false },actor)).rejects.toThrow('activa');
    release(); await expect(first).rejects.toThrow('sensitive-token');
    const history = await db.manager.find(ProviderSyncRun); expect(history.some(r => r.status === 'FAILED')).toBe(true);
    expect(JSON.stringify(history)).not.toContain('sensitive-token'); expect(await db.manager.countBy(Stream,{ isAvailable: true })).toBe(1);
  });
  it('locks de proveedores distintos son independientes durante descargas', async () => {
    const a = await provider('a'); const b = await provider('b');
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const first = engine.sync(a,async () => { await gate; return parseM3u(playlist); });
    for (let i=0;i<50 && !ProviderSyncEngine.isActive(a.id);i++) await new Promise(resolve => setTimeout(resolve,1));
    try { expect((await engine.sync(b,async () => parseM3u(playlist))).created).toBe(1); }
    finally { release(); await first; }
    expect(await db.manager.countBy(ProviderSyncRun,{ status: SyncStatus.SUCCESS })).toBe(2);
  });
  it('OpenAPI conserva bearer y secretos writeOnly sin ejemplos', async () => {
    const docs = await http().get('/api/docs-json').expect(200);
    expect(docs.body.paths['/api/admin/providers/{id}/sync'].post.responses['202']).toBeDefined();
    expect(docs.body.components.schemas.CreateProviderDto.properties.credentials.writeOnly).toBe(true);
    expect(docs.body.components.schemas.CreateProviderDto.properties.credentials.example).toBeUndefined();
  });
});

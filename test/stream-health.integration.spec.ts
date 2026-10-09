import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { ENTITIES, User, Role, UserRole, Permission, RolePermission, Channel, Stream, StreamStatus, Provider, ProviderChannel, ProviderType, ChannelPublication, UserChannelAccess, StreamHealthRun, AuditLog } from '../src/database/entities';
import { SecurityModule } from '../src/security/security.module';
import { seedSecurity } from '../src/security/policy';
import { AuthService } from '../src/security/auth.service';
import { authTestEnvironment } from './auth-fixture';
import { StreamHealthModule } from '../src/stream-health/stream-health.module';
import { StreamHealthChecker } from '../src/stream-health/checker';
import { StreamHealthService } from '../src/stream-health/service';
import { configureApp } from '../src/common/configure-app';
import { Environment } from '../src/config/environment';
describe('Stream health HTTP with isolated SQL.js',() => {
  let app: INestApplication, db: DataSource, stream: Stream, channel: Channel;
  const tokens: Record<string,string> = {}; const ids: Record<string,number> = {};
  const checker = { check: jest.fn(async () => ({ status: StreamStatus.ONLINE,httpStatus: 200,responseTimeMs: 42,checkedAt: new Date(),failureReason: null })) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true,ignoreEnvFile: true,load: [() => ({ ...authTestEnvironment(),API_PREFIX: 'api',SWAGGER_ENABLED: false,HELMET_ENABLED: false,CORS_ENABLED: false })] }),TypeOrmModule.forRoot({ type: 'sqljs',entities: ENTITIES,synchronize: true }),SecurityModule,StreamHealthModule] }).overrideProvider(StreamHealthChecker).useValue(checker).compile();
    app = module.createNestApplication(); configureApp(app,app.get(ConfigService<Environment,true>)); await app.init(); db = app.get(DataSource); await seedSecurity(db.manager);
    for (const name of ['SUPER_ADMIN','ADMIN','USER']) {
      const user = await db.manager.save(User,{ username: name,email: `${name}@test.dev`,firstName: name,passwordHash: await app.get(AuthService).hash('Role-Secure!123'),requiresPasswordChange: false }); ids[name] = user.id;
      const role = await db.manager.findOneByOrFail(Role,{ name }); await db.manager.save(UserRole,{ userId: user.id,roleId: role.id });
      tokens[name] = (await app.get(AuthService).login({ username: name,password: 'Role-Secure!123' })).accessToken;
    }
    const provider = await db.manager.save(Provider,{ name: 'fixture',slug: 'fixture',type: ProviderType.MANUAL,config: {} });
    channel = await db.manager.save(Channel,{ name: 'fixture',externalId: 'fixture',source: 'manual' });
    const pc = await db.manager.save(ProviderChannel,{ providerId: provider.id,channelId: channel.id,externalId: 'fixture',externalName: 'fixture',metadata: {} });
    stream = await db.manager.save(Stream,{ providerChannelId: pc.id,channelId: channel.id,identityKey: 'key',title: 'fixture',url: 'https://public.tv/live.m3u8',format: 'HLS',labels: [] });
    await db.manager.save(ChannelPublication,{ channelId: channel.id,status: 'PUBLISHED' }); await db.manager.save(UserChannelAccess,{ userId: ids.USER,channelId: channel.id,accessType: 'ALLOW' });
  });
  afterAll(async () => { await app.close(); });
  const http = () => request(app.getHttpServer());
  it('role and permission denied',async () => {
    for (const role of ['USER','ADMIN']) await http().post('/api/admin/stream-health/run').set('Authorization',`Bearer ${tokens[role]}`).expect(403);
  });
  it('SUPER_ADMIN starts global; registers, updates counters and preserves catalog',async () => {
    const before = await db.manager.findOneByOrFail(Stream,{ id: stream.id });
    const response = await http().post('/api/admin/stream-health/run').set('Authorization',`Bearer ${tokens.SUPER_ADMIN}`).expect(202);
    for (let i=0;i<100;i++) { if ((await db.manager.findOneByOrFail(StreamHealthRun,{ id: response.body.id })).finishedAt) break; await new Promise(r => setTimeout(r,10)); }
    expect(await db.manager.findOneByOrFail(StreamHealthRun,{ id: response.body.id })).toMatchObject({ status: 'SUCCESS',online: 1,streamsChecked: 1 });
    const after = await db.manager.findOneByOrFail(Stream,{ id: stream.id }); expect(after).toMatchObject({ status: 'ONLINE',consecutiveSuccesses: 1,consecutiveFailures: 0,responseTimeMs: 42,url: before.url,channelId: before.channelId,providerChannelId: before.providerChannelId,isAvailable: true });
    expect((await db.manager.findOneByOrFail(ChannelPublication,{ channelId: channel.id })).status).toBe('PUBLISHED'); expect(await db.manager.count(UserChannelAccess)).toBe(1);
    const stats = await http().get('/api/admin/stream-health/stats').set('Authorization',`Bearer ${tokens.SUPER_ADMIN}`).expect(200); expect(stats.body).toMatchObject({ totalStreams: 1,online: 1 });
    expect(await db.manager.count(AuditLog,{ where: { action: 'stream-health.run' } })).toBe(1);
  });
  it('authorized ADMIN checks stream; playback respects grants and hides internals',async () => {
    const role = await db.manager.findOneByOrFail(Role,{ name: 'ADMIN' }); const permission = await db.manager.findOneByOrFail(Permission,{ code: 'streams.manage' }); await db.manager.save(RolePermission,{ roleId: role.id,permissionId: permission.id });
    await http().post(`/api/admin/streams/${stream.id}/check`).set('Authorization',`Bearer ${tokens.ADMIN}`).expect(200);
    const result = await http().get(`/api/me/channels/${channel.id}/playback`).set('Authorization',`Bearer ${tokens.USER}`).expect(200); expect(result.body.stream.id).toBe(stream.id); expect(JSON.stringify(result.body)).not.toMatch(/identityKey|providerChannel|credentials/);
    await http().get('/api/me/channels/999/playback').set('Authorization',`Bearer ${tokens.USER}`).expect(404);
    await db.manager.delete(UserChannelAccess,{ userId: ids.USER }); await http().get(`/api/me/channels/${channel.id}/playback`).set('Authorization',`Bearer ${tokens.USER}`).expect(404);
  });
  it('failure counters, offline fallback and global lock',async () => {
    checker.check.mockResolvedValueOnce({ status: StreamStatus.OFFLINE,httpStatus: 403,responseTimeMs: 42,checkedAt: new Date(),failureReason: 'HTTP_403' } as never);
    await app.get(StreamHealthService).run({ streamId: stream.id,force: false });
    expect(await db.manager.findOneByOrFail(Stream,{ id: stream.id })).toMatchObject({ status: 'OFFLINE',consecutiveSuccesses: 0,consecutiveFailures: 1,isAvailable: true });
    await http().get(`/api/me/channels/${channel.id}/playback`).set('Authorization',`Bearer ${tokens.SUPER_ADMIN}`).expect(404);
    let release!: () => void; checker.check.mockImplementationOnce(async () => { await new Promise<void>(r => { release = r; }); return { status: StreamStatus.ONLINE,httpStatus: 200,responseTimeMs: 42,checkedAt: new Date(),failureReason: null }; });
    const running = app.get(StreamHealthService).run({ force: false });
    for (let i=0;i<100 && !release;i++) await new Promise(r => setTimeout(r,5));
    await expect(app.get(StreamHealthService).run({ force: false })).rejects.toThrow('Health ocupado'); release(); await running;
  });
  it('bounds concurrency and skips disabled sources unless force; provider/channel filters',async () => {
    const pc = await db.manager.findOneByOrFail(ProviderChannel,{ id: stream.providerChannelId! });
    for (let i=0;i<6;i++) await db.manager.save(Stream,{ providerChannelId: pc.id,channelId: channel.id,identityKey: `pool-${i}`,title: 'pool',url: `https://public.tv/${i}.m3u8`,labels: [],isDisabled: i === 5 });
    let active = 0, peak = 0;
    checker.check.mockImplementation(async () => { active++; peak = Math.max(peak,active); await new Promise(r => setTimeout(r,5)); active--; return { status: StreamStatus.ONLINE,httpStatus: 200,responseTimeMs: 42,checkedAt: new Date(),failureReason: null }; });
    app.get(ConfigService).set('STREAM_HEALTH_CONCURRENCY',2); app.get(ConfigService).set('STREAM_HEALTH_BATCH_SIZE',3);
    const health = app.get(StreamHealthService);
    const normal = await health.run({ force: false,providerId: pc.providerId,channelId: channel.id }); expect(normal.streamsChecked).toBe(6); expect(peak).toBe(2);
    const disabled = await db.manager.findOneByOrFail(Stream,{ isDisabled: true }); expect(disabled.status).toBe('UNKNOWN');
    const forced = await health.run({ force: true,streamId: disabled.id }); expect(forced.online).toBe(1);
    expect((await health.run({ force: false,status: StreamStatus.UNKNOWN })).streamsChecked).toBe(0);
  });

});

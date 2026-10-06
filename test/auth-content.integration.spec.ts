import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { authTestEnvironment } from './auth-fixture';
import { SecurityModule } from '../src/security/security.module';
import { AuthService } from '../src/security/auth.service';
import { bootstrapSuperAdmin } from '../src/security/bootstrap.service';
import { seedSecurity } from '../src/security/policy';
import { ChannelsModule } from '../src/channels/channels.module';
import { CatalogsModule } from '../src/catalogs/catalogs.module';
import { configureApp } from '../src/common/configure-app';
import { Environment, validateEnvironment } from '../src/config/environment';
import { AuditLog, AuthSession, Channel, ChannelCollection, ChannelCollectionItem, ChannelPublication, ENTITIES, Permission, Role, RolePermission, Stream, User, UserChannelAccess, UserChannelCollection, UserRole } from '../src/database/entities';

describe('Fase 2: HTTP, JWT y persistencia real TypeORM (SQL.js aislado)', () => {
  let app: INestApplication; let db: DataSource; let auth: AuthService;
  let owner: User; let user: User; let admin: User;
  let ownerToken: string; let userToken: string; let adminToken: string;
  let hash: string;
  const password = 'Test-Secure!12345';
  const secrets = authTestEnvironment();
  const http = () => request(app.getHttpServer());
  const login = (username = 'viewer') => http().post('/api/auth/login').send({ username,password });
  const authorize = (token: string) => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    const env = { ...validateEnvironment({ ...parse(readFileSync('.env.example')), NODE_ENV: 'test' }), ...secrets };
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      TypeOrmModule.forRoot({ type: 'sqljs', entities: ENTITIES, synchronize: true, dropSchema: true, autoSave: false }),
      SecurityModule,ChannelsModule,CatalogsModule,
    ] }).compile();
    app = module.createNestApplication(); configureApp(app,app.get(ConfigService<Environment,true>)); await app.init();
    db = app.get(DataSource); auth = app.get(AuthService); hash = await auth.hash(password);
  });
  afterAll(async () => { if (app) await app.close(); });
  beforeEach(async () => {
    await db.synchronize(true); await seedSecurity(db.manager);
    const create = async (username: string, roleName: string) => {
      const account = await db.manager.save(User,{ username,email: `${username}@test.dev`,firstName: username,passwordHash: hash,requiresPasswordChange: false });
      const role = await db.manager.findOneByOrFail(Role,{ name: roleName });
      await db.manager.save(UserRole,{ userId: account.id,roleId: role.id }); return account;
    };
    owner = await create('owner','SUPER_ADMIN'); user = await create('viewer','USER'); admin = await create('operator','ADMIN');
    ownerToken = (await auth.login({ username: 'owner',password })).accessToken;
    userToken = (await auth.login({ username: 'viewer',password })).accessToken;
    adminToken = (await auth.login({ username: 'operator',password })).accessToken;
    for (let id = 1; id <= 5; id++) {
      await db.manager.save(Channel,{ id,externalId: `C${id}`,name: `Channel ${id}`,source: 'test',isActive: id !== 5 });
      await db.manager.save(ChannelPublication,{ channelId: id,status: id === 4 ? 'HIDDEN' : 'PUBLISHED' });
      await db.manager.save(Stream,{ channelId: id,identityKey: `key${id}`,title: `Stream ${id}`,url: `https://public.test/${id}.m3u8`,labels: [] });
    }
  });
  const allow = (channelId: number, accessType = 'ALLOW') => db.manager.save(UserChannelAccess,{ userId: user.id,channelId,accessType,assignedBy: owner.id });
  const collection = async (ids: number[], name = 'Collection') => {
    const col = await db.manager.save(ChannelCollection,{ name,createdBy: owner.id });
    for (const [position,channelId] of ids.entries()) await db.manager.save(ChannelCollectionItem,{ collectionId: col.id,channelId,position });
    await db.manager.save(UserChannelCollection,{ userId: user.id,collectionId: col.id,assignedBy: owner.id,assignedAt: new Date(),revokedAt: null }); return col;
  };
  it('inicia sesión, no expone hash, no almacena tokens y no tiene registro público', async () => {
    const res = await login(); expect(res.status).toBe(201); expect(res.body.accessToken).toBeDefined();
    const profile = await http().get('/api/auth/me').set(authorize(res.body.accessToken)).expect(200);
    expect(profile.body.username).toBe('viewer'); expect(profile.body.passwordHash).toBeUndefined();
    const sessions = await http().get('/api/auth/sessions').set(authorize(userToken)).expect(200);
    expect(JSON.stringify(sessions.body)).not.toContain('refreshTokenHash');
    const saved = await db.getRepository(AuthSession).createQueryBuilder('s').addSelect('s.refreshTokenHash').getMany();
    expect(saved.every(s => /^[a-f0-9]{64}$/.test(s.refreshTokenHash))).toBe(true);
    await http().post('/api/auth/register').send({}).expect(404);
  });
  it('rechaza contraseña incorrecta y bloquea después de los intentos configurados', async () => {
    for (let i = 0; i < 3; i++) await http().post('/api/auth/login').send({ username: 'viewer',password: 'incorrect' }).expect(401);
    await login().expect(401);
    expect((await db.manager.findOneByOrFail(User,{ id: user.id })).lockedUntil).toBeInstanceOf(Date);
    await db.manager.update(User,user.id,{ lockedUntil: new Date(Date.now()-1000) }); await login().expect(201);
  });
  it('rechaza usuario desconocido y cuenta desactivada', async () => {
    await login('missing').expect(401);
    await db.manager.update(User,user.id,{ isActive: false }); await login().expect(401);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401);
  });
  it('rechaza JWT expirado, firma incorrecta y refresh usado como access', async () => {
    const payload = jwt.decode(userToken) as jwt.JwtPayload;
    const expired = jwt.sign({ sid: payload.sid,kind: 'access' },secrets.JWT_ACCESS_SECRET,{ algorithm: 'HS256',subject: String(user.id),issuer: 'hmodevelopers-iptv',audience: 'access',expiresIn: -1 });
    await http().get('/api/auth/me').set(authorize(expired)).expect(401);
    await http().get('/api/auth/me').set(authorize(userToken+'x')).expect(401);
    const res = await login(); await http().get('/api/auth/me').set(authorize(res.body.refreshToken)).expect(401);
  });
  it('rota refresh y su reutilización invalida la sesión, incluso el token rotado', async () => {
    const initial = (await login()).body;
    const rotated = await http().post('/api/auth/refresh').send({ refreshToken: initial.refreshToken }).expect(201);
    expect(rotated.body.refreshToken).not.toBe(initial.refreshToken);
    await http().post('/api/auth/refresh').send({ refreshToken: initial.refreshToken }).expect(401);
    await http().post('/api/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    await http().get('/api/auth/me').set(authorize(rotated.body.accessToken)).expect(401);
  });
  it('logout invalida access y refresh inmediatamente', async () => {
    const tokens = (await login()).body;
    await http().post('/api/auth/logout').set(authorize(tokens.accessToken)).expect(201);
    await http().get('/api/auth/me').set(authorize(tokens.accessToken)).expect(401);
    await http().post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
  });
  it('revoca una sesión propia y logout-all invalida todas las sesiones', async () => {
    const tokens = (await login()).body;
    const sid = (jwt.decode(tokens.accessToken) as jwt.JwtPayload).sid;
    await http().delete(`/api/auth/sessions/${sid}`).set(authorize(userToken)).expect(200);
    await http().get('/api/auth/me').set(authorize(tokens.accessToken)).expect(401);
    await http().post('/api/auth/logout-all').set(authorize(userToken)).expect(201);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401);
  });
  it('cambia contraseña, exige la actual y revoca todas las sesiones', async () => {
    await http().post('/api/auth/change-password').set(authorize(userToken)).send({ currentPassword: 'wrong',newPassword: 'New-Secure!12345' }).expect(401);
    await http().post('/api/auth/change-password').set(authorize(userToken)).send({ currentPassword: password,newPassword: 'New-Secure!12345' }).expect(201);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401); await login().expect(401);
    await http().post('/api/auth/login').send({ username: 'viewer',password: 'New-Secure!12345' }).expect(201);
  });
  it('limita sesiones por cuenta', async () => {
    for (let i = 0; i < 11; i++) await auth.login({ username: 'viewer',password });
    expect(await auth.sessions(user.id)).toHaveLength(10);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401);
  });
  it('crea cuentas USER con contraseña temporal y rechaza payloads de privilegios', async () => {
    const dto = { username: 'newuser',email: 'new@test.dev',firstName: 'New',password };
    await http().post('/api/users').set(authorize(ownerToken)).send({ ...dto,roles: ['SUPER_ADMIN'] }).expect(400);
    const created = await http().post('/api/users').set(authorize(ownerToken)).send(dto).expect(201);
    expect(created.body.requiresPasswordChange).toBe(true); expect(created.body.passwordHash).toBeUndefined();
    const tokens = (await login('newuser')).body;
    await http().get('/api/me/channels').set(authorize(tokens.accessToken)).expect(403);
    await http().get('/api/auth/me').set(authorize(tokens.accessToken)).expect(200);
    await http().post('/api/auth/change-password').set(authorize(tokens.accessToken)).send({ currentPassword: password,newPassword: 'Changed-Temporary!123' }).expect(201);
    expect((await db.manager.findOneByOrFail(User,{ id: created.body.id })).requiresPasswordChange).toBe(false);
  });
  it('duplicidad de usuario/correo devuelve 409 y no crea cuentas parciales', async () => {
    const dto = { username: 'viewer',email: 'new@test.dev',firstName: 'New',password };
    await http().post('/api/users').set(authorize(ownerToken)).send(dto).expect(409);
    await http().post('/api/users').set(authorize(ownerToken)).send({ ...dto,username: 'another',email: user.email }).expect(409);
    expect(await db.manager.count(User)).toBe(3);
  });
  it('USER no administra y SUPER_ADMIN consulta catálogo completo', async () => {
    await http().get('/api/users').set(authorize(userToken)).expect(403);
    await http().get('/api/roles').set(authorize(userToken)).expect(403);
    await http().put(`/api/users/${user.id}/roles`).set(authorize(userToken)).send({ ids: [] }).expect(403);
    const res = await http().get('/api/admin/channels?status=all').set(authorize(ownerToken)).expect(200); expect(res.body.total).toBe(5);
    await http().get('/api/admin/channels/4/streams').set(authorize(ownerToken)).expect(200);
  });
  it('ADMIN tiene solo permisos concedidos y los cambios son inmediatos', async () => {
    await http().get('/api/users').set(authorize(adminToken)).expect(403);
    const role = await db.manager.findOneByOrFail(Role,{ name: 'ADMIN' }); const permission = await db.manager.findOneByOrFail(Permission,{ code: 'users.read' });
    await http().put(`/api/roles/${role.id}/permissions`).set(authorize(ownerToken)).send({ ids: [permission.id] }).expect(200);
    await http().get('/api/users').set(authorize(adminToken)).expect(200);
    await http().post('/api/users').set(authorize(adminToken)).send({}).expect(403);
    await http().put(`/api/roles/${role.id}/permissions`).set(authorize(ownerToken)).send({ ids: [] }).expect(200);
    await http().get('/api/users').set(authorize(adminToken)).expect(403);
  });
  it('ADMIN no modifica SUPER_ADMIN ni privilegios propios aunque tenga permissions.assign', async () => {
    const role = await db.manager.findOneByOrFail(Role,{ name: 'ADMIN' });
    for (const code of ['permissions.assign','users.update','users.disable']) {
      const p = await db.manager.findOneByOrFail(Permission,{ code }); await db.manager.save(RolePermission,{ roleId: role.id,permissionId: p.id });
    }
    await http().put(`/api/users/${admin.id}/roles`).set(authorize(adminToken)).send({ ids: [role.id] }).expect(403);
    await http().put(`/api/roles/${role.id}/permissions`).set(authorize(adminToken)).send({ ids: [] }).expect(403);
    await http().patch(`/api/users/${owner.id}`).set(authorize(adminToken)).send({ firstName: 'Bad' }).expect(403);
    await http().patch(`/api/users/${owner.id}/status`).set(authorize(adminToken)).send({ isActive: false }).expect(403);
  });
  it('no permite modificar roles propios ni desactivar el último SUPER_ADMIN', async () => {
    await http().put(`/api/users/${owner.id}/roles`).set(authorize(ownerToken)).send({ ids: [] }).expect(403);
    await http().patch(`/api/users/${owner.id}/status`).set(authorize(ownerToken)).send({ isActive: false }).expect(409);
    const role = await db.manager.findOneByOrFail(Role,{ name: 'USER' });
    await http().patch(`/api/roles/${role.id}`).set(authorize(ownerToken)).send({ isActive: false }).expect(403);
    await http().put(`/api/roles/${role.id}/permissions`).set(authorize(ownerToken)).send({ ids: [] }).expect(403);
  });
  it('retirar un rol privilegiado al último propietario se rechaza desde otra cuenta', async () => {
    const superRole = await db.manager.findOneByOrFail(Role,{ name: 'SUPER_ADMIN' });
    await db.manager.save(UserRole,{ userId: admin.id,roleId: superRole.id });
    // An inactive second owner must not count toward the last-active-owner invariant.
    await db.manager.update(User,admin.id,{ isActive: false });
    const actor = { id: admin.id,sessionId: '',roles: ['SUPER_ADMIN'],permissions: [],requiresPasswordChange: false };
    const { AdminService } = await import('../src/security/admin.service');
    await expect(app.get(AdminService).setRoles(actor,owner.id,[])).rejects.toThrow('último SUPER_ADMIN');
  });
  it('desactivar usuario revoca sesiones sin borrar historial', async () => {
    await http().patch(`/api/users/${user.id}/status`).set(authorize(ownerToken)).send({ isActive: false }).expect(200);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401);
    await http().patch(`/api/users/${user.id}/status`).set(authorize(ownerToken)).send({ isActive: true }).expect(200);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401); await login().expect(201);
  });
  it('deniega catálogo anónimo y usuario sin asignaciones ve cero canales', async () => {
    for (const path of ['/api/channels','/api/channels/1','/api/channels/1/streams','/api/categories','/api/countries','/api/me/channels']) await http().get(path).expect(401);
    for (const path of ['/api/channels','/api/me/channels']) expect((await http().get(path).set(authorize(userToken)).expect(200)).body.total).toBe(0);
    await http().get('/api/me/channels?userId=1').set(authorize(userToken)).expect(400);
  });
  it('una colección permite solo sus canales y varias colecciones no duplican resultados', async () => {
    await collection([1,2],'A');
    expect((await http().get('/api/me/channels').set(authorize(userToken)).expect(200)).body.total).toBe(2);
    await collection([2,3],'B');
    const res = await http().get('/api/me/channels').set(authorize(userToken)).expect(200);
    expect(res.body.total).toBe(3); expect(new Set(res.body.data.map((c: { id: number }) => c.id)).size).toBe(3);
    expect((await http().get('/api/me/collections').set(authorize(userToken)).expect(200)).body).toHaveLength(2);
  });
  it('ALLOW individual concede acceso y DENY prevalece sobre colecciones', async () => {
    await allow(1); await http().get('/api/me/channels/1').set(authorize(userToken)).expect(200);
    await collection([2]); await allow(2,'DENY'); await http().get('/api/channels/2').set(authorize(userToken)).expect(404);
    expect((await http().get('/api/me/channels').set(authorize(userToken)).expect(200)).body.total).toBe(1);
  });
  it('canales ocultos e inactivos son inaccesibles aun con autorización', async () => {
    await allow(4); await allow(5);
    for (const id of [4,5]) await http().get(`/api/me/channels/${id}`).set(authorize(userToken)).expect(404);
    expect((await http().get('/api/me/channels?status=all').set(authorize(userToken)).expect(200)).body.total).toBe(0);
  });
  it('IDOR bloquea canales y streams en ambas familias de rutas', async () => {
    await allow(1);
    for (const base of ['/api/channels','/api/me/channels']) {
      await http().get(`${base}/1/streams`).set(authorize(userToken)).expect(200);
      await http().get(`${base}/2`).set(authorize(userToken)).expect(404);
      await http().get(`${base}/2/streams`).set(authorize(userToken)).expect(404);
      await http().get(`${base}/999`).set(authorize(userToken)).expect(404);
    }
  });
  it('paginación, búsqueda y filtros usan únicamente el conjunto autorizado', async () => {
    await collection([1,3]);
    const res = await http().get('/api/me/channels?limit=1&page=2').set(authorize(userToken)).expect(200);
    expect(res.body).toMatchObject({ total: 2,totalPages: 2 }); expect(res.body.data[0].id).toBe(3);
    expect((await http().get('/api/channels?search=Channel%202&status=all').set(authorize(userToken)).expect(200)).body.total).toBe(0);
    expect((await http().get('/api/me/channels?country=MX').set(authorize(userToken)).expect(200)).body.total).toBe(0);
  });
  it('revocar colección o desactivarla elimina acceso inmediatamente', async () => {
    const col = await collection([1]);
    await http().put(`/api/users/${user.id}/collections`).set(authorize(ownerToken)).send({ ids: [] }).expect(200);
    await http().get('/api/me/channels/1').set(authorize(userToken)).expect(404);
    await http().put(`/api/users/${user.id}/collections`).set(authorize(ownerToken)).send({ ids: [col.id] }).expect(200);
    await http().get('/api/me/channels/1').set(authorize(userToken)).expect(200);
    await http().delete(`/api/admin/collections/${col.id}`).set(authorize(ownerToken)).expect(200);
    await http().get('/api/me/channels/1').set(authorize(userToken)).expect(404);
  });
  it('permisos channels.read no conceden contenido ni acceso administrativo a USER', async () => {
    const role = await db.manager.findOneByOrFail(Role,{ name: 'USER' }); const p = await db.manager.findOneByOrFail(Permission,{ code: 'channels.read' });
    await db.manager.save(RolePermission,{ roleId: role.id,permissionId: p.id });
    expect((await http().get('/api/channels').set(authorize(userToken)).expect(200)).body.total).toBe(0);
    await http().get('/api/admin/channels').set(authorize(userToken)).expect(403);
  });
  it('publicación administra visibilidad sin cambiar isActive del catálogo', async () => {
    await allow(4);
    await http().patch('/api/admin/channels/4/publication').set(authorize(ownerToken)).send({ status: 'PUBLISHED' }).expect(200);
    await http().get('/api/me/channels/4').set(authorize(userToken)).expect(200);
    await http().patch('/api/admin/channels/4/publication').set(authorize(ownerToken)).send({ status: 'DISABLED' }).expect(200);
    await http().get('/api/me/channels/4').set(authorize(userToken)).expect(404);
    expect((await db.manager.findOneByOrFail(Channel,{ id: 4 })).isActive).toBe(true);
  });
  it('colecciones se ordenan, se editan y rechazan reemplazos inválidos transaccionalmente', async () => {
    const col = (await http().post('/api/admin/collections').set(authorize(ownerToken)).send({ name: 'Ordered' }).expect(201)).body;
    await http().put(`/api/admin/collections/${col.id}/channels`).set(authorize(ownerToken)).send({ ids: [3,1] }).expect(200);
    await http().put(`/api/admin/collections/${col.id}/channels`).set(authorize(ownerToken)).send({ ids: [999] }).expect(400);
    const rows = (await http().get(`/api/admin/collections/${col.id}/channels`).set(authorize(ownerToken)).expect(200)).body;
    expect(rows.map((r: { channelId: number }) => r.channelId)).toEqual([3,1]);
    await http().patch(`/api/admin/collections/${col.id}`).set(authorize(ownerToken)).send({ name: 'Renamed' }).expect(200);
  });
  it('reemplaza permisos individuales y permite revocación', async () => {
    await http().put(`/api/users/${user.id}/channels`).set(authorize(ownerToken)).send({ channels: [{ channelId: 1,accessType: 'ALLOW' }] }).expect(200);
    await http().get('/api/me/channels/1').set(authorize(userToken)).expect(200);
    await http().put(`/api/users/${user.id}/channels`).set(authorize(ownerToken)).send({ channels: [] }).expect(200);
    await http().get('/api/me/channels/1').set(authorize(userToken)).expect(404);
  });
  it('revocación administrativa de sesiones protege acceso y registra auditoría sin secretos', async () => {
    const sid = (jwt.decode(userToken) as jwt.JwtPayload).sid;
    await http().delete(`/api/admin/users/${user.id}/sessions/${sid}`).set(authorize(ownerToken)).expect(200);
    await http().get('/api/auth/me').set(authorize(userToken)).expect(401);
    const logs = (await http().get('/api/admin/audit').set(authorize(ownerToken)).expect(200)).body.data;
    expect(logs.some((l: { action: string }) => l.action === 'sessions.revoke')).toBe(true);
    const serialized = JSON.stringify(await db.manager.find(AuditLog)); expect(serialized).not.toContain(password); expect(serialized).not.toContain(userToken);
  });
  it('bootstrap no sobrescribe ni crea un segundo propietario', async () => {
    const dto = { username: 'newowner',email: 'newowner@test.dev',firstName: 'New Owner',password };
    await expect(bootstrapSuperAdmin(db,dto,hash)).rejects.toThrow('Ya existe SUPER_ADMIN');
    // Explicitly remove role links in isolated fixture, retaining all user records.
    await db.getRepository(UserRole).createQueryBuilder().delete().execute();
    await expect(bootstrapSuperAdmin(db,{ ...dto,username: 'viewer',email: user.email },hash)).rejects.toThrow('cuenta ya existe');
    const created = await bootstrapSuperAdmin(db,dto,hash); expect(created.username).toBe('newowner');
    await expect(bootstrapSuperAdmin(db,dto,hash)).rejects.toThrow('Ya existe SUPER_ADMIN');
  });
});

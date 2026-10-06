import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner, Table } from 'typeorm';
import { securitySettings } from '../src/security/settings';
import { strongPassword } from '../src/security/auth.service';
import { authTestEnvironment } from './auth-fixture';
import { ENTITIES } from '../src/database/entities';
import { SecuritySchema1791200000000 } from '../src/database/migrations/1791200000000-SecuritySchema';
import { SecuritySeed1791200000001 } from '../src/database/migrations/1791200000001-SecuritySeed';
import { PERMISSION_CODES, requirePermission } from '../src/security/policy';
class OfflineMariaDb extends DataSource { prepare() { return this.buildMetadatas(); } }
describe('Políticas y migraciones de seguridad', () => {
  it.each(['short','a'.repeat(64),'COLOCAR_SECRETO_ALEATORIO_ACCESS_48_CARACTERES_MINIMO'])('rechaza secreto de configuración inseguro', secret => {
    expect(() => securitySettings(new ConfigService({ ...authTestEnvironment(),JWT_ACCESS_SECRET: secret }))).toThrow('JWT_ACCESS_SECRET');
  });
  it('exige secretos diferentes y TTL/hashing/límites seguros', () => {
    const env = authTestEnvironment();
    expect(() => securitySettings(new ConfigService({ ...env,JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET }))).toThrow('diferentes');
    expect(() => securitySettings(new ConfigService({ ...env,JWT_ACCESS_TTL_SECONDS: 0 }))).toThrow('JWT_ACCESS_TTL_SECONDS');
    expect(() => securitySettings(new ConfigService({ ...env,ARGON2_MEMORY_KIB: 1000 }))).toThrow('ARGON2_MEMORY_KIB');
    expect(securitySettings(new ConfigService(env))).toMatchObject({ accessSeconds: 900,refreshSeconds: 604800 });
  });
  it.each(['short','alllowercase12345','NoNumbers!!!!!','NOLOWERCASE123!','NoSymbols12345'])('rechaza contraseña débil %s', value => {
    expect(() => strongPassword(value)).toThrow();
  });
  it('permite contraseña fuerte y deniega permisos ausentes', () => {
    expect(() => strongPassword('Long-Strong!12345')).not.toThrow();
    const actor = { id: 1,sessionId: '',roles: ['USER'],permissions: [],requiresPasswordChange: false };
    expect(() => requirePermission(actor,'users.read')).toThrow('Permiso requerido');
    expect(() => requirePermission({ ...actor,roles: ['SUPER_ADMIN'] },'users.read')).not.toThrow();
  });
  it('construye metadatos con el driver MariaDB sin conexión ni synchronize', async () => {
    const db = new OfflineMariaDb({ type: 'mariadb',host: '127.0.0.1',username: 'offline',password: 'offline',database: 'hmodevelopers_iptv',entities: ENTITIES,synchronize: false });
    await db.prepare();
    expect(db.entityMetadatas).toHaveLength(17); expect(db.isInitialized).toBe(false);
    expect(db.getMetadata('User').columns.find(c => c.propertyName === 'passwordHash')?.isSelect).toBe(false);
  });
  it('la migración incorpora FK/uniques/checks sin borrar tablas ni datos IPTV', async () => {
    const tables: Table[] = [];
    const runner = { createTable: jest.fn(async (table: Table) => { tables.push(table); }),addColumn: jest.fn(),query: jest.fn() };
    await new SecuritySchema1791200000000().up(runner as unknown as QueryRunner);
    expect(tables).toHaveLength(12);
    expect(tables.find(t => t.name === 'user_channel_access')?.checks[0].expression).toContain('DENY');
    expect(tables.find(t => t.name === 'user_channel_collections')?.uniques[0].columnNames).toEqual(['userId','collectionId']);
    expect(tables.flatMap(t => t.foreignKeys).every(fk => ['RESTRICT','SET NULL'].includes(fk.onDelete!))).toBe(true);
    expect(runner.query).not.toHaveBeenCalled();
  });
  it('seed versionado idempotente no publica canales ni contiene credenciales', async () => {
    const query = jest.fn();
    await new SecuritySeed1791200000001().up({ query } as unknown as QueryRunner);
    const statements = query.mock.calls.map(call => String(call[0]));
    expect(statements.every(sql => sql.includes('INSERT IGNORE'))).toBe(true);
    expect(statements.join(' ')).toContain("SELECT id,'DRAFT' FROM channels");
    expect(statements.join(' ')).not.toMatch(/password|UPDATE channels|DELETE|DROP/i);
    expect(query.mock.calls.filter(call => String(call[0]).includes('INTO permissions'))).toHaveLength(PERMISSION_CODES.length);
  });
});

import { ExecutionContext } from '@nestjs/common';
import { LoginRateGuard } from '../src/security/guards';
import { AuthService } from '../src/security/auth.service';
describe('Límite dedicado a autenticación', () => {
  it('rechaza exceso por IP, no confía en forwarded headers y expira la ventana', () => {
    const guard = new LoginRateGuard({ settings: { loginLimit: 2,loginWindowMs: 1000 } } as unknown as AuthService);
    const req = { ip: '127.0.0.1',headers: { 'x-forwarded-for': 'untrusted' } };
    const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    const now = jest.spyOn(Date,'now').mockReturnValue(1000);
    try {
      expect(guard.canActivate(context)).toBe(true); req.headers['x-forwarded-for'] = 'another';
      expect(guard.canActivate(context)).toBe(true); expect(() => guard.canActivate(context)).toThrow('Demasiadas peticiones');
      now.mockReturnValue(2001); expect(guard.canActivate(context)).toBe(true);
    } finally { now.mockRestore(); }
  });
});

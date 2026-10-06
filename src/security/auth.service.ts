import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { AuthSession, User } from '../database/entities';
import { AuditService } from './audit.service';
import { ChangePasswordDto, LoginDto } from './dto';
import { isSuper, loadPrivileges, Principal } from './policy';
import { securitySettings, SecuritySettings } from './settings';
export function strongPassword(password: string) {
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
    throw new BadRequestException('La contraseña requiere 12–128 caracteres, mayúsculas, minúsculas, números y símbolos');
  }
}
export function safeUser(user: User) {
  const { passwordHash: _hash, failedLoginAttempts: _attempts, lockedUntil: _lock, ...safe } = user;
  void _hash; void _attempts; void _lock;
  return safe;
}
@Injectable()
export class AuthService {
  readonly settings: SecuritySettings;
  private readonly dummy: Promise<string>;
  constructor(private readonly db: DataSource, config: ConfigService, private readonly audit: AuditService) {
    this.settings = securitySettings(config);
    this.dummy = this.hash(randomUUID() + randomUUID());
  }
  hash(password: string) {
    return argon2.hash(password,{ type: argon2.argon2id, memoryCost: this.settings.memoryCost, timeCost: this.settings.timeCost, parallelism: this.settings.parallelism });
  }
  private digest(token: string) { return createHmac('sha256',this.settings.refreshSecret).update(token).digest('hex'); }
  private verify(token: string, kind: 'access' | 'refresh') {
    try {
      const payload = jwt.verify(token,kind === 'access' ? this.settings.accessSecret : this.settings.refreshSecret,
        { algorithms: ['HS256'], issuer: 'hmodevelopers-iptv', audience: kind });
      if (typeof payload === 'string' || payload.kind !== kind || !Number.isSafeInteger(Number(payload.sub)) || typeof payload.sid !== 'string') throw new Error();
      return { userId: Number(payload.sub), sessionId: payload.sid };
    } catch { throw new UnauthorizedException('Credenciales inválidas o sesión vencida'); }
  }
  private tokens(user: User, session: AuthSession) {
    const common = { subject: String(user.id), issuer: 'hmodevelopers-iptv', algorithm: 'HS256' as const };
    const accessToken = jwt.sign({ sid: session.id, kind: 'access' },this.settings.accessSecret,{ ...common, audience: 'access', expiresIn: this.settings.accessSeconds });
    const seconds = Math.max(1,Math.floor((session.expiresAt.getTime()-Date.now())/1000));
    const refreshToken = jwt.sign({ sid: session.id, kind: 'refresh', jti: randomUUID() },this.settings.refreshSecret,{ ...common, audience: 'refresh', expiresIn: seconds });
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: this.settings.accessSeconds, requiresPasswordChange: user.requiresPasswordChange };
  }
  private userQuery(manager: EntityManager) {
    const qb = manager.getRepository(User).createQueryBuilder('u').addSelect('u.passwordHash');
    if (this.db.options.type === 'mariadb') qb.setLock('pessimistic_write');
    return qb;
  }
  async login(dto: LoginDto, ip = '', agent = '') {
    const result = await this.db.transaction(async manager => {
      const user = await this.userQuery(manager).where('u.username = :login OR u.email = :login', { login: dto.username }).getOne();
      const valid = await argon2.verify(user?.passwordHash ?? await this.dummy,dto.password);
      if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
        await this.audit.record(manager,user?.id ?? null,'auth.login','user',user?.id ?? null,ip,'DENIED');
        return null;
      }
      if (!valid) {
        user.failedLoginAttempts++;
        if (user.failedLoginAttempts >= this.settings.maxAttempts) user.lockedUntil = new Date(Date.now()+this.settings.lockSeconds*1000);
        await manager.save(user);
        await this.audit.record(manager,user.id,'auth.login','user',user.id,ip,'DENIED');
        return null;
      }
      user.failedLoginAttempts = 0; user.lockedUntil = null; user.lastLoginAt = new Date();
      await manager.save(user);
      const sessions = await manager.find(AuthSession,{ where: { userId: user.id, revokedAt: IsNull() }, order: { createdAt: 'ASC' } });
      const live = sessions.filter(s => s.expiresAt > new Date());
      while (live.length >= this.settings.maxSessions) await manager.update(AuthSession,live.shift()!.id,{ revokedAt: new Date() });
      const session = manager.create(AuthSession,{ id: randomUUID(), userId: user.id, deviceName: dto.deviceName ?? '',
        userAgent: agent.slice(0,512), ipAddress: ip.slice(0,64), expiresAt: new Date(Date.now()+this.settings.refreshSeconds*1000), lastUsedAt: new Date(), revokedAt: null });
      const tokens = this.tokens(user,session); session.refreshTokenHash = this.digest(tokens.refreshToken);
      await manager.save(session);
      await this.audit.record(manager,user.id,'auth.login','session',session.id,ip);
      return tokens;
    });
    if (!result) throw new UnauthorizedException('Credenciales inválidas o cuenta no disponible');
    return result;
  }
  async authenticate(token: string): Promise<Principal> {
    const claims = this.verify(token,'access');
    const user = await this.db.manager.findOneBy(User,{ id: claims.userId, isActive: true });
    const session = await this.db.manager.findOneBy(AuthSession,{ id: claims.sessionId, userId: claims.userId, revokedAt: IsNull() });
    if (!user || !session || session.expiresAt <= new Date()) throw new UnauthorizedException('Sesión no disponible');
    return { id: user.id, sessionId: session.id, requiresPasswordChange: user.requiresPasswordChange, ...await loadPrivileges(this.db.manager,user.id) };
  }
  async refresh(token: string, ip = '') {
    const claims = this.verify(token,'refresh');
    const result = await this.db.transaction(async manager => {
      const user = await this.userQuery(manager).where('u.id = :id',{ id: claims.userId }).getOne();
      const qb = manager.getRepository(AuthSession).createQueryBuilder('s').addSelect('s.refreshTokenHash')
        .where('s.id = :id AND s.userId = :userId',{ id: claims.sessionId, userId: claims.userId });
      if (this.db.options.type === 'mariadb') qb.setLock('pessimistic_write');
      const session = await qb.getOne();
      if (!session || !user || !user.isActive || session.expiresAt <= new Date()) return null;
      if (session.revokedAt || !timingSafeEqual(Buffer.from(session.refreshTokenHash,'hex'),Buffer.from(this.digest(token),'hex'))) {
        session.revokedAt = new Date(); await manager.save(session);
        await this.audit.record(manager,user.id,'auth.refresh.reuse','session',session.id,ip,'DENIED');
        return null;
      }
      const tokens = this.tokens(user,session); session.refreshTokenHash = this.digest(tokens.refreshToken); session.lastUsedAt = new Date();
      await manager.save(session); await this.audit.record(manager,user.id,'auth.refresh','session',session.id,ip);
      return tokens;
    });
    if (!result) throw new UnauthorizedException('Refresh inválido o revocado');
    return result;
  }
  async profile(actor: Principal) { return safeUser(await this.db.manager.findOneByOrFail(User,{ id: actor.id })); }
  sessions(userId: number) {
    return this.db.manager.find(AuthSession,{ where: { userId, revokedAt: IsNull() }, order: { createdAt: 'DESC' } })
      .then(rows => rows.filter(row => row.expiresAt > new Date()));
  }
  async revoke(actor: Principal, id: string | null, ip = '', userId = actor.id) {
    if (userId !== actor.id && !isSuper(actor)) {
      const target = await loadPrivileges(this.db.manager,userId);
      if ((target.roles.some(r => ['SUPER_ADMIN','ADMIN'].includes(r)) || target.permissions.some(p => /^(users|roles|permissions|settings)\./.test(p)))) throw new ForbiddenException('No puedes revocar sesiones de administradores');
    }
    return this.db.transaction(async manager => {
      const where = id ? { id, userId } : { userId, revokedAt: IsNull() };
      const result = await manager.update(AuthSession,where,{ revokedAt: new Date() });
      await this.audit.record(manager,actor.id,id ? 'sessions.revoke' : 'sessions.revoke-all','user',userId,ip);
      return { revoked: result.affected ?? 0 };
    });
  }
  async changePassword(actor: Principal, dto: ChangePasswordDto, ip = '') {
    strongPassword(dto.newPassword);
    const hash = await this.hash(dto.newPassword);
    await this.db.transaction(async manager => {
      const user = await this.userQuery(manager).where('u.id = :id',{ id: actor.id }).getOneOrFail();
      if (!await argon2.verify(user.passwordHash,dto.currentPassword)) throw new UnauthorizedException('Contraseña actual inválida');
      if (await argon2.verify(user.passwordHash,dto.newPassword)) throw new BadRequestException('La contraseña nueva debe ser diferente');
      user.passwordHash = hash; user.requiresPasswordChange = false; user.failedLoginAttempts = 0; user.lockedUntil = null;
      await manager.save(user); await manager.update(AuthSession,{ userId: user.id, revokedAt: IsNull() },{ revokedAt: new Date() });
      await this.audit.record(manager,actor.id,'auth.password.changed','user',actor.id,ip);
    });
    return { changed: true, loginRequired: true };
  }
}

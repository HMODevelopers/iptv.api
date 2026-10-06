import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, HttpException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from './audit.service';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Principal, requirePermission } from './policy';
export interface AuthRequest extends Request { principal: Principal }
export const Public = () => SetMetadata('security.public',true);
export const PasswordChangeAllowed = () => SetMetadata('security.password-change',true);
export const Permissions = (...codes: string[]) => SetMetadata('security.permissions',codes);
export const Roles = (...roles: string[]) => SetMetadata('security.roles',roles);
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthRequest>().principal);
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('security.public',[ctx.getHandler(),ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Se requiere Bearer JWT');
    req.principal = await this.auth.authenticate(match[1]);
    if (req.principal.requiresPasswordChange && !this.reflector.getAllAndOverride<boolean>('security.password-change',[ctx.getHandler(),ctx.getClass()])) {
      throw new ForbiddenException('Debes cambiar la contraseña temporal');
    }
    return true;
  }
}
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DataSource, private readonly audit: AuditService) {}
  async canActivate(ctx: ExecutionContext) {
    const codes = this.reflector.getAllAndOverride<string[]>('security.permissions',[ctx.getHandler(),ctx.getClass()]) ?? [];
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    try { for (const code of codes) requirePermission(req.principal,code); }
    catch (error) {
      await this.audit.record(this.db.manager,req.principal.id,'security.permission.denied','route',null,req.ip,'DENIED',{ required: codes, route: String(req.route?.path ?? '').slice(0,200) });
      throw error;
    }
    return true;
  }
}
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DataSource, private readonly audit: AuditService) {}
  async canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>('security.roles',[ctx.getHandler(),ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    if (roles && !roles.some(role => req.principal.roles.includes(role))) {
      await this.audit.record(this.db.manager,req.principal.id,'security.role.denied','route',null,req.ip,'DENIED',{ required: roles, route: String(req.route?.path ?? '').slice(0,200) });
      throw new ForbiddenException('Rol requerido');
    }
    return true;
  }
}
@Injectable()
export class LoginRateGuard implements CanActivate {
  private readonly requests = new Map<string,{ count: number; until: number }>();
  constructor(private readonly auth: AuthService) {}
  canActivate(ctx: ExecutionContext) {
    const now = Date.now();
    for (const [key,row] of this.requests) if (row.until <= now) this.requests.delete(key);
    const ip = ctx.switchToHttp().getRequest<Request>().ip ?? 'unknown';
    const row = this.requests.get(ip) ?? { count: 0, until: now+this.auth.settings.loginWindowMs };
    if (this.requests.size >= 10000 && !this.requests.has(ip)) throw new HttpException('Demasiadas peticiones',429);
    row.count++; this.requests.set(ip,row);
    if (row.count > this.auth.settings.loginLimit) throw new HttpException('Demasiadas peticiones',429);
    return true;
  }
}

import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Permission, Role, RolePermission, UserRole } from '../database/entities';
export const PERMISSION_CODES = [
  'users.read','users.create','users.update','users.disable',
  'roles.read','roles.create','roles.update','roles.delete','permissions.read','permissions.assign',
  'channels.read','channels.manage','channels.publish','channels.hide','streams.read','streams.manage',
  'collections.read','collections.create','collections.update','collections.delete','collections.assign',
  'providers.read','providers.manage','sync.execute','sync.history','sessions.read','sessions.revoke','audit.read','settings.manage',
];
export interface Principal {
  id: number; sessionId: string; roles: string[]; permissions: string[]; requiresPasswordChange: boolean;
}
export const isSuper = (actor: Principal) => actor.roles.includes('SUPER_ADMIN');
// Only server-authenticated principals may enter this policy; request DTOs never supply roles.
export function hasAnyRole(actor: Principal, roles: string[]) {
  return isSuper(actor) || roles.some(role => actor.roles.includes(role));
}
export function catalogPrivileges(actor: Principal, scope: 'viewer' | 'administrative' = 'viewer', permission = 'channels.read') {
  if (scope === 'administrative') {
    if (!hasAnyRole(actor,['ADMIN'])) throw new ForbiddenException('Rol requerido');
    requirePermission(actor,permission);
  }
  const global = isSuper(actor) || scope === 'administrative';
  return { unrestrictedContent: global, includeUnavailableStreams: global, defaultChannelState: global ? 'all' : 'active' } as const;
}
export function requirePermission(actor: Principal, permission: string) {
  if (!isSuper(actor) && !actor.permissions.includes(permission)) throw new ForbiddenException('Permiso requerido');
}
export async function loadPrivileges(manager: EntityManager, userId: number) {
  const roles = await manager.getRepository(Role).createQueryBuilder('r')
    .innerJoin(UserRole,'ur','ur.roleId = r.id AND ur.userId = :userId', { userId })
    .where('r.isActive = :active', { active: true }).getMany();
  const permissions = await manager.getRepository(Permission).createQueryBuilder('p')
    .innerJoin(RolePermission,'rp','rp.permissionId = p.id')
    .innerJoin(Role,'r','r.id = rp.roleId AND r.isActive = :active', { active: true })
    .innerJoin(UserRole,'ur','ur.roleId = r.id AND ur.userId = :userId', { userId }).getMany();
  return { roles: roles.map(r => r.name), permissions: permissions.map(p => p.code) };
}
export async function seedSecurity(manager: EntityManager) {
  for (const code of PERMISSION_CODES) {
    if (!await manager.findOneBy(Permission,{ code })) await manager.save(Permission,{ code, description: code, module: code.split('.')[0] });
  }
  for (const name of ['SUPER_ADMIN','ADMIN','USER']) {
    if (!await manager.findOneBy(Role,{ name })) await manager.save(Role,{ name, description: name, isSystem: true, isActive: true });
  }
  const owner = await manager.findOneByOrFail(Role,{ name: 'SUPER_ADMIN' });
  for (const permission of await manager.find(Permission)) {
    if (!await manager.findOneBy(RolePermission,{ roleId: owner.id, permissionId: permission.id })) {
      await manager.save(RolePermission,{ roleId: owner.id, permissionId: permission.id });
    }
  }
}

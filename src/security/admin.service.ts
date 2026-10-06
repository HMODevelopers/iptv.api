import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, QueryFailedError } from 'typeorm';
import { AuthSession, Channel, ChannelCollection, ChannelCollectionItem, ChannelPublication, Permission, Role, RolePermission, User, UserChannelAccess, UserChannelCollection, UserRole } from '../database/entities';
import { PageQuery } from '../channels/dto/query.dto';
import { AuditService } from './audit.service';
import { AuthService, safeUser, strongPassword } from './auth.service';
import { ChannelGrantsDto, CreateCollectionDto, CreateRoleDto, CreateUserDto, PublicationDto, UpdateCollectionDto, UpdateRoleDto, UpdateUserDto } from './dto';
import { isSuper, loadPrivileges, Principal } from './policy';
function onlySuper(actor: Principal) {
  if (!isSuper(actor)) throw new ForbiddenException('Solo SUPER_ADMIN puede gestionar privilegios');
}
@Injectable()
export class AdminService {
  constructor(private readonly db: DataSource, private readonly auth: AuthService, private readonly audit: AuditService) {}
  private async ownerLock(manager: EntityManager) {
    const qb = manager.getRepository(Role).createQueryBuilder('r').where('r.name = :name',{ name: 'SUPER_ADMIN' });
    if (this.db.options.type === 'mariadb') qb.setLock('pessimistic_write');
    return qb.getOneOrFail();
  }
  private async target(manager: EntityManager, actor: Principal, id: number) {
    const user = await manager.findOneBy(User,{ id });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const privilege = await loadPrivileges(manager,id);
    if (!isSuper(actor) && (privilege.roles.some(r => ['SUPER_ADMIN','ADMIN'].includes(r)) || privilege.permissions.some(p => /^(users|roles|permissions|settings)\./.test(p)))) {
      throw new ForbiddenException('No puedes modificar cuentas privilegiadas');
    }
    return user;
  }
  private async lastOwner(manager: EntityManager, id: number) {
    const owners = await manager.getRepository(User).createQueryBuilder('u')
      .innerJoin(UserRole,'ur','ur.userId = u.id').innerJoin(Role,'r',"r.id = ur.roleId AND r.name = 'SUPER_ADMIN'")
      .where('u.isActive = :active',{ active: true }).getMany();
    if (owners.length === 1 && owners[0].id === id) throw new ConflictException('No se puede desactivar o quitar el rol al último SUPER_ADMIN activo');
  }
  private async unique<T>(action: () => Promise<T>) {
    try { return await action(); }
    catch (error) {
      const e = error as { driverError?: { code?: string }; code?: string };
      if (e.driverError?.code === 'ER_DUP_ENTRY' || e.code === 'ER_DUP_ENTRY' || (this.db.options.type === 'sqljs' && error instanceof QueryFailedError && /UNIQUE constraint failed:/.test(error.message))) throw new ConflictException('Nombre de usuario, correo o rol duplicado');
      throw error;
    }
  }
  async users(query: PageQuery) {
    const [data,total] = await this.db.manager.findAndCount(User,{ order: { id: 'ASC' }, skip: (query.page-1)*query.limit, take: query.limit });
    return { data: data.map(safeUser), total, page: query.page, limit: query.limit };
  }
  async user(id: number) {
    const user = await this.db.manager.findOneBy(User,{ id }); if (!user) throw new NotFoundException('Usuario no encontrado');
    return safeUser(user);
  }
  async createUser(actor: Principal, dto: CreateUserDto, ip = '') {
    strongPassword(dto.password); const passwordHash = await this.auth.hash(dto.password);
    return this.unique(() => this.db.transaction(async manager => {
      const user = await manager.save(User,{ username: dto.username, email: dto.email.toLowerCase(), firstName: dto.firstName,
        lastName: dto.lastName ?? '', passwordHash, requiresPasswordChange: true, isActive: true });
      const role = await manager.findOneByOrFail(Role,{ name: 'USER', isActive: true });
      await manager.save(UserRole,{ userId: user.id, roleId: role.id });
      await this.audit.record(manager,actor.id,'users.create','user',user.id,ip);
      return safeUser(user);
    }));
  }
  async updateUser(actor: Principal, id: number, dto: UpdateUserDto, ip = '') {
    return this.unique(() => this.db.transaction(async manager => {
      await this.ownerLock(manager); const user = await this.target(manager,actor,id);
      Object.assign(user,dto); if (dto.email) user.email = dto.email.toLowerCase();
      const updated = await manager.save(user);
      await this.audit.record(manager,actor.id,'users.update','user',id,ip); return safeUser(updated);
    }));
  }
  async status(actor: Principal, id: number, active: boolean, ip = '') {
    return this.db.transaction(async manager => {
      await this.ownerLock(manager); const user = await this.target(manager,actor,id);
      if (!active) await this.lastOwner(manager,id);
      user.isActive = active; await manager.save(user);
      if (!active) await manager.update(AuthSession,{ userId: id, revokedAt: IsNull() },{ revokedAt: new Date() });
      await this.audit.record(manager,actor.id,'users.status','user',id,ip,'SUCCESS',{ isActive: active }); return safeUser(user);
    });
  }
  async rolesFor(id: number) { await this.user(id); return (await loadPrivileges(this.db.manager,id)).roles; }
  async setRoles(actor: Principal, id: number, ids: number[], ip = '') {
    onlySuper(actor); if (actor.id === id) throw new ForbiddenException('No puedes modificar tus propios roles');
    return this.db.transaction(async manager => {
      const owner = await this.ownerLock(manager); await this.target(manager,actor,id);
      const roles = ids.length ? await manager.findBy(Role,{ id: In(ids), isActive: true }) : [];
      if (roles.length !== ids.length) throw new BadRequestException('Roles inválidos');
      if (!ids.includes(owner.id)) await this.lastOwner(manager,id);
      await manager.delete(UserRole,{ userId: id });
      for (const roleId of ids) await manager.save(UserRole,{ userId: id, roleId });
      await this.audit.record(manager,actor.id,'users.roles','user',id,ip,'SUCCESS',{ roleIds: ids });
      return roles.map(r => r.name);
    });
  }
  roles() { return this.db.manager.find(Role,{ order: { id: 'ASC' } }); }
  permissions() { return this.db.manager.find(Permission,{ order: { code: 'ASC' } }); }
  async createRole(actor: Principal, dto: CreateRoleDto, ip = '') {
    onlySuper(actor);
    if (['SUPER_ADMIN','ADMIN','USER'].includes(dto.name)) throw new ForbiddenException('Rol reservado');
    return this.unique(() => this.db.transaction(async manager => {
      const role = await manager.save(Role,{ ...dto, isSystem: false });
      await this.audit.record(manager,actor.id,'roles.create','role',role.id,ip); return role;
    }));
  }
  async updateRole(actor: Principal, id: number, dto: UpdateRoleDto, ip = '') {
    onlySuper(actor);
    return this.unique(() => this.db.transaction(async manager => {
      await this.ownerLock(manager); const role = await manager.findOneBy(Role,{ id });
      if (!role) throw new NotFoundException('Rol no encontrado');
      if (role.isSystem) throw new ForbiddenException('Los roles del sistema están protegidos');
      if (dto.name && ['SUPER_ADMIN','ADMIN','USER'].includes(dto.name)) throw new ForbiddenException('Nombre reservado');
      Object.assign(role,dto); await manager.save(role);
      await this.audit.record(manager,actor.id,'roles.update','role',id,ip); return role;
    }));
  }
  async rolePermissions(id: number) {
    if (!await this.db.manager.findOneBy(Role,{ id })) throw new NotFoundException('Rol no encontrado');
    return this.db.getRepository(Permission).createQueryBuilder('p').innerJoin(RolePermission,'rp','rp.permissionId = p.id AND rp.roleId = :id',{ id }).getMany();
  }
  async setPermissions(actor: Principal, id: number, ids: number[], ip = '') {
    onlySuper(actor);
    return this.db.transaction(async manager => {
      await this.ownerLock(manager); const role = await manager.findOneBy(Role,{ id });
      if (!role) throw new NotFoundException('Rol no encontrado');
      if (role.name === 'SUPER_ADMIN' || role.name === 'USER') throw new ForbiddenException('Permisos del rol reservado protegidos');
      const permissions = ids.length ? await manager.findBy(Permission,{ id: In(ids) }) : [];
      if (permissions.length !== ids.length) throw new BadRequestException('Permisos inválidos');
      await manager.delete(RolePermission,{ roleId: id });
      for (const permissionId of ids) await manager.save(RolePermission,{ roleId: id, permissionId });
      await this.audit.record(manager,actor.id,'roles.permissions','role',id,ip,'SUCCESS',{ permissionIds: ids }); return permissions;
    });
  }
  async userCollections(id: number) {
    await this.user(id);
    return this.db.manager.find(UserChannelCollection,{ where: { userId: id, revokedAt: IsNull() }, relations: { collectionIdRelation: true } });
  }
  async setCollections(actor: Principal, id: number, ids: number[], ip = '') {
    return this.db.transaction(async manager => {
      await this.ownerLock(manager); await this.target(manager,actor,id);
      const collections = ids.length ? await manager.findBy(ChannelCollection,{ id: In(ids), isActive: true }) : [];
      if (collections.length !== ids.length) throw new BadRequestException('Colecciones inválidas');
      await manager.update(UserChannelCollection,{ userId: id, revokedAt: IsNull() },{ revokedAt: new Date() });
      for (const collectionId of ids) {
        const previous = await manager.findOneBy(UserChannelCollection,{ userId: id, collectionId });
        await manager.save(UserChannelCollection,{ ...previous, userId: id, collectionId, assignedBy: actor.id, assignedAt: new Date(), revokedAt: null });
      }
      await this.audit.record(manager,actor.id,'collections.assign','user',id,ip,'SUCCESS',{ collectionIds: ids }); return { assigned: ids.length };
    });
  }
  async userChannels(id: number) { await this.user(id); return this.db.manager.findBy(UserChannelAccess,{ userId: id }); }
  async setChannels(actor: Principal, id: number, dto: ChannelGrantsDto, ip = '') {
    return this.db.transaction(async manager => {
      await this.ownerLock(manager); await this.target(manager,actor,id);
      const ids = dto.channels.map(c => c.channelId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Canales duplicados');
      if (ids.length && await manager.countBy(Channel,{ id: In(ids) }) !== ids.length) throw new BadRequestException('Canales inválidos');
      await manager.delete(UserChannelAccess,{ userId: id });
      for (const item of dto.channels) await manager.save(UserChannelAccess,{ ...item, userId: id, assignedBy: actor.id });
      await this.audit.record(manager,actor.id,'channels.assign','user',id,ip,'SUCCESS',{ grants: dto.channels }); return { assigned: ids.length };
    });
  }
  async collections(query: PageQuery) {
    const [data,total] = await this.db.manager.findAndCount(ChannelCollection,{ order: { id: 'ASC' }, skip: (query.page-1)*query.limit, take: query.limit });
    return { data,total,page: query.page,limit: query.limit };
  }
  async collection(id: number, manager = this.db.manager) {
    const col = await manager.findOneBy(ChannelCollection,{ id }); if (!col) throw new NotFoundException('Colección no encontrada'); return col;
  }
  async createCollection(actor: Principal, dto: CreateCollectionDto, ip = '') {
    return this.db.transaction(async manager => {
      const col = await manager.save(ChannelCollection,{ ...dto, createdBy: actor.id });
      await this.audit.record(manager,actor.id,'collections.create','collection',col.id,ip); return col;
    });
  }
  async updateCollection(actor: Principal, id: number, dto: UpdateCollectionDto, ip = '') {
    return this.db.transaction(async manager => {
      const col = await this.collection(id,manager); Object.assign(col,dto); await manager.save(col);
      await this.audit.record(manager,actor.id,'collections.update','collection',id,ip); return col;
    });
  }
  async deleteCollection(actor: Principal, id: number, ip = '') {
    // Logical deletion keeps historical assignments and audit references.
    return this.updateCollection(actor,id,{ isActive: false },ip);
  }
  async collectionChannels(id: number) {
    await this.collection(id);
    return this.db.manager.find(ChannelCollectionItem,{ where: { collectionId: id }, relations: { channelIdRelation: true }, order: { position: 'ASC' } });
  }
  async collectionAssignments(id: number) { await this.collection(id); return this.db.manager.findBy(UserChannelCollection,{ collectionId: id }); }
  async setCollectionChannels(actor: Principal, id: number, ids: number[], ip = '') {
    return this.db.transaction(async manager => {
      const qb = manager.getRepository(ChannelCollection).createQueryBuilder('c').where('c.id = :id',{ id });
      if (this.db.options.type === 'mariadb') qb.setLock('pessimistic_write');
      if (!await qb.getOne()) throw new NotFoundException('Colección no encontrada');
      if (ids.length && await manager.countBy(Channel,{ id: In(ids) }) !== ids.length) throw new BadRequestException('Canales inválidos');
      await manager.delete(ChannelCollectionItem,{ collectionId: id });
      for (const [position,channelId] of ids.entries()) await manager.save(ChannelCollectionItem,{ collectionId: id, channelId, position });
      await this.audit.record(manager,actor.id,'collections.channels','collection',id,ip,'SUCCESS',{ channelIds: ids }); return { channels: ids.length };
    });
  }
  async getPublication(id: number) {
    if (!await this.db.manager.findOneBy(Channel,{ id })) throw new NotFoundException('Canal no encontrado');
    return await this.db.manager.findOneBy(ChannelPublication,{ channelId: id }) ?? { channelId: id,status: 'DRAFT',publishedAt: null,publishedBy: null };
  }
  async publication(actor: Principal, id: number, dto: PublicationDto, ip = '') {
    return this.db.transaction(async manager => {
      const qb = manager.getRepository(Channel).createQueryBuilder('c').where('c.id = :id',{ id });
      if (this.db.options.type === 'mariadb') qb.setLock('pessimistic_write');
      if (!await qb.getOne()) throw new NotFoundException('Canal no encontrado');
      const prior = await manager.findOneBy(ChannelPublication,{ channelId: id });
      const publication = await manager.save(ChannelPublication,{ ...prior, channelId: id, status: dto.status,
        publishedAt: dto.status === 'PUBLISHED' ? new Date() : prior?.publishedAt ?? null, publishedBy: dto.status === 'PUBLISHED' ? actor.id : prior?.publishedBy ?? null });
      await this.audit.record(manager,actor.id,'channels.publication','channel',id,ip,'SUCCESS',{ status: dto.status }); return publication;
    });
  }
}

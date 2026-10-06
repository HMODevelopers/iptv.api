import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, Role, User, UserRole } from '../database/entities';
import { CreateUserDto } from './dto';
// No seed, update, or elevation of an existing account is performed by bootstrap.
export async function bootstrapSuperAdmin(db: DataSource, dto: CreateUserDto, passwordHash: string) {
  return db.transaction(async manager => {
    const qb = manager.getRepository(Role).createQueryBuilder('r').where('r.name = :name',{ name: 'SUPER_ADMIN' });
    if (db.options.type === 'mariadb') qb.setLock('pessimistic_write');
    const role = await qb.getOneOrFail();
    if (!role.isSystem || !role.isActive) throw new Error('Rol SUPER_ADMIN inválido');
    // Includes inactive/deleted owners, so a second bootstrap can never replace one.
    if (await manager.countBy(UserRole,{ roleId: role.id })) throw new ConflictException('Ya existe SUPER_ADMIN; utiliza la administración autenticada');
    const exists = await manager.getRepository(User).createQueryBuilder('u').withDeleted()
      .where('u.username = :username OR u.email = :email',{ username: dto.username, email: dto.email.toLowerCase() }).getOne();
    if (exists) throw new ConflictException('La cuenta ya existe; bootstrap no concede privilegios a cuentas previas');
    const user = await manager.save(User,{ username: dto.username, email: dto.email.toLowerCase(), firstName: dto.firstName,
      lastName: dto.lastName ?? '', passwordHash, requiresPasswordChange: false, isActive: true });
    await manager.save(UserRole,{ userId: user.id, roleId: role.id });
    await manager.save(AuditLog,{ userId: user.id, action: 'bootstrap.super-admin', module: 'bootstrap', entity: 'user',
      entityId: String(user.id), ipAddress: '', result: 'SUCCESS', metadata: null });
    return { id: user.id, username: user.username };
  });
}

import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from 'typeorm';
import { Channel } from './catalog.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 64, unique: true }) username!: string;
  @Column({ type: 'varchar', length: 254, unique: true }) email!: string;
  @Column({ type: 'varchar', length: 255, select: false }) passwordHash!: string;
  @Column({ type: 'varchar', length: 100 }) firstName!: string;
  @Column({ type: 'varchar', length: 100, default: '' }) lastName!: string;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;
  @Column({ type: 'boolean', default: true }) requiresPasswordChange!: boolean;
  @Column({ type: 'datetime', nullable: true }) lastLoginAt!: Date | null;
  @Column({ type: 'int', default: 0 }) failedLoginAttempts!: number;
  @Column({ type: 'datetime', nullable: true }) lockedUntil!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
  @DeleteDateColumn({ nullable: true }) deletedAt!: Date | null;
}

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 64, unique: true }) name!: string;
  @Column({ type: 'varchar', length: 255, default: '' }) description!: string;
  @Column({ type: 'boolean', default: false }) isSystem!: boolean;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 64, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 255 }) description!: string;
  @Column({ type: 'varchar', length: 64 }) module!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('auth_sessions')
export class AuthSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'int' }) userId!: number;
  @Index() @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'userId' }) userIdRelation!: User;
  @Column({ type: 'varchar', length: 64, select: false }) refreshTokenHash!: string;
  @Column({ type: 'varchar', length: 100, default: '' }) deviceName!: string;
  @Column({ type: 'varchar', length: 512, default: '' }) userAgent!: string;
  @Column({ type: 'varchar', length: 64, default: '' }) ipAddress!: string;
  @Column({ type: 'datetime' }) expiresAt!: Date;
  @Column({ type: 'datetime' }) lastUsedAt!: Date;
  @Column({ type: 'datetime', nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int', nullable: true }) userId!: number | null;
  @Index() @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'userId' }) userIdRelation!: User | null;
  @Column({ type: 'varchar', length: 100 }) action!: string;
  @Column({ type: 'varchar', length: 64 }) module!: string;
  @Column({ type: 'varchar', length: 64 }) entity!: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) entityId!: string | null;
  @Column({ type: 'varchar', length: 64, default: '' }) ipAddress!: string;
  @Column({ type: 'varchar', length: 32, default: 'SUCCESS' }) result!: string;
  @Column({ type: 'simple-json', nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('channel_publications')
export class ChannelPublication {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int', unique: true }) channelId!: number;
  @Index() @ManyToOne(() => Channel, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'channelId' }) channelIdRelation!: Channel;
  @Column({ type: 'varchar', length: 16, default: 'DRAFT' }) status!: string;
  @Column({ type: 'datetime', nullable: true }) publishedAt!: Date | null;
  @Column({ type: 'int', nullable: true }) publishedBy!: number | null;
  @Index() @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'publishedBy' }) publishedByRelation!: User | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('channel_collections')
export class ChannelCollection {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 100 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'boolean', default: true }) isActive!: boolean;
  @Column({ type: 'int', nullable: true }) createdBy!: number | null;
  @Index() @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'createdBy' }) createdByRelation!: User | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('channel_collection_items')
@Unique(['collectionId', 'channelId'])
export class ChannelCollectionItem {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int' }) collectionId!: number;
  @Index() @ManyToOne(() => ChannelCollection, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'collectionId' }) collectionIdRelation!: ChannelCollection;
  @Column({ type: 'int' }) channelId!: number;
  @Index() @ManyToOne(() => Channel, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'channelId' }) channelIdRelation!: Channel;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('user_channel_collections')
@Unique(['userId', 'collectionId'])
export class UserChannelCollection {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int' }) userId!: number;
  @Index() @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'userId' }) userIdRelation!: User;
  @Column({ type: 'int' }) collectionId!: number;
  @Index() @ManyToOne(() => ChannelCollection, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'collectionId' }) collectionIdRelation!: ChannelCollection;
  @Column({ type: 'int', nullable: true }) assignedBy!: number | null;
  @Index() @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'assignedBy' }) assignedByRelation!: User | null;
  @Column({ type: 'datetime' }) assignedAt!: Date;
  @Column({ type: 'datetime', nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('user_channel_access')
@Unique(['userId', 'channelId'])
export class UserChannelAccess {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int' }) userId!: number;
  @Index() @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'userId' }) userIdRelation!: User;
  @Column({ type: 'int' }) channelId!: number;
  @Index() @ManyToOne(() => Channel, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'channelId' }) channelIdRelation!: Channel;
  @Column({ type: 'varchar', length: 8 }) accessType!: string;
  @Column({ type: 'int', nullable: true }) assignedBy!: number | null;
  @Index() @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'assignedBy' }) assignedByRelation!: User | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}

@Entity('user_roles')
export class UserRole {
  @PrimaryColumn({ type: 'int' }) userId!: number;
  @Index() @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'userId' }) userIdRelation!: User;
  @PrimaryColumn({ type: 'int' }) roleId!: number;
  @Index() @ManyToOne(() => Role, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'roleId' }) roleIdRelation!: Role;
}

@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ type: 'int' }) roleId!: number;
  @Index() @ManyToOne(() => Role, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'roleId' }) roleIdRelation!: Role;
  @PrimaryColumn({ type: 'int' }) permissionId!: number;
  @Index() @ManyToOne(() => Permission, { onDelete: 'RESTRICT', nullable: false }) @JoinColumn({ name: 'permissionId' }) permissionIdRelation!: Permission;
}

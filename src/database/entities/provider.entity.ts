import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Channel } from './catalog.entity';
import { User } from './security.entity';
export enum ProviderType { IPTV_ORG = 'IPTV_ORG', M3U_URL = 'M3U_URL', M3U_UPLOAD = 'M3U_UPLOAD', REST_API = 'REST_API', XTREAM = 'XTREAM', MANUAL = 'MANUAL' }
export enum SyncStatus { PENDING = 'PENDING', RUNNING = 'RUNNING', SUCCESS = 'SUCCESS', PARTIAL = 'PARTIAL', FAILED = 'FAILED', CANCELLED = 'CANCELLED' }
@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Index('uq_providers_slug', { unique: true }) @Column({ type: 'varchar', length: 100 }) slug!: string;
  @Column({ type: 'varchar', length: 32 }) type!: ProviderType;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ default: true }) isActive!: boolean;
  @Column({ default: true }) syncEnabled!: boolean;
  @Column({ type: 'varchar', length: 32, default: 'MANUAL' }) syncMode!: string;
  @Column({ type: 'int', default: 0 }) priority!: number;
  @Column({ type: 'simple-json' }) config!: Record<string, unknown>;
  @Column({ type: 'text', nullable: true, select: false }) credentialsEncrypted!: string | null;
  @Column({ type: 'text', nullable: true, select: false }) uploadEncrypted!: string | null;
  @Column({ type: 'datetime', precision: 6, nullable: true }) lastSyncAt!: Date | null;
  @Column({ type: 'datetime', precision: 6, nullable: true }) lastSuccessfulSyncAt!: Date | null;
  @Column({ type: 'int', nullable: true }) createdBy!: number | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'createdBy' }) creator!: User | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
@Entity('provider_channels') @Unique('uq_provider_channel_external', ['providerId','externalId'])
@Index('idx_provider_channels_channel', ['channelId','isActive'])
export class ProviderChannel {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int' }) providerId!: number;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'providerId' }) provider!: Provider;
  @Column({ type: 'int' }) channelId!: number;
  @ManyToOne(() => Channel, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'channelId' }) channel!: Channel;
  @Column({ type: 'varchar', length: 255 }) externalId!: string;
  @Column({ type: 'varchar', length: 255 }) externalName!: string;
  @Column({ type: 'text', nullable: true }) externalLogo!: string | null;
  @Column({ type: 'simple-json' }) metadata!: Record<string, unknown>;
  @Column({ default: true }) isActive!: boolean;
  @Column({ type: 'datetime', precision: 6, nullable: true }) lastSeenAt!: Date | null;
  @CreateDateColumn() createdAt!: Date;
  @UpdateDateColumn() updatedAt!: Date;
}
@Entity('provider_sync_runs') @Index('idx_sync_provider_started', ['providerId','startedAt'])
export class ProviderSyncRun {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'int' }) providerId!: number;
  @ManyToOne(() => Provider, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'providerId' }) provider!: Provider;
  @Column({ type: 'varchar', length: 16, default: SyncStatus.PENDING }) status!: SyncStatus;
  @Column({ type: 'varchar', length: 16 }) triggerType!: string;
  @Column({ type: 'int', nullable: true }) startedBy!: number | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'startedBy' }) actor!: User | null;
  @Column({ type: 'datetime', precision: 6 }) startedAt!: Date;
  @Column({ type: 'datetime', precision: 6, nullable: true }) finishedAt!: Date | null;
  @Column({ type: 'int', default: 0 }) channelsFound!: number;
  @Column({ type: 'int', default: 0 }) channelsCreated!: number;
  @Column({ type: 'int', default: 0 }) channelsUpdated!: number;
  @Column({ type: 'int', default: 0 }) streamsCreated!: number;
  @Column({ type: 'int', default: 0 }) streamsUpdated!: number;
  @Column({ type: 'int', default: 0 }) disabled!: number;
  @Column({ type: 'int', default: 0 }) discarded!: number;
  @Column({ type: 'int', default: 0 }) errors!: number;
  @Column({ type: 'int', default: 0 }) durationMs!: number;
  @Column({ type: 'simple-json', nullable: true }) errorCodes!: string[] | null;
}

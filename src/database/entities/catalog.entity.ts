import { ApiProperty } from '@nestjs/swagger';
import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('countries')
export class Country {
  @ApiProperty({ example: 'MX' }) @PrimaryColumn({ type: 'varchar', length: 2 }) code!: string;
  @ApiProperty() @Column({ type: 'varchar', length: 255 }) name!: string;
  @ApiProperty({ type: [String] }) @Column({ type: 'simple-json' }) languages!: string[];
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'varchar', length: 32, nullable: true }) flag!: string | null;
}

@Entity('categories')
export class Category {
  @ApiProperty() @PrimaryGeneratedColumn() id!: number;
  @ApiProperty() @Index('uq_categories_slug', { unique: true }) @Column({ type: 'varchar', length: 100 }) slug!: string;
  @ApiProperty() @Column({ type: 'varchar', length: 255 }) name!: string;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'text', nullable: true }) description!: string | null;
  @ApiProperty() @CreateDateColumn() createdAt!: Date;
  @ApiProperty() @UpdateDateColumn() updatedAt!: Date;
  @OneToMany(() => ChannelCategory, link => link.category) channelCategories!: ChannelCategory[];
}

@Entity('channels')
@Unique('uq_channels_source_external', ['source', 'externalId'])
@Index('idx_channels_country_active', ['countryCode', 'isActive'])
export class Channel {
  @ApiProperty() @PrimaryGeneratedColumn() id!: number;
  @ApiProperty() @Column({ type: 'varchar', length: 255 }) externalId!: string;
  @ApiProperty() @Index('idx_channels_name') @Column({ type: 'varchar', length: 255 }) name!: string;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'text', nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'varchar', length: 2, nullable: true }) countryCode!: string | null;
  @ApiProperty({ type: () => Country, nullable: true })
  @ManyToOne(() => Country, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'countryCode', foreignKeyConstraintName: 'fk_channels_country' }) country!: Country | null;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'text', nullable: true }) website!: string | null;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'text', nullable: true }) logo!: string | null;
  @ApiProperty() @Column({ type: 'varchar', length: 64 }) source!: string;
  @ApiProperty() @Column({ default: true }) isActive!: boolean;
  @ApiProperty({ nullable: true, type: Date }) @Column({ type: 'datetime', precision: 6, nullable: true }) lastSyncedAt!: Date | null;
  @ApiProperty() @CreateDateColumn() createdAt!: Date;
  @ApiProperty() @UpdateDateColumn() updatedAt!: Date;
  @ApiProperty({ type: () => [ChannelCategory] }) @OneToMany(() => ChannelCategory, link => link.channel) channelCategories!: ChannelCategory[];
  @OneToMany(() => Stream, stream => stream.channel) streams!: Stream[];
}

@Entity('channel_categories')
export class ChannelCategory {
  @ApiProperty() @PrimaryColumn({ type: 'int' }) channelId!: number;
  @ApiProperty() @Index('idx_channel_categories_category') @PrimaryColumn({ type: 'int' }) categoryId!: number;
  @ManyToOne(() => Channel, channel => channel.channelCategories, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'channelId', foreignKeyConstraintName: 'fk_cc_channel' }) channel!: Channel;
  @ApiProperty({ type: () => Category }) @ManyToOne(() => Category, category => category.channelCategories, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'categoryId', foreignKeyConstraintName: 'fk_cc_category' }) category!: Category;
}

export enum StreamStatus { UNKNOWN = 'UNKNOWN', ONLINE = 'ONLINE', OFFLINE = 'OFFLINE' }
@Entity('streams')
@Unique('uq_stream_channel_key', ['channelId','identityKey'])
@Index('idx_stream_channel_status', ['channelId','status'])
@Check('chk_stream_status', "`status` IN ('UNKNOWN','ONLINE','OFFLINE')")
export class Stream {
  @ApiProperty() @PrimaryGeneratedColumn() id!: number;
  @ApiProperty() @Column({ type: 'int' }) channelId!: number;
  @ManyToOne(() => Channel, channel => channel.streams, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'channelId', foreignKeyConstraintName: 'fk_stream_channel' }) channel!: Channel;
  @Column({ type: 'varchar', length: 64, select: false }) identityKey!: string;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'varchar', length: 255, nullable: true }) feedId!: string | null;
  @ApiProperty() @Column({ type: 'varchar', length: 512 }) title!: string;
  @ApiProperty() @Column({ type: 'text' }) url!: string;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'varchar', length: 32, nullable: true }) quality!: string | null;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'varchar', length: 32, nullable: true }) format!: string | null;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'text', nullable: true }) referrer!: string | null;
  @ApiProperty({ nullable: true, type: String }) @Column({ type: 'text', nullable: true }) userAgent!: string | null;
  @ApiProperty({ type: [String] }) @Column({ type: 'simple-json' }) labels!: string[];
  @ApiProperty({ enum: StreamStatus }) @Column({ type: 'varchar', length: 16, default: StreamStatus.UNKNOWN }) status!: StreamStatus;
  @ApiProperty({ nullable: true, type: Date }) @Column({ type: 'datetime', precision: 6, nullable: true }) lastCheckedAt!: Date | null;
  @ApiProperty() @CreateDateColumn() createdAt!: Date;
  @ApiProperty() @UpdateDateColumn() updatedAt!: Date;
}

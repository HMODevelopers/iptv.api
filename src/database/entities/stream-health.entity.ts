import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './security.entity';
export enum HealthRunStatus { RUNNING = 'RUNNING', SUCCESS = 'SUCCESS', PARTIAL = 'PARTIAL', FAILED = 'FAILED', CANCELLED = 'CANCELLED' }
export enum HealthTrigger { HTTP = 'HTTP', CLI = 'CLI', SCHEDULED = 'SCHEDULED' }
@Entity('stream_health_runs') @Index('idx_health_started', ['startedAt'])
export class StreamHealthRun {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar', length: 16 }) status!: HealthRunStatus;
  @Column({ type: 'varchar', length: 16 }) triggerType!: HealthTrigger;
  @Column({ type: 'int', nullable: true }) startedBy!: number | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'startedBy' }) actor!: User | null;
  @Column({ type: 'datetime', precision: 6 }) startedAt!: Date;
  @Column({ type: 'datetime', precision: 6, nullable: true }) finishedAt!: Date | null;
  @Column({ type: 'int', default: 0 }) streamsQueued!: number;
  @Column({ type: 'int', default: 0 }) streamsChecked!: number;
  @Column({ type: 'int', default: 0 }) online!: number;
  @Column({ type: 'int', default: 0 }) offline!: number;
  @Column({ type: 'int', default: 0 }) unknown!: number;
  @Column({ type: 'int', default: 0 }) skipped!: number;
  @Column({ type: 'int', default: 0 }) errors!: number;
  @Column({ type: 'int', default: 0 }) durationMs!: number;
  @Column({ type: 'simple-json', nullable: true }) errorCodes!: string[] | null;
  @CreateDateColumn() createdAt!: Date;
}

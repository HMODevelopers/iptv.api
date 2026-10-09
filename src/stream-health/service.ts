import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { Channel, ChannelPublication, HealthRunStatus, HealthTrigger, Provider, ProviderSyncRun, Stream, StreamHealthRun, StreamStatus, User } from '../database/entities';
import { AuditService } from '../security/audit.service';
import { StreamHealthChecker } from './checker';
import { HealthQuery, HealthRunsQuery } from './dto';
@Injectable()
export class StreamHealthService {
  private static active = false;
  private readonly logger = new Logger(StreamHealthService.name);
  constructor(private readonly db: DataSource,private readonly config: ConfigService,private readonly checker: StreamHealthChecker,private readonly audit: AuditService) {}
  private query(q: HealthQuery,runner?: QueryRunner) {
    const qb = (runner?.manager ?? this.db.manager).getRepository(Stream).createQueryBuilder('s').leftJoin('s.providerChannel','pc').leftJoin('pc.provider','p');
    if (!q.force) qb.andWhere('s.isAvailable = :yes AND s.isDisabled = :no AND pc.isActive = :yes AND p.isActive = :yes',{ yes: true,no: false });
    if (q.status) qb.andWhere('s.status = :status',{ status: q.status });
    if (q.providerId) qb.andWhere('pc.providerId = :provider',{ provider: q.providerId });
    if (q.channelId) qb.andWhere('s.channelId = :channel',{ channel: q.channelId });
    if (q.streamId) qb.andWhere('s.id = :stream',{ stream: q.streamId });
    if (q.staleMinutes) qb.andWhere('(s.lastCheckedAt IS NULL OR s.lastCheckedAt < :stale)',{ stale: new Date(Date.now()-q.staleMinutes*60000) });
    return qb;
  }
  private async reserve(q: HealthQuery,actor: number | null,trigger: HealthTrigger) {
    if (StreamHealthService.active) throw new ConflictException('Health ocupado');
    StreamHealthService.active = true; const runner = this.db.createQueryRunner(); let locked = false;
    try {
      await runner.connect();
      if (this.db.options.type === 'mariadb') {
        const rows: { acquired: number }[] = await runner.query('SELECT GET_LOCK(?,0) AS acquired',['hmo_iptv_stream_health_global']);
        if (Number(rows[0]?.acquired) !== 1) throw new ConflictException('Health ocupado'); locked = true;
      }
      for (const [entity,id] of [[Provider,q.providerId],[Channel,q.channelId],[Stream,q.streamId]] as const) if (id && !await runner.manager.existsBy(entity,{ id })) throw new NotFoundException('Recurso no encontrado');
      await runner.manager.update(StreamHealthRun,{ status: HealthRunStatus.RUNNING },{ status: HealthRunStatus.CANCELLED,finishedAt: new Date(),errorCodes: ['PROCESS_INTERRUPTED'] });
      const maxId = Number((await this.query(q,runner).select('MAX(s.id)','id').getRawOne<{ id: number }>())?.id ?? 0);
      const run = await runner.manager.save(StreamHealthRun,{ status: HealthRunStatus.RUNNING,triggerType: trigger,startedBy: actor,startedAt: new Date(),streamsQueued: await this.query(q,runner).getCount(),errorCodes: [] });
      const scope = q.streamId ? 'stream' : q.providerId ? 'provider' : q.channelId ? 'channel' : 'run';
      await this.audit.record(runner.manager,actor,`stream-health.${scope}`,scope,q.streamId ?? q.providerId ?? q.channelId ?? run.id);
      return { runner,locked,run,maxId };
    } catch (error) { await this.release(runner,locked); throw error; }
  }
  private async release(runner: QueryRunner,locked: boolean) {
    try { if (locked) await runner.query('SELECT RELEASE_LOCK(?)',['hmo_iptv_stream_health_global']); }
    finally { try { await runner.release(); } finally { StreamHealthService.active = false; } }
  }
  async start(q: HealthQuery,actor: number) {
    const reservation = await this.reserve(q,actor,HealthTrigger.HTTP);
    setImmediate(() => { void this.execute(q,reservation).catch(() => this.logger.error('Health fallido; consultar historial')); });
    return { id: reservation.run.id,status: reservation.run.status };
  }
  async run(q: HealthQuery,actor: number | null = null,trigger = HealthTrigger.CLI) { return this.execute(q,await this.reserve(q,actor,trigger)); }
  private async execute(q: HealthQuery,r: Awaited<ReturnType<StreamHealthService['reserve']>>) {
    const { run } = r; const start = Date.now(); let cursor = 0;
    this.logger.log(`Health run started: ${run.id}; queued: ${run.streamsQueued}`);
    try {
      while (true) {
        const batch = await this.query(q,r.runner).addSelect('s.identityKey').andWhere('s.id > :cursor AND s.id <= :max',{ cursor,max: r.maxId }).orderBy('s.id','ASC').take(this.config.get<number>('STREAM_HEALTH_BATCH_SIZE',100)).getMany();
        if (!batch.length) break; cursor = batch[batch.length-1].id; let index = 0;
        await Promise.all(Array.from({ length: Math.min(batch.length,this.config.get<number>('STREAM_HEALTH_CONCURRENCY',10)) },async () => {
          while (index < batch.length) {
            const s = batch[index++];
            try {
              const result = await this.checker.check(s); const online = result.status === StreamStatus.ONLINE;
              const update = await r.runner.manager.getRepository(Stream).createQueryBuilder().update().set({ status: result.status,lastCheckedAt: result.checkedAt,
                ...(online ? { lastSuccessAt: result.checkedAt,consecutiveSuccesses: () => 'consecutiveSuccesses + 1',consecutiveFailures: 0 } : { lastFailureAt: result.checkedAt,consecutiveFailures: () => 'consecutiveFailures + 1',consecutiveSuccesses: 0 }),
                responseTimeMs: result.responseTimeMs,lastHttpStatus: result.httpStatus,failureReason: result.failureReason,
              }).where('id = :id AND identityKey = :key AND url = :url',{ id: s.id,key: s.identityKey,url: s.url }).execute();
              if (!update.affected) run.skipped++;
              else { run.streamsChecked++; if (online) run.online++; else run.offline++; }
            } catch { run.errors++; if (!run.errorCodes!.includes('CHECK_PERSISTENCE_FAILED')) run.errorCodes!.push('CHECK_PERSISTENCE_FAILED'); }
          }
        }));
        await r.runner.manager.update(StreamHealthRun,run.id,{ streamsChecked: run.streamsChecked,online: run.online,offline: run.offline,skipped: run.skipped,errors: run.errors });
      }
      run.skipped = Math.max(run.skipped,run.streamsQueued-run.streamsChecked-run.errors);
      run.status = run.errors ? HealthRunStatus.PARTIAL : HealthRunStatus.SUCCESS;
    } catch { run.status = HealthRunStatus.FAILED; run.errors++; run.errorCodes!.push('RUN_FAILED'); }
    finally {
      run.finishedAt = new Date(); run.durationMs = Date.now()-start;
      try { await r.runner.manager.save(StreamHealthRun,run); }
      finally { await this.release(r.runner,r.locked); }
    }
    this.logger.log(`Health run completed: ${run.id}; online: ${run.online}; offline: ${run.offline}`); return run;
  }
  async runs(q: HealthRunsQuery) {
    const [data,total] = await this.db.getRepository(StreamHealthRun).findAndCount({ where: { ...(q.status ? { status: q.status } : {}),...(q.triggerType ? { triggerType: q.triggerType } : {}),...(q.startedBy ? { startedBy: q.startedBy } : {}) },order: { id: 'DESC' },skip: (q.page-1)*q.limit,take: q.limit });
    return { data,total,page: q.page,limit: q.limit };
  }
  async stats(): Promise<{ totalStreams: number; online: number; offline: number; unknown: number; available: number; disabled: number; checkedLastHour: number; checkedLast24Hours: number; providers: Record<string, unknown>[] }> {
    const totals = await this.db.getRepository(Stream).createQueryBuilder('s').select('COUNT(*)','totalStreams')
      .addSelect("SUM(CASE WHEN s.status = 'ONLINE' THEN 1 ELSE 0 END)",'online').addSelect("SUM(CASE WHEN s.status = 'OFFLINE' THEN 1 ELSE 0 END)",'offline')
      .addSelect("SUM(CASE WHEN s.status = 'UNKNOWN' THEN 1 ELSE 0 END)",'unknown').addSelect('SUM(CASE WHEN s.isAvailable = true THEN 1 ELSE 0 END)','available')
      .addSelect('SUM(CASE WHEN s.isDisabled = true THEN 1 ELSE 0 END)','disabled').addSelect('SUM(CASE WHEN s.lastCheckedAt >= :hour THEN 1 ELSE 0 END)','checkedLastHour')
      .addSelect('SUM(CASE WHEN s.lastCheckedAt >= :day THEN 1 ELSE 0 END)','checkedLast24Hours').setParameters({ hour: new Date(Date.now()-3600000),day: new Date(Date.now()-86400000) }).getRawOne<Record<string,string>>();
    const providers = await this.db.getRepository(Provider).createQueryBuilder('p').leftJoin('provider_channels','pc','pc.providerId = p.id').leftJoin(Stream,'s','s.providerChannelId = pc.id')
      .select('p.id','providerId').addSelect('p.name','providerName').addSelect('COUNT(s.id)','total')
      .addSelect("SUM(CASE WHEN s.status = 'ONLINE' THEN 1 ELSE 0 END)",'online').addSelect("SUM(CASE WHEN s.status = 'OFFLINE' THEN 1 ELSE 0 END)",'offline')
      .addSelect("SUM(CASE WHEN s.status = 'UNKNOWN' THEN 1 ELSE 0 END)",'unknown').addSelect("AVG(CASE WHEN s.status = 'ONLINE' THEN s.responseTimeMs END)",'averageResponseTimeMs')
      .addSelect('MAX(s.lastCheckedAt)','lastCheckedAt').groupBy('p.id').addGroupBy('p.name').getRawMany();
    return { totalStreams: Number(totals?.totalStreams ?? 0),online: Number(totals?.online ?? 0),offline: Number(totals?.offline ?? 0),unknown: Number(totals?.unknown ?? 0),available: Number(totals?.available ?? 0),disabled: Number(totals?.disabled ?? 0),checkedLastHour: Number(totals?.checkedLastHour ?? 0),checkedLast24Hours: Number(totals?.checkedLast24Hours ?? 0),providers: providers.map(p => ({ ...p,providerId: Number(p.providerId),total: Number(p.total),online: Number(p.online),offline: Number(p.offline),unknown: Number(p.unknown),averageResponseTimeMs: p.averageResponseTimeMs === null ? null : Number(p.averageResponseTimeMs),onlinePercentage: Number(p.total) ? Number(p.online)*100/Number(p.total) : 0 })) };
  }
  async dashboard() {
    const counts = async (entity: typeof Channel | typeof Provider | typeof User) => ({ total: await this.db.manager.count(entity),active: await this.db.manager.count(entity,{ where: { isActive: true } }) });
    const publications = await this.db.getRepository(ChannelPublication).createQueryBuilder('p').select('p.status','status').addSelect('COUNT(*)','total').groupBy('p.status').getRawMany();
    const stats = await this.stats();
    return { channels: { ...await counts(Channel),...Object.fromEntries(['DRAFT','PUBLISHED','HIDDEN','DISABLED'].map(status => [status.toLowerCase(),Number(publications.find(p => p.status === status)?.total ?? 0)])) },
      streams: { total: stats.totalStreams,online: stats.online,offline: stats.offline,unknown: stats.unknown },providers: await counts(Provider),users: await counts(User),
      sync: { lastRuns: await this.db.getRepository(ProviderSyncRun).find({ order: { id: 'DESC' },take: 5 }) },health: { lastRun: await this.db.getRepository(StreamHealthRun).findOne({ where: {},order: { id: 'DESC' } }) } };
  }
}

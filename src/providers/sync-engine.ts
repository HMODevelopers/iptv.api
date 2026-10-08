import { ConflictException, Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, QueryRunner } from 'typeorm';
import { Category, ChannelPublication, Channel, ChannelCategory, Country, Stream, StreamStatus, Provider, ProviderChannel, ProviderSyncRun, SyncStatus, ProviderType } from '../database/entities';
import { NormalizedSnapshot } from './normalized-catalog';
import { Environment } from '../config/environment';
import { AuditService } from '../security/audit.service';
export interface SyncStatistics { processed: number; created: number; updated: number; streams: number; errors: number; discarded: number; durationMs: number }
export async function ensureReservedProvider(db: DataSource, type: ProviderType.IPTV_ORG | ProviderType.MANUAL): Promise<Provider> {
  const slug = type === ProviderType.IPTV_ORG ? 'iptv-org' : 'manual';
  const repo = db.getRepository(Provider);
  const existing = await repo.findOneBy({ slug });
  if (existing) return existing;
  await repo.createQueryBuilder().insert().values({ slug,name: type === ProviderType.IPTV_ORG ? 'IPTV-org' : 'Manual',type,config: {},syncEnabled: type !== ProviderType.MANUAL }).orIgnore().execute();
  return repo.findOneByOrFail({ slug });
}
export async function refreshCanonical(manager: EntityManager, id: number) {
  const channel = await manager.getRepository(Channel).findOneOrFail({ where: { id },...(manager.connection.options.type === 'mariadb' && manager.queryRunner?.isTransactionActive ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
  const active = await manager.getRepository(ProviderChannel).createQueryBuilder('pc').innerJoin('pc.provider','p')
    .where('pc.channelId = :id AND pc.isActive = :active AND p.isActive = :active',{ id,active: true }).getCount();
  await manager.update(Channel,id,{ isActive: active > 0 && channel.editorialOverrides?.isActive !== false });
}
@Injectable()
export class ProviderSyncEngine {
  private static readonly active = new Set<number>();
  static isActive(id: number) { return this.active.has(id); }
  private readonly logger = new Logger(ProviderSyncEngine.name);
  constructor(private readonly db: DataSource, private readonly config: ConfigService<Environment,true>,
    private readonly audit: AuditService) {}
  private async reserve(provider: Provider, userId: number | null, trigger: string) {
    if (!provider.isActive || !provider.syncEnabled) throw new BadRequestException('Proveedor deshabilitado para sincronización');
    if (ProviderSyncEngine.active.has(provider.id)) throw new ConflictException('Ya existe una sincronización activa');
    ProviderSyncEngine.active.add(provider.id);
    const runner = this.db.createQueryRunner(); const lock = `hmo_iptv_provider_sync_${provider.id}`;
    let acquired = false;
    try {
      await runner.connect();
      if (this.db.options.type === 'mariadb') {
        const rows: { acquired: number }[] = await runner.query('SELECT GET_LOCK(?, 0) AS acquired',[lock]);
        if (Number(rows[0]?.acquired) !== 1) throw new ConflictException('Ya existe una sincronización activa');
        acquired = true;
      }
      const current = await runner.manager.getRepository(Provider).createQueryBuilder('p').addSelect(['p.credentialsEncrypted','p.uploadEncrypted']).where('p.id = :id',{ id: provider.id }).getOneOrFail();
      if (!current.isActive || !current.syncEnabled) throw new BadRequestException('Proveedor deshabilitado para sincronización');
      Object.assign(provider,current);
      // A previous process may have died; owning the DB lock proves it is no longer running.
      await runner.manager.update(ProviderSyncRun,{ providerId: provider.id,status: SyncStatus.RUNNING },{ status: SyncStatus.CANCELLED,finishedAt: new Date(),errorCodes: ['PROCESS_INTERRUPTED'] });
      const run = await runner.manager.save(ProviderSyncRun,{ providerId: provider.id,startedBy: userId,triggerType: trigger,startedAt: new Date(),status: SyncStatus.RUNNING });
      await this.audit.record(runner.manager,userId,'provider.sync','provider',provider.id);
      return { runner,run,lock,acquired };
    } catch (error) {
      try { if (acquired) await runner.query('SELECT RELEASE_LOCK(?)',[lock]); } finally { await runner.release(); ProviderSyncEngine.active.delete(provider.id); }
      throw error;
    }
  }
  async start(provider: Provider, userId: number, fetch: () => Promise<NormalizedSnapshot>) {
    const reservation = await this.reserve(provider,userId,'HTTP');
    // Work starts after reservation; request returns immediately, all failures are persisted.
    setImmediate(() => { void this.execute(provider,reservation,fetch).catch(() => this.logger.error('Sincronización fallida; consultar historial sanitizado')); });
    return { id: reservation.run.id,providerId: provider.id,status: reservation.run.status };
  }
  async sync(provider: Provider, fetch: () => Promise<NormalizedSnapshot>, userId: number | null = null): Promise<SyncStatistics> {
    return this.execute(provider,await this.reserve(provider,userId,'CLI'),fetch);
  }
  private async execute(provider: Provider, reservation: { runner: QueryRunner; run: ProviderSyncRun; lock: string; acquired: boolean }, fetch: () => Promise<NormalizedSnapshot>) {
    const { runner,run,lock,acquired } = reservation;
    const start = Date.now(); const syncedAt = new Date();
    const stats: SyncStatistics = { processed: 0,created: 0,updated: 0,streams: 0,errors: 0,discarded: 0,durationMs: 0 };
    let streamsCreated = 0; let streamsUpdated = 0; let disabled = 0; let found = 0;
    try {
      const snapshot = await fetch(); found = snapshot.channels.length; stats.discarded = snapshot.discarded;
      const batchSize = this.config.get<number>('IPTV_SYNC_BATCH_SIZE') ?? 100;
      const batch = async <T>(items: T[], write: (chunk: T[]) => Promise<void>) => {
        for (let offset = 0; offset < items.length; offset += batchSize) {
          await runner.startTransaction(this.db.options.type === 'mariadb' ? 'READ COMMITTED' : undefined);
          try { await write(items.slice(offset,offset + batchSize)); await runner.commitTransaction(); }
          catch (error) { await runner.rollbackTransaction(); throw error; }
        }
      };
      await batch(snapshot.countries,async items => { for (const item of items) await runner.manager.save(Country,item); });
      await batch(snapshot.categories,async items => {
        for (const item of items) { const prev = await runner.manager.findOneBy(Category,{ slug: item.slug }); await runner.manager.save(Category,{ ...prev,...item }); }
      });
      const categories = new Map((await runner.manager.find(Category)).map(c => [c.slug,c.id]));
      for (let offset = 0; offset < snapshot.channels.length; offset += batchSize) {
        const chunk = snapshot.channels.slice(offset,offset+batchSize); const counts = { created: 0,updated: 0,streamsCreated: 0,streamsUpdated: 0 };
        await runner.startTransaction(this.db.options.type === 'mariadb' ? 'READ COMMITTED' : undefined);
        try {
          for (const item of chunk) {
            let link = await runner.manager.findOneBy(ProviderChannel,{ providerId: provider.id,externalId: item.externalId });
            const source = provider.type === ProviderType.IPTV_ORG ? 'iptv-org' : `provider:${provider.id}`;
            const previous = link ? await runner.manager.getRepository(Channel).findOneOrFail({ where: { id: link.channelId },...(this.db.options.type === 'mariadb' ? { lock: { mode: 'pessimistic_write' as const } } : {}) }) : await runner.manager.findOneBy(Channel,{ source,externalId: item.externalId });
            const { categorySlugs,...fields } = item;
            // Imported metadata remains on the source. Only its original canonical owner updates presentation.
            const owns = !previous || (previous.source === source && previous.externalId === item.externalId);
            const channelRepo = runner.manager.getRepository(Channel);
            const channel = owns ? await channelRepo.save(channelRepo.create({ ...previous,...fields,...Object.fromEntries(Object.entries(previous?.editorialOverrides ?? {}).filter(([key]) => key !== 'categoryIds')),source,lastSyncedAt: syncedAt,
              isActive: previous?.editorialOverrides?.isActive as boolean | undefined ?? fields.isActive })) : previous!;
            if (previous) counts.updated++; else { counts.created++; await runner.manager.save(ChannelPublication,{ channelId: channel.id,status: 'DRAFT' }); }
            link = await runner.manager.save(ProviderChannel,{ ...link,providerId: provider.id,channelId: channel.id,externalId: item.externalId,
              externalName: item.name,externalLogo: item.logo,metadata: { description: item.description,countryCode: item.countryCode,categorySlugs },isActive: item.isActive,lastSeenAt: syncedAt });
            await refreshCanonical(runner.manager,channel.id);
            if (owns && !previous?.editorialOverrides?.categoryIds) {
              await runner.manager.update(ChannelCategory,{ channelId: channel.id },{ isCurrent: false });
              for (const slug of categorySlugs) if (categories.has(slug)) await runner.manager.save(ChannelCategory,{ channelId: channel.id,categoryId: categories.get(slug)!,isCurrent: true });
            }
            const streamRepo = runner.manager.getRepository(Stream);
            // Nullable provenance is adopted only for a legacy IPTV-org channel.
            if (provider.type === ProviderType.IPTV_ORG && owns) await streamRepo.createQueryBuilder().update().set({ providerChannelId: link.id }).where('channelId = :id AND providerChannelId IS NULL',{ id: channel.id }).execute();
            const existing = await streamRepo.createQueryBuilder('s').addSelect('s.identityKey').where('s.providerChannelId = :id',{ id: link.id }).getMany();
            const old = new Map(existing.map(s => [s.identityKey,s])); const retained = new Set<string>();
            for (const stream of snapshot.streams.get(item.externalId) ?? []) {
              retained.add(stream.identityKey); const prior = old.get(stream.identityKey);
              await streamRepo.save(streamRepo.create({ ...prior,...stream,channelId: channel.id,providerChannelId: link.id,
                isAvailable: item.isActive && !prior?.isDisabled,status: prior?.status ?? StreamStatus.UNKNOWN,lastCheckedAt: prior?.lastCheckedAt ?? null }));
              if (prior) counts.streamsUpdated++; else counts.streamsCreated++;
            }
            const removed = existing.filter(s => !retained.has(s.identityKey)).map(s => s.id);
            if (removed.length) await streamRepo.update({ id: In(removed) },{ isAvailable: false });
          }
          await runner.commitTransaction(); stats.created += counts.created; stats.updated += counts.updated;
          streamsCreated += counts.streamsCreated; streamsUpdated += counts.streamsUpdated; stats.processed += chunk.length;
        } catch { await runner.rollbackTransaction(); stats.errors++; }
      }
      if (!stats.errors) {
        const stale = await runner.manager.getRepository(ProviderChannel).createQueryBuilder('p').where('p.providerId = :id',{ id: provider.id })
          .andWhere('(p.lastSeenAt IS NULL OR p.lastSeenAt < :at OR p.isActive = :inactive)',{ at: syncedAt,inactive: false }).getMany();
        await batch(stale,async links => {
          for (const link of links) {
            await runner.manager.update(ProviderChannel,link.id,{ isActive: false });
            await runner.manager.update(Stream,{ providerChannelId: link.id },{ isAvailable: false });
            await refreshCanonical(runner.manager,link.channelId);
          }
        }); disabled = stale.length;
      }
      run.status = stats.errors ? SyncStatus.PARTIAL : SyncStatus.SUCCESS;
      if (!stats.errors) await runner.manager.update(Provider,provider.id,{ lastSuccessfulSyncAt: new Date() });
    } catch (error) { stats.errors++; run.status = SyncStatus.FAILED; throw error; }
    finally {
      stats.durationMs = Date.now()-start; stats.streams = streamsCreated+streamsUpdated;
      try {
        await runner.manager.update(ProviderSyncRun,run.id,{ status: run.status,finishedAt: new Date(),channelsFound: found,channelsCreated: stats.created,
          channelsUpdated: stats.updated,streamsCreated,streamsUpdated,disabled,discarded: stats.discarded,errors: stats.errors,durationMs: stats.durationMs,
          errorCodes: stats.errors ? ['SYNC_FAILED_OR_BATCH_ROLLED_BACK'] : [] });
        await runner.manager.update(Provider,provider.id,{ lastSyncAt: new Date() });
      } finally {
        try { if (acquired) await runner.query('SELECT RELEASE_LOCK(?)',[lock]); }
        finally { await runner.release(); ProviderSyncEngine.active.delete(provider.id); }
      }
    }
    return stats;
  }
}

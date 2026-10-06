import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { Category, Channel, ChannelCategory, Country, Stream, StreamStatus } from '../../database/entities';
import { Environment } from '../../config/environment';
import { IptvOrgClient } from './iptv-org.client';
import { normalizeSnapshot } from './normalizer';

export interface SyncStatistics {
  processed: number; created: number; updated: number; streams: number;
  errors: number; discarded: number; durationMs: number;
}
@Injectable()
export class IptvOrgSyncService {
  private readonly logger = new Logger(IptvOrgSyncService.name);
  constructor(private readonly dataSource: DataSource, private readonly client: IptvOrgClient,
    private readonly config: ConfigService<Environment, true>) {}

  async sync(): Promise<SyncStatistics> {
    const start = Date.now();
    const stats: SyncStatistics = { processed: 0, created: 0, updated: 0, streams: 0, errors: 0, discarded: 0, durationMs: 0 };
    // HTTP and normalization complete before any write or DB transaction.
    let snapshot: ReturnType<typeof normalizeSnapshot>;
    try { snapshot = normalizeSnapshot(await this.client.fetchSnapshot()); }
    catch (error) {
      stats.errors = 1; stats.durationMs = Date.now() - start;
      this.logger.log(JSON.stringify(stats));
      throw error;
    }
    stats.discarded = snapshot.discarded;
    const batchSize = this.config.get('IPTV_SYNC_BATCH_SIZE', { infer: true });
    const source = this.client.source;
    const syncedAt = new Date();
    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      if (this.dataSource.options.type === 'mariadb') {
        const rows: { acquired: number }[] = await runner.query("SELECT GET_LOCK('hmodevelopers_iptv:sync:iptv-org', 0) AS acquired");
        if (Number(rows[0]?.acquired) !== 1) throw new Error('Otra sincronización está en curso');
        locked = true;
      }
      const batch = async <T>(items: T[], write: (chunk: T[]) => Promise<void>) => {
        for (let offset = 0; offset < items.length; offset += batchSize) {
          await runner.startTransaction();
          try { await write(items.slice(offset,offset + batchSize)); await runner.commitTransaction(); }
          catch (error) { await runner.rollbackTransaction(); throw error; }
        }
      };
      // Remove previously imported channels that have become blocked/NSFW.
      await batch([...snapshot.excludedIds], async ids => {
        await runner.manager.delete(Channel, { source, externalId: In(ids) });
      });
      await batch(snapshot.countries, async items => {
        const repo = runner.manager.getRepository(Country);
        for (const item of items) await repo.save(item);
      });
      await batch(snapshot.categories, async items => {
        const repo = runner.manager.getRepository(Category);
        for (const item of items) {
          const previous = await repo.findOneBy({ slug: item.slug });
          await repo.save(repo.create({ ...previous, ...item }));
        }
      });
      const categories = new Map((await runner.manager.find(Category)).map(item => [item.slug,item.id]));
      for (let offset = 0; offset < snapshot.channels.length; offset += batchSize) {
        const chunk = snapshot.channels.slice(offset,offset + batchSize);
        const counts = { created: 0, updated: 0, streams: 0 };
        await runner.startTransaction();
        try {
          for (const item of chunk) {
            const { categorySlugs, ...fields } = item;
            const repo = runner.manager.getRepository(Channel);
            const previous = await repo.findOneBy({ source, externalId: item.externalId });
            const channel = await repo.save(repo.create({ ...previous, ...fields, source, lastSyncedAt: syncedAt }));
            if (previous) counts.updated++; else counts.created++;
            await runner.manager.delete(ChannelCategory, { channelId: channel.id });
            for (const slug of categorySlugs) {
              await runner.manager.save(ChannelCategory, { channelId: channel.id, categoryId: categories.get(slug)! });
            }
            const streamRepo = runner.manager.getRepository(Stream);
            const existing = await streamRepo.createQueryBuilder('s').addSelect('s.identityKey').where('s.channelId = :id', { id: channel.id }).getMany();
            const old = new Map(existing.map(stream => [stream.identityKey,stream]));
            const retained = new Set<string>();
            for (const stream of snapshot.streams.get(item.externalId) ?? []) {
              retained.add(stream.identityKey);
              const prior = old.get(stream.identityKey);
              await streamRepo.save(streamRepo.create({ ...prior, ...stream, channelId: channel.id,
                status: prior?.status ?? StreamStatus.UNKNOWN, lastCheckedAt: prior?.lastCheckedAt ?? null }));
              counts.streams++;
            }
            const removed = existing.filter(stream => !retained.has(stream.identityKey)).map(stream => stream.id);
            if (removed.length) await streamRepo.delete(removed);
          }
          await runner.commitTransaction();
          stats.created += counts.created; stats.updated += counts.updated; stats.streams += counts.streams;
          stats.processed += chunk.length;
        } catch {
          await runner.rollbackTransaction(); stats.errors++;
          this.logger.error(`Lote ${Math.floor(offset / batchSize) + 1} revertido; no se registran datos sensibles`);
        }
      }
      // Reconcile disappeared records only after all batches have committed successfully.
      if (!stats.errors) {
        const stale = await runner.manager.getRepository(Channel).createQueryBuilder('c')
          .where('c.source = :source', { source })
          .andWhere('(c.lastSyncedAt IS NULL OR c.lastSyncedAt < :at)', { at: syncedAt }).getMany();
        await batch(stale, async items => {
          const ids = items.map(channel => channel.id);
          await runner.manager.delete(Stream, { channelId: In(ids) });
          await runner.manager.update(Channel, { id: In(ids) }, { isActive: false });
        });
      }
    } catch (error) {
      stats.errors++; stats.durationMs = Date.now() - start;
      this.logger.log(JSON.stringify(stats));
      throw error;
    } finally {
      try { if (locked) await runner.query("SELECT RELEASE_LOCK('hmodevelopers_iptv:sync:iptv-org')"); }
      finally { await runner.release(); }
    }
    stats.durationMs = Date.now() - start;
    this.logger.log(JSON.stringify(stats));
    return stats;
  }
}

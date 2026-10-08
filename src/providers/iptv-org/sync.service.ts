import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ProviderType } from '../../database/entities';
import { Environment } from '../../config/environment';
import { AuditService } from '../../security/audit.service';
import { IptvOrgClient } from './iptv-org.client';
import { normalizeSnapshot } from './normalizer';
import { ensureReservedProvider, ProviderSyncEngine } from '../sync-engine';
export { SyncStatistics } from '../sync-engine';
/** Compatibility facade: CLI and HTTP share a single persistence/reconciliation engine. */
@Injectable()
export class IptvOrgSyncService {
  constructor(private readonly db: DataSource, private readonly client: IptvOrgClient, private readonly config: ConfigService<Environment,true>) {}
  async sync() {
    const provider = await ensureReservedProvider(this.db,ProviderType.IPTV_ORG);
    const engine = new ProviderSyncEngine(this.db,this.config,new AuditService(this.db));
    return engine.sync(provider,async () => normalizeSnapshot(await this.client.fetchSnapshot()));
  }
}

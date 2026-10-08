import { MigrationInterface, QueryRunner } from 'typeorm';
/** Additive backfill: no channel, publication, grant or collection is recreated. */
export class MultiProvider1791300000000 implements MigrationInterface {
  name = 'MultiProvider1791300000000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE providers (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY, name varchar(255) NOT NULL, slug varchar(100) NOT NULL,
      type varchar(32) NOT NULL, description text NULL, isActive tinyint NOT NULL DEFAULT 1,
      syncEnabled tinyint NOT NULL DEFAULT 1, syncMode varchar(32) NOT NULL DEFAULT 'MANUAL', priority int NOT NULL DEFAULT 0,
      config text NOT NULL, credentialsEncrypted text NULL, uploadEncrypted mediumtext NULL,
      lastSyncAt datetime(6) NULL, lastSuccessfulSyncAt datetime(6) NULL, createdBy int NULL,
      createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_providers_slug(slug), CONSTRAINT fk_providers_creator FOREIGN KEY(createdBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await r.query(`CREATE TABLE provider_channels (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY, providerId int NOT NULL, channelId int NOT NULL,
      externalId varchar(255) NOT NULL, externalName varchar(255) NOT NULL, externalLogo text NULL,
      metadata text NOT NULL, isActive tinyint NOT NULL DEFAULT 1, lastSeenAt datetime(6) NULL,
      createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_provider_channel_external(providerId,externalId), KEY idx_provider_channels_channel(channelId,isActive),
      CONSTRAINT fk_pc_provider FOREIGN KEY(providerId) REFERENCES providers(id) ON DELETE RESTRICT,
      CONSTRAINT fk_pc_channel FOREIGN KEY(channelId) REFERENCES channels(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await r.query(`CREATE TABLE provider_sync_runs (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY, providerId int NOT NULL, status varchar(16) NOT NULL DEFAULT 'PENDING', triggerType varchar(16) NOT NULL,
      startedBy int NULL, startedAt datetime(6) NOT NULL, finishedAt datetime(6) NULL,
      channelsFound int NOT NULL DEFAULT 0, channelsCreated int NOT NULL DEFAULT 0, channelsUpdated int NOT NULL DEFAULT 0,
      streamsCreated int NOT NULL DEFAULT 0, streamsUpdated int NOT NULL DEFAULT 0, disabled int NOT NULL DEFAULT 0,
      discarded int NOT NULL DEFAULT 0, errors int NOT NULL DEFAULT 0, durationMs int NOT NULL DEFAULT 0, errorCodes text NULL,
      KEY idx_sync_provider_started(providerId,startedAt),
      CONSTRAINT fk_sync_provider FOREIGN KEY(providerId) REFERENCES providers(id) ON DELETE RESTRICT,
      CONSTRAINT fk_sync_actor FOREIGN KEY(startedBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await r.query(`ALTER TABLE channels ADD editorialOverrides text NULL`);
    await r.query(`ALTER TABLE streams ADD providerChannelId int NULL, ADD priority int NOT NULL DEFAULT 0,
      ADD isPreferred tinyint NOT NULL DEFAULT 0, ADD isDisabled tinyint NOT NULL DEFAULT 0,
      ADD CONSTRAINT fk_stream_provider_channel FOREIGN KEY(providerChannelId) REFERENCES provider_channels(id) ON DELETE RESTRICT`);
    await r.query(`INSERT INTO providers(name,slug,type,config,syncEnabled) VALUES ('IPTV-org','iptv-org','IPTV_ORG','{}',1),('Manual','manual','MANUAL','{}',0)`);
    // Preserve non-IPTV legacy provenance as reserved manual records; never expose to external reconciliation.
    await r.query(`INSERT INTO provider_channels(providerId,channelId,externalId,externalName,externalLogo,metadata,isActive,lastSeenAt)
      SELECT p.id,c.id,CASE WHEN c.source = 'iptv-org' THEN c.externalId ELSE CONCAT('legacy:',c.id) END,c.name,c.logo,'{}',c.isActive,c.lastSyncedAt
      FROM channels c JOIN providers p ON p.slug = CASE WHEN c.source = 'iptv-org' THEN 'iptv-org' ELSE 'manual' END`);
    await r.query(`UPDATE streams s JOIN provider_channels pc ON pc.channelId = s.channelId SET s.providerChannelId = pc.id`);
    // The old FK needs an index beginning with channelId before its unique index is removed.
    // idx_stream_channel_status already supplies it in InitialCatalog.
    await r.query(`ALTER TABLE streams DROP INDEX uq_stream_channel_key, ADD UNIQUE KEY uq_stream_source_key(providerChannelId,identityKey)`);
  }
  async down(): Promise<void> {
    // Multi-source streams can legitimately collide under the old identity constraint.
    throw new Error('Rollback destructivo no soportado: restaurar respaldo verificado de fase 2 con la aplicación detenida');
  }
}

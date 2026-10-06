import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialCatalog1760000000000 implements MigrationInterface {
  name = 'InitialCatalog1760000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE countries (
      code varchar(2) NOT NULL, name varchar(255) NOT NULL, languages text NOT NULL,
      flag varchar(32) NULL, PRIMARY KEY (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE categories (
      id int NOT NULL AUTO_INCREMENT, slug varchar(100) NOT NULL, name varchar(255) NOT NULL,
      description text NULL, createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_categories_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE channels (
      id int NOT NULL AUTO_INCREMENT, externalId varchar(255) NOT NULL, name varchar(255) NOT NULL,
      description text NULL, countryCode varchar(2) NULL, website text NULL, logo text NULL,
      source varchar(64) NOT NULL, isActive tinyint NOT NULL DEFAULT 1, lastSyncedAt datetime(6) NULL,
      createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_channels_source_external (source, externalId),
      KEY idx_channels_country_active (countryCode, isActive), KEY idx_channels_name (name),
      CONSTRAINT fk_channels_country FOREIGN KEY (countryCode) REFERENCES countries(code) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE channel_categories (
      channelId int NOT NULL, categoryId int NOT NULL, PRIMARY KEY (channelId, categoryId),
      KEY idx_channel_categories_category (categoryId),
      CONSTRAINT fk_cc_channel FOREIGN KEY (channelId) REFERENCES channels(id) ON DELETE CASCADE,
      CONSTRAINT fk_cc_category FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await queryRunner.query(`CREATE TABLE streams (
      id int NOT NULL AUTO_INCREMENT, channelId int NOT NULL, identityKey varchar(64) NOT NULL,
      feedId varchar(255) NULL, title varchar(512) NOT NULL, url text NOT NULL, quality varchar(32) NULL,
      format varchar(32) NULL, referrer text NULL, userAgent text NULL, labels text NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'UNKNOWN', lastCheckedAt datetime(6) NULL,
      createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (id), UNIQUE KEY uq_stream_channel_key (channelId, identityKey),
      KEY idx_stream_channel_status (channelId, status),
      CONSTRAINT fk_stream_channel FOREIGN KEY (channelId) REFERENCES channels(id) ON DELETE CASCADE,
      CONSTRAINT chk_stream_status CHECK (status IN ('UNKNOWN','ONLINE','OFFLINE'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['streams','channel_categories','channels','categories','countries']) {
      await queryRunner.query(`DROP TABLE \`${table}\``);
    }
  }
}

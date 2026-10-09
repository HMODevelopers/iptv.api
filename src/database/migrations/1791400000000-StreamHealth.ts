import { MigrationInterface, QueryRunner } from 'typeorm';
export class StreamHealth1791400000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE streams
      ADD lastSuccessAt datetime(6) NULL, ADD lastFailureAt datetime(6) NULL,
      ADD responseTimeMs int NULL, ADD lastHttpStatus int NULL,
      ADD consecutiveSuccesses int NOT NULL DEFAULT 0, ADD consecutiveFailures int NOT NULL DEFAULT 0,
      ADD failureReason varchar(32) NULL, ADD INDEX idx_stream_health_checked (lastCheckedAt)`);
    await q.query(`CREATE TABLE stream_health_runs (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY, status varchar(16) NOT NULL, triggerType varchar(16) NOT NULL,
      startedBy int NULL, startedAt datetime(6) NOT NULL, finishedAt datetime(6) NULL,
      streamsQueued int NOT NULL DEFAULT 0, streamsChecked int NOT NULL DEFAULT 0,
      online int NOT NULL DEFAULT 0, offline int NOT NULL DEFAULT 0, unknown int NOT NULL DEFAULT 0,
      skipped int NOT NULL DEFAULT 0, errors int NOT NULL DEFAULT 0, durationMs int NOT NULL DEFAULT 0,
      errorCodes text NULL, createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_health_started (startedAt), CONSTRAINT fk_health_actor FOREIGN KEY (startedBy) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE stream_health_runs');
    await q.query(`ALTER TABLE streams DROP INDEX idx_stream_health_checked, DROP lastSuccessAt, DROP lastFailureAt,
      DROP responseTimeMs, DROP lastHttpStatus, DROP consecutiveSuccesses, DROP consecutiveFailures, DROP failureReason`);
  }
}

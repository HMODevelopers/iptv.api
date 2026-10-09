import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { ENTITIES, Stream, StreamHealthRun } from '../src/database/entities';
import { StreamHealth1791400000000 } from '../src/database/migrations/1791400000000-StreamHealth';
class OfflineMariaDb extends DataSource { async prepare() { await this.buildMetadatas(); } }
describe('Stream health migration without external DB',() => {
  it('adds fields without rewriting streams or historical migrations',async () => {
    const query = jest.fn(async (_sql: string) => { void _sql; }); await new StreamHealth1791400000000().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(call => String(call[0])).join('\n');
    expect(sql).toContain('ADD consecutiveFailures int NOT NULL DEFAULT 0'); expect(sql).toContain('CREATE TABLE stream_health_runs');
    expect(sql).not.toMatch(/UPDATE streams|DELETE FROM|DROP TABLE|ADD status|ADD lastCheckedAt/);
  });
  it('MariaDB metadata has nullable timestamps, defaults, actor and checked index',async () => {
    const db = new OfflineMariaDb({ type: 'mariadb',database: 'hmodevelopers_iptv',entities: ENTITIES,synchronize: false }); await db.prepare();
    const stream = db.getMetadata(Stream); expect(stream.columns.find(c => c.propertyName === 'consecutiveFailures')?.default).toBe(0);
    expect(stream.columns.find(c => c.propertyName === 'lastSuccessAt')?.isNullable).toBe(true);
    expect(stream.indices.some(i => i.name === 'idx_stream_health_checked')).toBe(true);
    expect(db.getMetadata(StreamHealthRun).foreignKeys.some(f => f.onDelete === 'SET NULL')).toBe(true); expect(db.isInitialized).toBe(false);
  });
});

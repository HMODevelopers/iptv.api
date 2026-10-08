import 'reflect-metadata';
import { DataSource, QueryRunner } from 'typeorm';
import { ENTITIES, Provider, ProviderChannel, Stream } from '../src/database/entities';
import { MultiProvider1791300000000 } from '../src/database/migrations/1791300000000-MultiProvider';
class OfflineMariaDb extends DataSource { async prepare() { await this.buildMetadatas(); } }
describe('Migración multiproveedor sin conexión externa', () => {
  it('driver MariaDB reconoce procedencia, unicidad por fuente y columnas sensibles ocultas', async () => {
    const db = new OfflineMariaDb({ type: 'mariadb',database: 'hmodevelopers_iptv',entities: ENTITIES,synchronize: false }); await db.prepare();
    expect(db.getMetadata(Provider).columns.find(c => c.propertyName === 'credentialsEncrypted')?.isSelect).toBe(false);
    expect(db.getMetadata(ProviderChannel).indices.find(u => u.isUnique && u.name === 'uq_provider_channel_external')?.columns.map(c => c.propertyName)).toEqual(['providerId','externalId']);
    expect(db.getMetadata(Stream).indices.find(u => u.isUnique && u.name === 'uq_stream_source_key')?.columns.map(c => c.propertyName)).toEqual(['providerChannelId','identityKey']);
    expect(db.getMetadata(Stream).foreignKeys.some(f => f.referencedEntityMetadata.target === ProviderChannel)).toBe(true);
    expect(db.isInitialized).toBe(false);
  });
  it('backfill antecede al cambio de constraint; no recrea catálogo ni modifica decisiones editoriales', async () => {
    const sql: string[] = []; const runner = { query: jest.fn(async (query: string) => { sql.push(query); }) };
    await new MultiProvider1791300000000().up(runner as unknown as QueryRunner);
    const backfill = sql.findIndex(q => q.startsWith('INSERT INTO provider_channels'));
    const provenance = sql.findIndex(q => q.startsWith('UPDATE streams'));
    const constraint = sql.findIndex(q => q.includes('DROP INDEX uq_stream_channel_key'));
    expect(backfill).toBeLessThan(provenance); expect(provenance).toBeLessThan(constraint);
    expect(sql.join('\n')).not.toMatch(/DELETE FROM|DROP TABLE|UPDATE channels|channel_publications|user_channel_access|channel_collection/);
    await expect(new MultiProvider1791300000000().down()).rejects.toThrow('respaldo');
  });
});

import { DataSource, EntityManager } from 'typeorm';
import { Provider } from '../entities';
import { providerUrl } from '../../providers/safe-http';
import { DEFAULT_PROVIDERS } from './provider-catalog';

export async function seedProviders(manager: EntityManager) {
  const results: { name: string; status: 'CREATED' | 'EXISTS' }[] = [];
  for (const definition of DEFAULT_PROVIDERS) {
    if (definition.config.url) providerUrl(definition.config.url); // Local syntax check only.
    const existing = await manager.findOneBy(Provider, { slug: definition.slug });
    if (existing) {
      if (existing.type !== definition.type) throw new Error(`Tipo incompatible para slug reservado del catálogo: ${definition.slug}`);
      results.push({ name: definition.name, status: 'EXISTS' });
      continue;
    }
    await manager.insert(Provider, { ...definition, syncMode: 'MANUAL', createdBy: null,
      credentialsEncrypted: null, uploadEncrypted: null });
    results.push({ name: definition.name, status: 'CREATED' });
  }
  return results;
}

/** Validate before connecting; the CLI never runs migrations or synchronizes schema. */
export function assertProviderSeedTarget(db: DataSource) {
  if (db.options.type !== 'mariadb' || db.options.database !== 'hmodevelopers_iptv' ||
      db.options.synchronize || db.options.migrationsRun) throw new Error('Seed requiere MariaDB / hmodevelopers_iptv sin cambios automáticos de schema');
}

export async function runProviderSeed(db: DataSource) {
  assertProviderSeedTarget(db);
  const runner = db.createQueryRunner();
  let locked = false;
  try {
    await runner.connect();
    const rows: { acquired: number }[] = await runner.query('SELECT GET_LOCK(?, 0) AS acquired', ['hmo_iptv_provider_seed']);
    if (Number(rows[0]?.acquired) !== 1) throw new Error('Otro seed de proveedores está activo');
    locked = true;
    // Read the ledger directly: TypeORM showMigrations can create a missing table.
    const migrations: { name: string }[] = await runner.query('SELECT name FROM iptv_migrations');
    const applied = new Set(migrations.map(m => m.name));
    if (db.migrations.some(m => !applied.has(m.name ?? m.constructor.name))) throw new Error('Aplica las migraciones pendientes antes del seed');
    const table = await runner.getTable('providers');
    if (!applied.has('MultiProvider1791300000000') || !table || db.getMetadata(Provider).columns.some(c => !table.findColumnByName(c.databaseName)) ||
        ![...table.indices, ...table.uniques].some(i => (!('isUnique' in i) || i.isUnique) && i.columnNames.length === 1 && i.columnNames[0] === 'slug')) {
      throw new Error('Schema multiproveedor incompleto; requiere MultiProvider1791300000000 y slug único');
    }
    await runner.startTransaction('READ COMMITTED');
    try {
      const results = await seedProviders(runner.manager);
      await runner.commitTransaction();
      return results;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
  } finally {
    try { if (locked) await runner.query('SELECT RELEASE_LOCK(?)', ['hmo_iptv_provider_seed']); }
    finally { await runner.release(); }
  }
}

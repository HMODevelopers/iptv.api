import db from '../database/data-source';
import { assertProviderSeedTarget, runProviderSeed } from '../database/seeds/provider-seed';
import { PROVIDER_CATALOG_VERSION } from '../database/seeds/provider-catalog';

async function main() {
  try {
    assertProviderSeedTarget(db);
    await db.initialize();
    const results = await runProviderSeed(db);
    console.log(`Provider seed — catálogo v${PROVIDER_CATALOG_VERSION}\n`);
    for (const row of results) console.log(`${row.name.padEnd(28)} ${row.status}`);
    console.log(`\nCreated: ${results.filter(r => r.status === 'CREATED').length}\nExisting: ${results.filter(r => r.status === 'EXISTS').length}\nUpdated: 0\nErrors: 0`);
  } catch {
    // Driver errors can contain connection details; do not print them.
    console.error('Provider seed falló. Verifica configuración, migraciones/schema, slugs y disponibilidad de la base. Errors: 1');
    process.exitCode = 1;
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
void main();

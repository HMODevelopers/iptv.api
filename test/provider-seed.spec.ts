import { DataSource, QueryRunner, Table, TableIndex } from 'typeorm';
import { runProviderSeed } from '../src/database/seeds/provider-seed';
import { DEFAULT_PROVIDERS } from '../src/database/seeds/provider-catalog';

describe('Provider seed validación y ciclo transaccional sin conexión', () => {
  function fixture() {
    const db = new DataSource({ type: 'mariadb', database: 'hmodevelopers_iptv' });
    const table = new Table({ name: 'providers',columns: [{ name: 'slug',type: 'varchar' }],
      indices: [new TableIndex({ name: 'uq_providers_slug',columnNames: ['slug'],isUnique: true })] });
    const runner = {
      connect: jest.fn(),release: jest.fn(),startTransaction: jest.fn(),commitTransaction: jest.fn(),rollbackTransaction: jest.fn(),
      getTable: jest.fn().mockResolvedValue(table),
      query: jest.fn(async (sql: string) => sql.includes('GET_LOCK') ? [{ acquired: 1 }] : [{ name: 'MultiProvider1791300000000' }]),
      manager: { findOneBy: jest.fn(async (_entity: unknown,where: { slug: string }) => DEFAULT_PROVIDERS.find(p => p.slug === where.slug)),insert: jest.fn() },
    };
    jest.spyOn(db,'createQueryRunner').mockReturnValue(runner as unknown as QueryRunner);

    jest.spyOn(db,'getMetadata').mockReturnValue({ columns: [{ databaseName: 'slug' }] } as ReturnType<DataSource['getMetadata']>);
    return { db,runner };
  }
  it('valida schema, confirma y libera lock y conexión', async () => {
    const { db,runner } = fixture();
    expect((await runProviderSeed(db)).every(r => r.status === 'EXISTS')).toBe(true);
    expect(runner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.query).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?)',['hmo_iptv_provider_seed']);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it.each(['pending','schema','lock'])('rechaza %s antes de escribir y libera recursos', async reason => {
    const { db,runner } = fixture();
    if (reason === 'pending') db.migrations.push({ name: 'PendingMigration',up: jest.fn(),down: jest.fn() });
    if (reason === 'schema') runner.getTable.mockResolvedValue(undefined);
    if (reason === 'lock') runner.query.mockResolvedValue([{ acquired: 0 }] as never);
    await expect(runProviderSeed(db)).rejects.toThrow();
    expect(runner.startTransaction).not.toHaveBeenCalled();
    expect(runner.manager.insert).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
    if (reason === 'lock') expect(runner.query).toHaveBeenCalledTimes(1);
  });
  it('revierte y libera recursos si falla la escritura', async () => {
    const { db,runner } = fixture();
    runner.manager.findOneBy.mockResolvedValue(undefined);
    runner.manager.insert.mockRejectedValue(new Error('insert failed'));
    await expect(runProviderSeed(db)).rejects.toThrow('insert failed');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
});

import 'reflect-metadata';
import axios from 'axios';
import { DataSource } from 'typeorm';
import { ENTITIES, Provider, ProviderType } from '../src/database/entities';
import { seedProviders, assertProviderSeedTarget } from '../src/database/seeds/provider-seed';
import { DEFAULT_PROVIDERS } from '../src/database/seeds/provider-catalog';
import { AdapterRegistry } from '../src/providers/adapters';
import { IptvOrgClient } from '../src/providers/iptv-org/iptv-org.client';
import { CredentialsService } from '../src/providers/credentials.service';

describe('Provider seed aislado SQL.js', () => {
  let db: DataSource;
  beforeEach(async () => {
    db = await new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true }).initialize();
  });
  afterEach(async () => { jest.restoreAllMocks(); await db.destroy(); });
  const run = () => db.transaction(m => seedProviders(m));
  const snapshot = () => db.getRepository(Provider).createQueryBuilder('p').addSelect(['p.credentialsEncrypted','p.uploadEncrypted']).orderBy('p.id').getMany();

  it('crea solo tres externos con reservados existentes; veinte ejecuciones preservan IDs y registros completos', async () => {
    for (const definition of DEFAULT_PROVIDERS.slice(0,2)) await db.manager.insert(Provider, { ...definition });
    expect((await run()).map(r => r.status)).toEqual(['EXISTS','EXISTS','CREATED','CREATED','CREATED']);
    const before = await snapshot();
    for (let i = 0; i < 20; i++) expect((await run()).every(r => r.status === 'EXISTS')).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(before.slice(2).map(p => [p.slug,p.type,p.isActive,p.syncEnabled,p.priority,p.createdBy,p.credentialsEncrypted])).toEqual([
      ['free-tv',ProviderType.M3U_URL,false,false,100,null,null],
      ['freecasthub-public-iptv',ProviderType.M3U_URL,false,false,110,null,null],
      ['rw1986-iptv',ProviderType.M3U_URL,false,false,200,null,null],
    ]);
  });
  it('preserva decisiones administrativas, URL, descripciones, credenciales y timestamps', async () => {
    await run();
    const p = await db.manager.findOneByOrFail(Provider,{ slug: 'free-tv' });
    await db.manager.update(Provider,p.id,{ isActive: true,syncEnabled: true,priority: 5,config: { url: 'https://example.org/custom.m3u' },description: '',credentialsEncrypted: 'opaque-admin-value' });
    await db.manager.update(Provider,{ slug: 'iptv-org' },{ isActive: false,syncEnabled: false });
    const before = await snapshot(); await run(); expect(await snapshot()).toEqual(before);
  });
  it('recupera reservados ausentes; sin HTTP, sync, canales, usuarios, auditoría ni publicaciones', async () => {
    const http = jest.spyOn(axios,'get').mockRejectedValue(new Error('HTTP forbidden'));
    const fetch = jest.spyOn(globalThis,'fetch').mockRejectedValue(new Error('HTTP forbidden'));
    const registry = new AdapterRegistry({} as IptvOrgClient,{} as CredentialsService);
    const sync = DEFAULT_PROVIDERS.map(p => jest.spyOn(registry.get(p.type),'fetch'));
    for (const definition of DEFAULT_PROVIDERS) registry.get(definition.type).validate(definition.config);
    const otherTables = db.entityMetadatas.filter(m => m.target !== Provider);
    const before = await Promise.all(otherTables.map(m => db.manager.count(m.target)));
    await run();
    expect(await Promise.all(otherTables.map(m => db.manager.count(m.target)))).toEqual(before);
    expect(http).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    for (const spy of sync) expect(spy).not.toHaveBeenCalled();
    expect((await db.manager.findOneByOrFail(Provider,{ slug: 'manual' }))).toMatchObject({ config: {},syncEnabled: false });
    expect((await snapshot()).every(p => !p.credentialsEncrypted && !p.uploadEncrypted)).toBe(true);
  });
  it('revierte toda la transacción ante un slug incompatible', async () => {
    await db.manager.insert(Provider,{ ...DEFAULT_PROVIDERS[4],type: ProviderType.M3U_UPLOAD });
    await expect(run()).rejects.toThrow('incompatible');
    expect(await db.manager.count(Provider)).toBe(1);
  });
  it('rechaza otra base o cambios automáticos antes de conectarse', () => {
    for (const options of [{ database: 'other' },{ synchronize: true },{ migrationsRun: true }]) {
      const target = new DataSource({ type: 'mariadb',database: 'hmodevelopers_iptv',...options });
      expect(() => assertProviderSeedTarget(target)).toThrow(); expect(target.isInitialized).toBe(false);
    }
    expect(() => assertProviderSeedTarget(db)).toThrow();
  });
});

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Category, Channel, ChannelCategory, ChannelPublication, Country, Provider, ProviderChannel, ProviderSyncRun, ProviderType, Stream, StreamStatus } from '../database/entities';
import { AuditService } from '../security/audit.service';
import { AdapterRegistry } from './adapters';
import { CredentialsService } from './credentials.service';
import { ProviderSyncEngine, ensureReservedProvider, refreshCanonical } from './sync-engine';
import { CreateProviderDto, UpdateProviderDto, ManualChannelDto, UpdateChannelDto, ManualStreamDto, UpdateStreamDto, SyncQuery } from './dto';
import { PageQuery } from '../channels/dto/query.dto';
import { parseM3u } from './m3u';
import { publicHttpUrl, streamFormat } from '../common/url-policy';
@Injectable()
export class ProvidersService {
  constructor(private readonly db: DataSource, private readonly adapters: AdapterRegistry, private readonly secrets: CredentialsService,
    private readonly engine: ProviderSyncEngine, private readonly audit: AuditService) {}
  async provider(id: number, sensitive = false) {
    const qb = this.db.getRepository(Provider).createQueryBuilder('p').where('p.id = :id',{ id });
    if (sensitive) qb.addSelect(['p.credentialsEncrypted','p.uploadEncrypted']);
    const provider = await qb.getOne(); if (!provider) throw new NotFoundException('Proveedor no encontrado'); return provider;
  }
  response(p: Provider) {
    const { credentialsEncrypted: _credentials,uploadEncrypted: _upload,...safe } = p;
    void _credentials; void _upload;
    const adapter = this.adapters.get(p.type);
    return { ...safe,capabilities: adapter.capabilities,syncSupported: adapter.syncSupported };
  }
  async list(q: PageQuery) {
    const [data,total] = await this.db.getRepository(Provider).findAndCount({ order: { priority: 'ASC',id: 'ASC' },skip: (q.page-1)*q.limit,take: q.limit });
    return { data: data.map(p => this.response(p)),total,page: q.page,limit: q.limit };
  }
  private validateSecrets(type: ProviderType, credentials?: Record<string,string>) {
    if (!credentials) return;
    if (Buffer.byteLength(JSON.stringify(credentials)) > 32768 || Object.keys(credentials).length > 20 || Object.entries(credentials).some(([k,v]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k) || typeof v !== 'string' || v.length > 8192 || /[\r\n]/.test(v))) throw new BadRequestException('Credenciales inválidas');
    if (type === ProviderType.M3U_URL && Object.keys(credentials).some(k => k !== 'token')) throw new BadRequestException('M3U_URL solo soporta token Bearer');
    if ([ProviderType.IPTV_ORG,ProviderType.MANUAL,ProviderType.M3U_UPLOAD].includes(type) && Object.keys(credentials).length) throw new BadRequestException('Este proveedor no acepta credenciales');
  }
  async create(dto: CreateProviderDto, actor: number) {
    if (['iptv-org','manual'].includes(dto.slug) || [ProviderType.IPTV_ORG,ProviderType.MANUAL].includes(dto.type)) throw new BadRequestException('Proveedor reservado; utiliza su registro existente');
    this.adapters.get(dto.type).validate(dto.config); this.validateSecrets(dto.type,dto.credentials);
    if (await this.db.manager.existsBy(Provider,{ slug: dto.slug })) throw new ConflictException('Slug ya registrado');
    return this.db.transaction(async m => {
      const { credentials,...fields } = dto;
      const provider = await m.save(Provider,{ ...fields,createdBy: actor });
      if (credentials) await m.update(Provider,provider.id,{ credentialsEncrypted: this.secrets.encrypt(JSON.stringify(credentials),`credentials:${provider.id}`) });
      await this.audit.record(m,actor,'provider.create','provider',provider.id);
      if (credentials) await this.audit.record(m,actor,'provider.credentials.update','provider',provider.id);
      return this.response(provider);
    });
  }
  async update(id: number, dto: UpdateProviderDto, actor: number) {
    return this.withProvider(id,async m => {
      const previous = await m.findOneByOrFail(Provider,{ id });
      if ((dto.type && dto.type !== previous.type) || (dto.slug && dto.slug !== previous.slug)) throw new BadRequestException('Tipo y slug son inmutables');
      if (previous.type === ProviderType.MANUAL && (dto.isActive === false || dto.syncEnabled === true)) throw new BadRequestException('MANUAL reservado permanece activo sin sincronización');
      this.adapters.get(previous.type).validate(dto.config ?? previous.config); this.validateSecrets(previous.type,dto.credentials);
      const { credentials,...fields } = dto;
      const provider = await m.save(Provider,{ ...previous,...fields });
      if (dto.isActive === false) {
        for (const link of await m.findBy(ProviderChannel,{ providerId: id })) { await m.update(Stream,{ providerChannelId: link.id },{ isAvailable: false }); await refreshCanonical(m,link.channelId); }
      }
      if (credentials) await m.update(Provider,id,{ credentialsEncrypted: this.secrets.encrypt(JSON.stringify(credentials),`credentials:${id}`) });
      await this.audit.record(m,actor,'provider.update','provider',id);
      if (dto.isActive !== undefined && dto.isActive !== previous.isActive) await this.audit.record(m,actor,dto.isActive ? 'provider.enable' : 'provider.disable','provider',id);
      if (credentials) await this.audit.record(m,actor,'provider.credentials.update','provider',id);
      return this.response(provider);
    });
  }
  async test(id: number, actor: number) {
    return this.withProvider(id,async m => {
      const p = await m.getRepository(Provider).createQueryBuilder('p').addSelect(['p.credentialsEncrypted','p.uploadEncrypted']).where('p.id = :id',{ id }).getOneOrFail(); await this.adapters.get(p.type).test(p);
      await this.audit.record(m,actor,'provider.test','provider',id); return { success: true };
    });
  }
  async sync(id: number, actor: number) {
    const provider = await this.provider(id,true); const adapter = this.adapters.get(provider.type);
    if (!adapter.syncSupported) throw new BadRequestException('Este adaptador no soporta sincronización');
    return this.engine.start(provider,actor,() => adapter.fetch(provider));
  }
  async upload(id: number, content: string, actor: number) {
    const parsed = parseM3u(content);
    return this.withProvider(id,async m => {
      const p = await m.findOneByOrFail(Provider,{ id }); if (p.type !== ProviderType.M3U_UPLOAD) throw new BadRequestException('Proveedor no es M3U_UPLOAD');
      await m.update(Provider,id,{ uploadEncrypted: this.secrets.encrypt(content,`upload:${id}`) });
      await this.audit.record(m,actor,'provider.update','provider',id); return { entries: parsed.channels.length,uploaded: true };
    });
  }
  async channels(id: number,q: PageQuery) {
    await this.provider(id); const [data,total] = await this.db.getRepository(ProviderChannel).findAndCount({ where: { providerId: id },order: { id: 'ASC' },skip: (q.page-1)*q.limit,take: q.limit });
    return { data,total,page: q.page,limit: q.limit };
  }
  async runs(q: SyncQuery, id?: number) {
    if (id) await this.provider(id);
    const [data,total] = await this.db.getRepository(ProviderSyncRun).findAndCount({ where: { ...(id || q.providerId ? { providerId: id ?? q.providerId } : {}),...(q.status ? { status: q.status } : {}) },order: { id: 'DESC' },skip: (q.page-1)*q.limit,take: q.limit });
    return { data,total,page: q.page,limit: q.limit };
  }
  async link(id: number, channelId: number, actor: number) {
    const source = await this.db.manager.findOneBy(ProviderChannel,{ id }); if (!source) throw new NotFoundException('Fuente no encontrada');
    return this.withProvider(source.providerId,async m => {
      const link = await m.findOneByOrFail(ProviderChannel,{ id });
      if (!await m.existsBy(Channel,{ id: channelId })) throw new NotFoundException('Canal no encontrado');
      const oldChannelId = link.channelId;
      await m.update(ProviderChannel,id,{ channelId }); await m.update(Stream,{ providerChannelId: id },{ channelId });
      await refreshCanonical(m,channelId); await refreshCanonical(m,oldChannelId);
      await this.audit.record(m,actor,'provider-channel.link','provider-channel',id,'','SUCCESS',{ oldChannelId,channelId });
      return m.findOneByOrFail(ProviderChannel,{ id });
    });
  }
  private async channelFields(m: EntityManager,dto: UpdateChannelDto) {
    if (dto.countryCode && !await m.existsBy(Country,{ code: dto.countryCode })) throw new BadRequestException('País no registrado');
    for (const id of dto.categoryIds ?? []) if (!await m.existsBy(Category,{ id })) throw new BadRequestException('Categoría no registrada');
    for (const key of ['logo','website'] as const) if (dto[key] !== undefined && !publicHttpUrl(dto[key])) throw new BadRequestException('URL pública inválida');
  }
  async createChannel(dto: ManualChannelDto, actor: number) {
    const p = await ensureReservedProvider(this.db,ProviderType.MANUAL);
    return this.withProvider(p.id,async m => {
      await this.channelFields(m,dto); const { categoryIds,...fields } = dto;
      const channel = await m.save(Channel,{ ...fields,externalId: randomUUID(),source: 'manual' });
      await m.save(ChannelPublication,{ channelId: channel.id,status: 'DRAFT' });
      await m.save(ProviderChannel,{ providerId: p.id,channelId: channel.id,externalId: channel.externalId,externalName: channel.name,externalLogo: channel.logo ?? null,metadata: {},isActive: channel.isActive,lastSeenAt: new Date() });
      for (const categoryId of categoryIds ?? []) await m.save(ChannelCategory,{ channelId: channel.id,categoryId,isCurrent: true });
      await this.audit.record(m,actor,'channel.create','channel',channel.id); return channel;
    });
  }
  async updateChannel(id: number,dto: UpdateChannelDto,actor: number) {
    return this.db.transaction(this.db.options.type === 'mariadb' ? 'READ COMMITTED' : 'SERIALIZABLE',async m => {
      const channel = await m.getRepository(Channel).findOne({ where: { id },...(this.db.options.type === 'mariadb' ? { lock: { mode: 'pessimistic_write' as const } } : {}) }); if (!channel) throw new NotFoundException('Canal no encontrado');
      await this.channelFields(m,dto); const { categoryIds,...fields } = dto;
      const updated = await m.save(Channel,{ ...channel,...fields,editorialOverrides: { ...channel.editorialOverrides,...dto } });
      if (categoryIds) { await m.update(ChannelCategory,{ channelId: id },{ isCurrent: false }); for (const categoryId of categoryIds) await m.save(ChannelCategory,{ channelId: id,categoryId,isCurrent: true }); }
      await this.audit.record(m,actor,'channel.update','channel',id); return updated;
    });
  }
  private streamUrl(value: string) {
    const safe = publicHttpUrl(value);
    if (!safe || [...new URL(safe).searchParams.keys()].some(k => /token|key|pass|secret|auth|user/i.test(k))) throw new BadRequestException('Stream debe ser público y sin credenciales sensibles');
    return safe;
  }
  async createStream(channelId: number,dto: ManualStreamDto,actor: number) {
    const p = await ensureReservedProvider(this.db,ProviderType.MANUAL); const url = this.streamUrl(dto.url);
    if (dto.referrer) this.streamUrl(dto.referrer);
    return this.withProvider(p.id,async m => {
      const channel = await m.findOneBy(Channel,{ id: channelId }); if (!channel) throw new NotFoundException('Canal no encontrado');
      let link = await m.findOneBy(ProviderChannel,{ providerId: p.id,channelId });
      if (!link) link = await m.save(ProviderChannel,{ providerId: p.id,channelId,externalId: `channel:${channelId}`,externalName: channel.name,externalLogo: null,metadata: {},isActive: true,lastSeenAt: new Date() });
      const identityKey = createHash('sha256').update(JSON.stringify([dto.feedId ?? null,url])).digest('hex');
      if (await m.existsBy(Stream,{ providerChannelId: link.id,identityKey })) throw new ConflictException('Stream ya registrado en fuente manual');
      const stream = await m.save(Stream,{ ...dto,url,identityKey,channelId,providerChannelId: link.id,feedId: dto.feedId ?? null,referrer: dto.referrer ?? null,userAgent: dto.userAgent ?? null,labels: dto.labels ?? [],
        format: dto.format ?? streamFormat(url),status: StreamStatus.UNKNOWN,isAvailable: !dto.isDisabled });
      await refreshCanonical(m,channelId);
      await this.audit.record(m,actor,'stream.create','stream',stream.id);
      const { identityKey: _key,...safe } = stream; void _key; return safe;
    });
  }
  async updateStream(id: number,dto: UpdateStreamDto,actor: number) {
    const current = await this.db.manager.findOneBy(Stream,{ id }); if (!current) throw new NotFoundException('Stream no encontrado');
    const link = current.providerChannelId ? await this.db.manager.findOneBy(ProviderChannel,{ id: current.providerChannelId }) : null;
    if (!link) throw new BadRequestException('Stream legacy sin procedencia; aplicar migración primero');
    return this.withProvider(link.providerId,async m => {
      const stream = await m.findOneByOrFail(Stream,{ id }); const p = await m.findOneByOrFail(Provider,{ id: link.providerId });
      if (p.type !== ProviderType.MANUAL && Object.keys(dto).some(k => !['priority','isPreferred','isDisabled'].includes(k))) throw new BadRequestException('Metadata importada solo se modifica en el proveedor');
      if (dto.referrer) this.streamUrl(dto.referrer);
      const url = dto.url ? this.streamUrl(dto.url) : stream.url;
      const identityKey = createHash('sha256').update(JSON.stringify([dto.feedId ?? stream.feedId,url])).digest('hex');
      if ((dto.url || dto.feedId !== undefined) && await m.getRepository(Stream).createQueryBuilder('s').where('s.providerChannelId = :source AND s.identityKey = :key AND s.id != :id',{ source: link.id,key: identityKey,id }).getExists()) throw new ConflictException('Stream duplicado');
      await m.update(Stream,id,{ ...dto,...(dto.url || dto.feedId !== undefined ? { url,identityKey } : {}),...(dto.isDisabled !== undefined ? { isAvailable: !dto.isDisabled && link.isActive && p.isActive } : {}) });
      await this.audit.record(m,actor,dto.isDisabled ? 'stream.disable' : 'stream.update','stream',id); return m.findOneByOrFail(Stream,{ id });
    });
  }
  private async withProvider<T>(id: number,work: (m: EntityManager) => Promise<T>): Promise<T> {
    await this.provider(id);
    if (ProviderSyncEngine.isActive(id)) throw new ConflictException('Sincronización activa; reintenta al terminar');
    const runner = this.db.createQueryRunner(); const lock = `hmo_iptv_provider_sync_${id}`; let locked = false;
    try {
      await runner.connect();
      if (this.db.options.type === 'mariadb') {
        const rows: { acquired: number }[] = await runner.query('SELECT GET_LOCK(?, 0) AS acquired',[lock]);
        if (Number(rows[0]?.acquired) !== 1) throw new ConflictException('Proveedor ocupado'); locked = true;
      }
      await runner.startTransaction(this.db.options.type === 'mariadb' ? 'READ COMMITTED' : undefined);
      try { const result = await work(runner.manager); await runner.commitTransaction(); return result; }
      catch (error) { await runner.rollbackTransaction(); throw error; }
    } finally { try { if (locked) await runner.query('SELECT RELEASE_LOCK(?)',[lock]); } finally { await runner.release(); } }
  }
}

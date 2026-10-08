import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { Provider, ProviderType } from '../database/entities';
import { IptvOrgClient } from './iptv-org/iptv-org.client';
import { NormalizedSnapshot } from './normalized-catalog';
import { normalizeSnapshot } from './iptv-org/normalizer';
import { CredentialsService } from './credentials.service';
import { fetchPlaylist, providerUrl } from './safe-http';
import { parseM3u } from './m3u';
export type Capability = 'CHANNELS' | 'STREAMS' | 'LOGOS' | 'CATEGORIES' | 'COUNTRIES' | 'EPG';
export interface ProviderAdapter {
  readonly types: ProviderType[];
  readonly capabilities: Capability[];
  readonly syncSupported: boolean;
  validate(config: Record<string,unknown>): void;
  fetch(provider: Provider): Promise<NormalizedSnapshot>;
  test(provider: Provider): Promise<void>;
}
class IptvOrgAdapter implements ProviderAdapter {
  readonly types = [ProviderType.IPTV_ORG];
  readonly capabilities: Capability[] = ['CHANNELS','STREAMS','LOGOS','CATEGORIES','COUNTRIES'];
  readonly syncSupported = true;
  constructor(private readonly client: IptvOrgClient) {}
  validate(config: Record<string,unknown>) { if (Object.keys(config).length) throw new BadRequestException('IPTV-org usa configuración oficial'); }
  async fetch() { return normalizeSnapshot(await this.client.fetchSnapshot()); }
  async test() { await this.client.testConnectivity(); }
}
class M3uAdapter implements ProviderAdapter {
  readonly types: ProviderType[];
  readonly capabilities: Capability[] = ['CHANNELS','STREAMS','LOGOS','CATEGORIES'];
  readonly syncSupported = true;
  constructor(private readonly uploaded: boolean, private readonly secrets: CredentialsService) { this.types = [uploaded ? ProviderType.M3U_UPLOAD : ProviderType.M3U_URL]; }
  validate(config: Record<string,unknown>) {
    if (Object.keys(config).some(k => !(!this.uploaded && k === 'url'))) throw new BadRequestException('Configuración M3U inválida; secretos van en credentials');
    if (!this.uploaded) providerUrl(config.url);
  }
  async fetch(provider: Provider) {
    this.validate(provider.config);
    if (this.uploaded) {
      if (!provider.uploadEncrypted) throw new BadRequestException('Primero carga una playlist');
      return parseM3u(this.secrets.decrypt(provider.uploadEncrypted,`upload:${provider.id}`));
    }
    const credentials = provider.credentialsEncrypted ? JSON.parse(this.secrets.decrypt(provider.credentialsEncrypted,`credentials:${provider.id}`)) as Record<string,string> : {};
    return parseM3u(await fetchPlaylist(String(provider.config.url),credentials.token));
  }
  async test(provider: Provider) { await this.fetch(provider); }
}
class ManualAdapter implements ProviderAdapter {
  readonly types = [ProviderType.MANUAL]; readonly capabilities: Capability[] = ['CHANNELS','STREAMS']; readonly syncSupported = false;
  validate(config: Record<string,unknown>) { if (Object.keys(config).length) throw new BadRequestException('MANUAL no acepta configuración externa'); }
  fetch(): Promise<NormalizedSnapshot> { return Promise.reject(new BadRequestException('MANUAL se administra sin sincronización')); }
  test(): Promise<void> { return Promise.resolve(); }
}
/** Explicitly unavailable until the authorized upstream contract is supplied and tested. */
class PendingApiAdapter implements ProviderAdapter {
  readonly types: ProviderType[]; readonly capabilities: Capability[] = []; readonly syncSupported = false;
  constructor(type: ProviderType) { this.types = [type]; }
  validate(config: Record<string,unknown>) {
    if (Object.keys(config).some(k => k !== 'baseUrl')) throw new BadRequestException('Solo baseUrl; credenciales separadas');
    providerUrl(config.baseUrl);
  }
  fetch(): Promise<NormalizedSnapshot> { return Promise.reject(new NotImplementedException('Adaptador pendiente de contrato autorizado y validación')); }
  test(): Promise<void> { return Promise.reject(new NotImplementedException('Conectividad no implementada para este adaptador')); }
}
@Injectable()
export class AdapterRegistry {
  private readonly adapters = new Map<ProviderType,ProviderAdapter>();
  constructor(client: IptvOrgClient, secrets: CredentialsService) {
    for (const adapter of [new IptvOrgAdapter(client),new M3uAdapter(false,secrets),new M3uAdapter(true,secrets),new ManualAdapter(),
      new PendingApiAdapter(ProviderType.XTREAM),new PendingApiAdapter(ProviderType.REST_API)]) {
      for (const type of adapter.types) this.adapters.set(type,adapter);
    }
  }
  get(type: ProviderType) { const adapter = this.adapters.get(type); if (!adapter) throw new BadRequestException('Tipo de proveedor inválido'); return adapter; }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Agent } from 'node:https';
import { lookup } from 'node:dns';
import { Environment } from '../../config/environment';
import { isPublicAddress } from '../../common/url-policy';
import { CatalogProvider, ProviderSnapshot } from '../provider';

@Injectable()
export class IptvOrgClient implements CatalogProvider {
  readonly source = 'iptv-org';
  private readonly logger = new Logger(IptvOrgClient.name);
  constructor(private readonly http: HttpService, private readonly config: ConfigService<Environment, true>) {}

  async fetchSnapshot(): Promise<ProviderSnapshot> {
    const names = ['channels','streams','logos','categories','countries','blocklist'] as const;
    const snapshot = {} as ProviderSnapshot;
    // Sequential downloads bound peak memory and simplify retry accounting.
    for (const name of names) snapshot[name] = await this.fetch(name);
    return snapshot;
  }

  async testConnectivity(): Promise<void> {
    if (!(await this.fetch('channels',{ retries: 0,timeout: 5000 })).length) throw new Error('Catálogo remoto vacío');
  }

  private async fetch(name: keyof ProviderSnapshot, limits?: { retries: number; timeout: number }): Promise<unknown[]> {
    const base = this.config.get('IPTV_ORG_API_URL', { infer: true }).replace(/\/$/, '');
    const agent = new Agent({
      lookup: (hostname, options, callback) => {
        if (hostname !== 'iptv-org.github.io') return callback(new Error('Host no autorizado'), '', 4);
        lookup(hostname, options, (error, address, family) => {
          if (error) return callback(error, address, family);
          const addresses = Array.isArray(address) ? address.map(item => item.address) : [address];
          if (!addresses.length || addresses.some(ip => !isPublicAddress(ip))) return callback(new Error('Dirección no pública'), '', 4);
          callback(null, address, family);
        });
      },
    });
    try {
      const retries = limits?.retries ?? this.config.getOrThrow<number>('IPTV_ORG_MAX_RETRIES');
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const response = await firstValueFrom(this.http.get<unknown>(`${base}/${name}.json`, {
            timeout: limits?.timeout ?? this.config.getOrThrow<number>('IPTV_ORG_REQUEST_TIMEOUT_MS'),
            httpsAgent: agent, maxRedirects: 0, proxy: false,
            maxContentLength: 64 * 1024 * 1024, responseType: 'json',
          }));
          if (!Array.isArray(response.data)) throw new Error('Respuesta no es un catálogo');
          return response.data as unknown[];
        } catch {
          // Do not print Axios errors: they include request headers and full URLs.
          this.logger.warn(`Descarga ${name}: intento ${attempt + 1} fallido`);
          if (attempt === retries) throw new Error(`No se pudo obtener ${name}; no se modificó el catálogo`);
          await new Promise(resolve => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4000)));
        }
      }
      throw new Error('Descarga incompleta');
    } finally { agent.destroy(); }
  }
}

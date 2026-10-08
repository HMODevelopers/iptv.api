import { BadRequestException } from '@nestjs/common';
import { Agent } from 'node:https';
import { lookup } from 'node:dns';
import axios from 'axios';
import { isPublicAddress, publicHttpUrl } from '../common/url-policy';
export const PLAYLIST_MAX_BYTES = 5 * 1024 * 1024;
export function providerUrl(value: unknown): string {
  const safe = publicHttpUrl(value);
  if (!safe) throw new BadRequestException('URL pública inválida');
  const url = new URL(safe);
  if (url.protocol !== 'https:' || url.hash || [...url.searchParams.keys()].some(k => /token|key|pass|secret|auth|user/i.test(k))) throw new BadRequestException('Se requiere HTTPS sin credenciales en URL');
  return safe;
}
export async function fetchPlaylist(url: string, token?: string): Promise<string> {
  const safe = providerUrl(url);
  const agent = new Agent({ lookup: (hostname,options,callback) => {
    lookup(hostname,options,(error,address,family) => {
      if (error) return callback(new Error('Resolución fallida'),'',4);
      const addresses = Array.isArray(address) ? address.map(a => a.address) : [address];
      if (!addresses.length || addresses.some(ip => !isPublicAddress(ip))) return callback(new Error('Dirección no pública'),'',4);
      callback(null,address,family);
    });
  } });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await axios.get<ArrayBuffer>(safe,{ httpsAgent: agent, proxy: false, maxRedirects: 0,
          timeout: 15000, maxContentLength: PLAYLIST_MAX_BYTES, maxBodyLength: PLAYLIST_MAX_BYTES,
          responseType: 'arraybuffer', headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return new TextDecoder('utf-8',{ fatal: true }).decode(result.data);
      } catch { if (attempt === 2) throw new BadRequestException('No se pudo obtener una playlist UTF-8 válida'); }
    }
    throw new BadRequestException('Descarga incompleta');
  } finally { agent.destroy(); }
}

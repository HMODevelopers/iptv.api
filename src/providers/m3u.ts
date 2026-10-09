import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { publicHttpUrl, streamFormat } from '../common/url-policy';
import { NormalizedSnapshot } from './normalized-catalog';
import { PLAYLIST_MAX_BYTES } from './safe-http';
export function parseM3u(input: string): NormalizedSnapshot {
  const invalid = () => new BadRequestException('Playlist M3U inválida o excede los límites');
  if (Buffer.byteLength(input) > PLAYLIST_MAX_BYTES || input.includes('\0') || input.includes('\ufffd')) throw invalid();
  const lines = input.replace(/^\uFEFF/,'').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines[0] !== '#EXTM3U8' && lines[0] !== '#EXTM3U' && !lines[0]?.startsWith('#EXTM3U ')) throw invalid();
  const result: NormalizedSnapshot = { channels: [],streams: new Map(),countries: [],categories: [],excludedIds: new Set(),discarded: 0 };
  const channels = new Map<string,NormalizedSnapshot['channels'][number]>();
  const categories = new Map<string,NormalizedSnapshot['categories'][number]>();
  const safeEntryUrl = (value: string) => {
    const url = publicHttpUrl(value);
    return url && ![...new URL(url).searchParams.keys()].some(k => /token|key|pass|secret|auth|user/i.test(k)) ? url : null;
  };
  let pending: { name: string; attrs: Record<string,string>; unsupported: boolean } | null = null; let entries = 0;
  for (const line of lines.slice(1)) {
    if (line.length > 16384) throw invalid();
    if (line.startsWith('#EXTINF:')) {
      if (pending) throw invalid();
      const match = /^#EXTINF:\s*-?\d+(?:\.\d+)?\s*((?:[^",]|"[^"]*")*),(.*)$/.exec(line);
      if (!match) throw invalid();
      const attrs: Record<string,string> = {};
      for (const a of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
      const name = (attrs['tvg-name'] || match[2]).trim();
      pending = { name,attrs,unsupported: false }; continue;
    }
    if (line.startsWith('#')) {
      // HLS manifests are globally invalid; playback directives make only their entry unsupported.
      if (/^#EXT-X-/i.test(line)) throw invalid();
      if (/^#EXTVLCOPT|^#KODIPROP/i.test(line)) {
        if (!pending) throw invalid();
        pending.unsupported = true;
      }
      continue;
    }
    if (!pending || ++entries > 10000) throw invalid();
    const { name,attrs,unsupported } = pending; pending = null;
    const url = safeEntryUrl(line);
    const logo = attrs['tvg-logo'] ? safeEntryUrl(attrs['tvg-logo']) : null;
    if (!url || unsupported || !name || name.length > 255 || (attrs['tvg-logo'] && !logo)) {
      result.discarded++; continue;
    }
    const externalId = attrs['tvg-id'] || createHash('sha256').update(url).digest('hex');
    if (externalId.length > 255) { result.discarded++; continue; }
    const group = attrs['group-title'];
    const slug = group ? `m3u-${createHash('sha256').update(group).digest('hex').slice(0,24)}` : null;
    if (group && group.length > 255) { result.discarded++; continue; }
    if (slug) categories.set(slug,{ slug,name: group,description: null });
    if (!channels.has(externalId)) channels.set(externalId,{ externalId,name,description: null,countryCode: null,website: null,
      logo,isActive: true,categorySlugs: slug ? [slug] : [] });
    const streams = result.streams.get(externalId) ?? [];
    const identityKey = createHash('sha256').update(JSON.stringify([null,url])).digest('hex');
    if (!streams.some(s => s.identityKey === identityKey)) streams.push({ identityKey,feedId: null,title: name,url,quality: null,
      format: streamFormat(url),referrer: null,userAgent: null,labels: [] });
    else result.discarded++;
    result.streams.set(externalId,streams);
  }
  if (pending || !channels.size) throw invalid();
  result.channels = [...channels.values()]; result.categories = [...categories.values()]; return result;
}

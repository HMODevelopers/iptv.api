import { createHash } from 'node:crypto';
import { ProviderSnapshot } from '../provider';
import { publicHttpUrl, streamFormat } from '../../common/url-policy';

import { NormalizedSnapshot } from '../normalized-catalog';
export * from '../normalized-catalog';
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // eslint-disable-next-line no-control-regex -- Reject control characters in upstream metadata.
  return trimmed && trimmed.length <= max && !/[\x00-\x1f\x7f]/.test(trimmed) ? trimmed : null;
}
function strings(value: unknown, max = 255): string[] {
  return Array.isArray(value) ? [...new Set(value.map(item => text(item, max)).filter((item): item is string => item !== null))] : [];
}

export function normalizeSnapshot(raw: ProviderSnapshot): NormalizedSnapshot {
  const result: NormalizedSnapshot = { channels: [], streams: new Map(), countries: [], categories: [], excludedIds: new Set(), discarded: 0 };
  // Fail closed: a malformed safety list cannot be treated as an empty list.
  for (const value of raw.blocklist) {
    const item = record(value); const id = text(item.channel);
    if (!id || !['dmca','nsfw'].includes(String(item.reason))) throw new Error('Blocklist inválida; sincronización cancelada');
    result.excludedIds.add(id);
  }
  const countryCodes = new Set<string>();
  for (const value of raw.countries) {
    const item = record(value); const code = text(item.code,2); const name = text(item.name);
    if (!code || !/^[A-Z]{2}$/.test(code) || !name || countryCodes.has(code)) { result.discarded++; continue; }
    countryCodes.add(code);
    result.countries.push({ code, name, languages: strings(item.languages,3), flag: text(item.flag,32) });
  }
  const categorySlugs = new Set<string>();
  for (const value of raw.categories) {
    const item = record(value); const slug = text(item.id,100); const name = text(item.name);
    if (!slug || !/^[a-z0-9_-]+$/.test(slug) || !name || categorySlugs.has(slug)) { result.discarded++; continue; }
    categorySlugs.add(slug); result.categories.push({ slug, name, description: text(item.description,10000) });
  }
  if (!result.countries.length || !result.categories.length || !raw.channels.length) throw new Error('Catálogo esencial vacío; sincronización cancelada');
  const logos = new Map<string,string>();
  for (const value of raw.logos) {
    const item = record(value); const id = text(item.channel); const url = publicHttpUrl(item.url);
    if (id && url && (!logos.has(id) || item.in_use === true)) logos.set(id,url);
  }
  // Reject unsafe duplicate IDs before considering any record with that ID.
  for (const value of raw.channels) {
    const item = record(value); const id = text(item.id);
    if (id && item.is_nsfw !== false) result.excludedIds.add(id);
  }
  const channelIds = new Set<string>();
  for (const value of raw.channels) {
    const item = record(value); const externalId = text(item.id); const name = text(item.name);
    if (externalId && (item.is_nsfw !== false || result.excludedIds.has(externalId))) {
      result.excludedIds.add(externalId); result.discarded++; continue;
    }
    if (!externalId || !name || channelIds.has(externalId)) { result.discarded++; continue; }
    channelIds.add(externalId);
    const country = text(item.country,2);
    result.channels.push({ externalId, name, description: null,
      countryCode: country && countryCodes.has(country) ? country : null,
      website: publicHttpUrl(item.website), logo: logos.get(externalId) ?? null,
      isActive: !item.closed && !item.replaced_by,
      categorySlugs: strings(item.categories,100).filter(slug => categorySlugs.has(slug)),
    });
  }
  if (!result.channels.length) throw new Error('No hay canales seguros; sincronización cancelada');
  const seenStreams = new Set<string>();
  for (const value of raw.streams) {
    const item = record(value); const id = text(item.channel); const url = publicHttpUrl(item.url);
    const title = text(item.title,512);
    if (!id || !channelIds.has(id) || !url || !title) { result.discarded++; continue; }
    const feedId = text(item.feed);
    const identityKey = createHash('sha256').update(JSON.stringify([feedId,url])).digest('hex');
    if (seenStreams.has(`${id}:${identityKey}`)) { result.discarded++; continue; }
    seenStreams.add(`${id}:${identityKey}`);
    const stream = { identityKey, feedId, title, url, quality: text(item.quality,32), format: streamFormat(url),
      referrer: publicHttpUrl(item.referrer), userAgent: text(item.user_agent,2048), labels: strings(item.labels) };
    const entries = result.streams.get(id) ?? []; entries.push(stream); result.streams.set(id,entries);
  }
  return result;
}

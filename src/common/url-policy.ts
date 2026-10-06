import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
/** Metadata URLs are never fetched by the API. Outbound requests use an additional DNS check. */
export function publicHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return null;
    if (ipaddr.isValid(host)) { if (!isPublicAddress(host)) return null; }
    else if (!host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}

export function streamFormat(url: string): string | null {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return 'HLS';
  if (path.endsWith('.mpd')) return 'DASH';
  if (path.endsWith('.mp4')) return 'MP4';
  if (path.endsWith('.ts')) return 'MPEG-TS';
  return null;
}

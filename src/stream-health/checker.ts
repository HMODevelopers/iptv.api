import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isPublicAddress, publicHttpUrl, streamFormat } from '../common/url-policy';
import { Stream, StreamStatus } from '../database/entities';
export type FailureReason = 'TIMEOUT' | 'DNS_FAILURE' | 'PRIVATE_ADDRESS' | 'HTTP_401' | 'HTTP_403' | 'HTTP_404' | 'HTTP_429' | 'HTTP_5XX' | 'INVALID_HLS' | 'INVALID_DASH' | 'INVALID_CONTENT' | 'UNSUPPORTED_FORMAT' | 'CONNECTION_ERROR' | 'TOO_LARGE' | 'REDIRECT_BLOCKED' | 'TLS_ERROR' | 'UNKNOWN';
export class ProbeError extends Error { constructor(readonly reason: FailureReason) { super(reason); } }
export interface ProbeResponse { status: number; contentType: string; body: Buffer; location?: string }
export interface CheckResult { status: StreamStatus; httpStatus: number | null; responseTimeMs: number; checkedAt: Date; failureReason: FailureReason | null }
export function validHls(text: string): boolean {
  const lines = text.trim().split(/\r?\n/);
  if (lines[0] !== '#EXTM3U' || /<\s*(html|!doctype)/i.test(text)) return false;
  return lines.some((line,i) => /^#EXT-X-STREAM-INF:/.test(line) && !!lines[i+1] && !lines[i+1].startsWith('#')) ||
    (lines.some(l => /^#EXT-X-TARGETDURATION:\d+$/.test(l)) && lines.some((l,i) => /^#EXTINF:[\d.]+,/.test(l) && !!lines[i+1] && !lines[i+1].startsWith('#')));
}
/** Restricted XML recognizer: no DTD/entities, balanced tags and quoted attributes. Never resolves resources. */
export function validDash(text: string): boolean {
  if (/<!|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i.test(text)) return false;
  const stack: string[] = []; const seen = new Set<string>(); let root = ''; let offset = 0;
  const tags = /<([^>]+)>/g;
  for (const match of text.matchAll(tags)) {
    const gap = text.slice(offset,match.index); if (gap.includes('<') || (!stack.length && gap.trim())) return false;
    offset = match.index! + match[0].length;
    const tag = match[1]; if (/^\?xml\s[^?]*\?$/.test(tag) && !root) continue;
    const close = /^\/([\w:.-]+)\s*$/.exec(tag);
    if (close) { if (stack.pop() !== close[1]) return false; continue; }
    const open = /^([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)$/.exec(tag);
    if (!open) return false;
    const name = open[1].split(':').pop()!;
    if (!stack.length) { if (root || name !== 'MPD') return false; root = name; }
    if (name === 'Period' && !stack.some(s => s.split(':').pop() === 'MPD')) return false;
    if (name === 'AdaptationSet' && !stack.some(s => s.split(':').pop() === 'Period')) return false;
    seen.add(name); if (!open[3]) stack.push(open[1]);
  }
  return !!root && !stack.length && !text.slice(offset).trim() && ['MPD','Period','AdaptationSet'].every(n => seen.has(n));
}
@Injectable()
export class StreamHealthChecker {
  constructor(private readonly config: ConfigService) {}
  async request(url: string, method: 'GET' | 'HEAD', headers: Record<string,string>, deadline: number, redirects = 0, sample = false): Promise<ProbeResponse> {
    const safe = publicHttpUrl(url); if (!safe) throw new ProbeError('PRIVATE_ADDRESS');
    const parsed = new URL(safe); const remaining = deadline - Date.now(); if (remaining <= 0) throw new ProbeError('TIMEOUT');
    const max = sample ? 1024 : this.config.get<number>('STREAM_HEALTH_MAX_RESPONSE_BYTES',1048576);
    const result = await new Promise<ProbeResponse>((resolve,reject) => {
      const req = (parsed.protocol === 'https:' ? httpsRequest : httpRequest)(parsed, {
        method, headers, agent: false,
        lookup: (hostname,options,callback) => lookup(hostname,options,(error,address,family) => {
          if (error) return callback(new ProbeError('DNS_FAILURE'),'',4);
          const ips = Array.isArray(address) ? address.map(a => a.address) : [address];
          if (!ips.length || ips.some(ip => !isPublicAddress(ip))) return callback(new ProbeError('PRIVATE_ADDRESS'),'',4);
          callback(null,address,family);
        }),
      },res => {
        const status = res.statusCode ?? 0; const contentType = String(res.headers['content-type'] ?? '');
        if (method === 'HEAD' || status >= 300) { res.destroy(); resolve({ status,contentType,body: Buffer.alloc(0),location: res.headers.location }); return; }
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.destroy(); reject(new ProbeError('INVALID_CONTENT')); return; }
        if (!sample && Number(res.headers['content-length']) > max) { res.destroy(); reject(new ProbeError('TOO_LARGE')); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        res.on('data',(chunk: Buffer) => {
          bytes += chunk.length;
          if (sample && bytes >= max) { chunks.push(chunk.subarray(0,max - (bytes-chunk.length))); resolve({ status,contentType,body: Buffer.concat(chunks) }); res.destroy(); }
          else if (bytes > max) { res.destroy(); reject(new ProbeError('TOO_LARGE')); }
          else chunks.push(chunk);
        });
        res.on('end',() => resolve({ status,contentType,body: Buffer.concat(chunks) }));
        res.on('error',reject); res.on('aborted',() => reject(new ProbeError('CONNECTION_ERROR')));
      });
      const timer = setTimeout(() => req.destroy(new ProbeError('TIMEOUT')),remaining);
      req.on('close',() => clearTimeout(timer)); req.on('error',reject); req.end();
    });
    if ([301,302,303,307,308].includes(result.status)) {
      if (!result.location || redirects >= this.config.get<number>('STREAM_HEALTH_MAX_REDIRECTS',2)) throw new ProbeError('REDIRECT_BLOCKED');
      let target: string; try { target = new URL(result.location,safe).href; } catch { throw new ProbeError('REDIRECT_BLOCKED'); }
      // Do not forward referrer/user agent to a new origin.
      return this.request(target,method,new URL(target).origin === parsed.origin ? headers : { 'Accept-Encoding': 'identity' },deadline,redirects+1,sample);
    }
    return result;
  }
  async check(stream: Pick<Stream,'url' | 'format' | 'referrer' | 'userAgent'>): Promise<CheckResult> {
    const start = Date.now(); let httpStatus: number | null = null;
    try {
      if (!publicHttpUrl(stream.url)) throw new ProbeError('PRIVATE_ADDRESS');
      const format = stream.format?.toUpperCase() === 'UNKNOWN' ? streamFormat(stream.url) : stream.format?.toUpperCase() ?? streamFormat(stream.url);
      if (format && !['HLS','DASH','MP4','MPEG-TS'].includes(format)) throw new ProbeError('UNSUPPORTED_FORMAT');
      const headers: Record<string,string> = { 'Accept-Encoding': 'identity' };
      if (stream.userAgent && stream.userAgent.length <= 512 && ![...stream.userAgent].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) headers['User-Agent'] = stream.userAgent;
      if (stream.referrer && publicHttpUrl(stream.referrer) && !new URL(stream.referrer).search) headers.Referer = stream.referrer;
      const deadline = start + this.config.get<number>('STREAM_HEALTH_TIMEOUT_MS',8000);
      let response = await this.request(stream.url,format === 'HLS' || format === 'DASH' ? 'GET' : 'HEAD',headers,deadline);
      if (!format && /mpegurl|dash\+xml/i.test(response.contentType)) {
        response = await this.request(stream.url,'GET',headers,deadline);
      } else if (format !== 'HLS' && format !== 'DASH' && [405,501].includes(response.status)) {
        response = await this.request(stream.url,'GET',{ ...headers,Range: 'bytes=0-1023' },deadline,0,true);
        if (!format && /mpegurl|dash\+xml/i.test(response.contentType)) response = await this.request(stream.url,'GET',headers,deadline);
      }
      httpStatus = response.status;
      if (httpStatus < 200 || httpStatus >= 300) throw new ProbeError(([401,403,404,429].includes(httpStatus) ? `HTTP_${httpStatus}` : httpStatus >= 500 ? 'HTTP_5XX' : 'INVALID_CONTENT') as FailureReason);
      if (/text\/html/i.test(response.contentType)) throw new ProbeError('INVALID_CONTENT');
      const inferred = format ?? (/mpegurl/i.test(response.contentType) ? 'HLS' : /dash\+xml/i.test(response.contentType) ? 'DASH' : null);
      if (inferred === 'HLS' || inferred === 'DASH') {
        let text: string; try { text = new TextDecoder('utf-8',{ fatal: true }).decode(response.body); } catch { throw new ProbeError('INVALID_CONTENT'); }
        if (!(inferred === 'HLS' ? validHls(text) : validDash(text))) throw new ProbeError(inferred === 'HLS' ? 'INVALID_HLS' : 'INVALID_DASH');
      } else if (/^\s*<(?:!doctype|html)/i.test(response.body.toString('utf8'))) throw new ProbeError('INVALID_CONTENT');
      return { status: StreamStatus.ONLINE,httpStatus,responseTimeMs: Date.now()-start,checkedAt: new Date(),failureReason: null };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      const failureReason = error instanceof ProbeError ? error.reason : /CERT|TLS|SSL/.test(code) ? 'TLS_ERROR' : 'CONNECTION_ERROR';
      return { status: StreamStatus.OFFLINE,httpStatus,responseTimeMs: Date.now()-start,checkedAt: new Date(),failureReason };
    }
  }
}

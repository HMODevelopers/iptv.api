import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Channel, Stream, StreamStatus } from '../database/entities';
import { ChannelAccessService } from '../channel-access/channel-access.service';
import { Principal } from '../security/policy';
import { publicHttpUrl } from '../common/url-policy';
export function reliability(s: Stream) { return s.consecutiveFailures < 3; }
export function exclusion(s: Stream, includeOffline = false): string | null {
  if (s.isDisabled) return 'DISABLED';
  if (!s.isAvailable) return 'UNAVAILABLE';
  if (!s.providerChannel?.isActive) return 'SOURCE_INACTIVE';
  if (!s.providerChannel.provider?.isActive) return 'PROVIDER_INACTIVE';
  if (s.status === StreamStatus.OFFLINE && !includeOffline) return 'OFFLINE';
  return null;
}
/** Lexicographic score, lower is better; priorities are not compressed into an opaque scalar. */
export function healthScore(s: Stream): number[] {
  return [s.status === StreamStatus.ONLINE ? 0 : s.status === StreamStatus.UNKNOWN ? 1 : 2,
    s.isPreferred ? 0 : 1,s.priority,s.providerChannel?.provider.priority ?? 0,
    reliability(s) ? 0 : 1,s.consecutiveFailures,s.responseTimeMs ?? Number.MAX_SAFE_INTEGER,s.id];
}
export function compareStreams(a: Stream,b: Stream) { const x = healthScore(a), y = healthScore(b); for (let i=0;i<x.length;i++) if (x[i] !== y[i]) return x[i]-y[i]; return 0; }
@Injectable()
export class StreamSelectionService {
  constructor(private readonly db: DataSource, private readonly access: ChannelAccessService) {}
  private async sources(id: number) {
    if (!await this.db.manager.existsBy(Channel,{ id })) throw new NotFoundException('Canal no encontrado');
    return this.db.getRepository(Stream).find({ where: { channelId: id },relations: { providerChannel: { provider: true } } });
  }
  async playback(id: number,actor: Principal) {
    await this.access.assert(actor,id);
    const best = (await this.sources(id)).filter(s => !exclusion(s)).sort(compareStreams)[0];
    if (!best) throw new NotFoundException('No hay fuentes elegibles');
    if (!publicHttpUrl(best.url) || [...new URL(best.url).searchParams.keys()].some(k => /token|key|pass|secret|auth|user/i.test(k))) throw new NotFoundException('Fuente no autorizada para reproducción pública');
    return { channelId: id,stream: { id: best.id,url: best.url,format: best.format,quality: best.quality,status: best.status,
      ...(best.referrer && publicHttpUrl(best.referrer) && !new URL(best.referrer).search ? { referrer: best.referrer } : {}),...(best.userAgent && best.userAgent.length <= 512 && ![...best.userAgent].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ? { userAgent: best.userAgent } : {}) } };
  }
  async candidates(id: number,includeOffline = false) {
    const sources = (await this.sources(id)).sort(compareStreams); let rank = 0;
    return sources.map(s => ({ streamId: s.id,provider: s.providerChannel ? { id: s.providerChannel.provider.id,name: s.providerChannel.provider.name,priority: s.providerChannel.provider.priority } : null,
      priority: s.priority,preferred: s.isPreferred,status: s.status,latency: s.responseTimeMs,failures: s.consecutiveFailures,lastCheckedAt: s.lastCheckedAt,
      failureReason: s.failureReason,exclusionReason: exclusion(s,includeOffline),ranking: exclusion(s,includeOffline) ? null : ++rank,score: healthScore(s) }));
  }
}

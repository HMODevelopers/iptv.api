import { ConfigService } from '@nestjs/config';
import { StreamHealthChecker, ProbeError, validDash, validHls } from '../src/stream-health/checker';
import { compareStreams, exclusion } from '../src/stream-health/selection';
import { Stream, StreamStatus } from '../src/database/entities';
const media = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts';
describe('Stream health manifests and bounded checker',() => {
  it.each([['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nvariant.m3u8',true],[media,true],['#EXTM3U',false],['<html>error</html>',false]])('HLS %s', (body,expected) => expect(validHls(body)).toBe(expected));
  it.each([['<MPD><Period><AdaptationSet/></Period></MPD>',true],['<MPD><Period><AdaptationSet></Period></MPD>',false],['<!DOCTYPE MPD><MPD/>',false],['<MPD><AdaptationSet/><Period/></MPD>',false]])('DASH %s',(body,expected) => expect(validDash(body)).toBe(expected));
  const stream = { url: 'https://cdn.public.tv/live.m3u8',format: 'HLS',referrer: null,userAgent: null };
  it.each([200,403,404,500])('HTTP %s',async status => {
    const checker = new StreamHealthChecker(new ConfigService()); jest.spyOn(checker,'request').mockResolvedValue({ status,contentType: 'application/vnd.apple.mpegurl',body: Buffer.from(media) });
    const result = await checker.check(stream); expect(result.status).toBe(status === 200 ? 'ONLINE' : 'OFFLINE'); expect(result.httpStatus).toBe(status);
    if (status !== 200) expect(result.failureReason).toBe(status === 500 ? 'HTTP_5XX' : `HTTP_${status}`);
  });
  it.each(['TIMEOUT','TOO_LARGE','DNS_FAILURE','PRIVATE_ADDRESS','TLS_ERROR'] as const)('sanitizes %s',async code => {
    const checker = new StreamHealthChecker(new ConfigService()); jest.spyOn(checker,'request').mockRejectedValue(new ProbeError(code)); expect((await checker.check(stream)).failureReason).toBe(code);
  });
  it('MP4 HEAD fallback uses only a limited Range request',async () => {
    const checker = new StreamHealthChecker(new ConfigService());
    const transport = jest.spyOn(checker,'request').mockResolvedValueOnce({ status: 405,contentType: '',body: Buffer.alloc(0) }).mockResolvedValueOnce({ status: 206,contentType: 'video/mp4',body: Buffer.from('sample') });
    expect((await checker.check({ ...stream,format: 'MP4' })).status).toBe('ONLINE');
    expect(transport.mock.calls[0][1]).toBe('HEAD'); expect(transport.mock.calls[1][1]).toBe('GET'); expect(transport.mock.calls[1][2].Range).toBe('bytes=0-1023'); expect(transport.mock.calls[1][5]).toBe(true);
  });
  it('UNKNOWN infers HLS from content type without changing stored format',async () => {
    const checker = new StreamHealthChecker(new ConfigService());
    const transport = jest.spyOn(checker,'request').mockResolvedValueOnce({ status: 200,contentType: 'application/vnd.apple.mpegurl',body: Buffer.alloc(0) }).mockResolvedValueOnce({ status: 200,contentType: 'application/vnd.apple.mpegurl',body: Buffer.from(media) });
    const source = { ...stream,url: 'https://public.tv/live',format: null }; expect((await checker.check(source)).status).toBe('ONLINE'); expect(source.format).toBeNull(); expect(transport.mock.calls[1][2].Range).toBeUndefined();
  });
  it('manifest GET rejection never falls back to partial manifest',async () => {
    const checker = new StreamHealthChecker(new ConfigService()); const transport = jest.spyOn(checker,'request').mockResolvedValue({ status: 405,contentType: '',body: Buffer.alloc(0) });
    expect((await checker.check(stream)).status).toBe('OFFLINE'); expect(transport).toHaveBeenCalledTimes(1);
  });
  it('invalid UTF8',async () => {
    const checker = new StreamHealthChecker(new ConfigService()); jest.spyOn(checker,'request').mockResolvedValue({ status: 200,contentType: 'application/vnd.apple.mpegurl',body: Buffer.from([0xff]) }); expect((await checker.check(stream)).failureReason).toBe('INVALID_CONTENT');
  });
  it.each(['http://localhost/a','http://127.0.0.1/a','http://10.0.0.1/a','http://192.168.1.1/a','http://[fc00::1]/a','http://[::1]/a','http://169.254.169.254/a','ftp://public.tv/a','http://user:pass@public.tv/a'])('blocks %s',async url => {
    const checker = new StreamHealthChecker(new ConfigService()); expect((await checker.check({ ...stream,url })).failureReason).toBe('PRIVATE_ADDRESS');
  });
});
describe('Deterministic selection',() => {
  const base = () => ({ id: 1,status: StreamStatus.ONLINE,priority: 0,isPreferred: false,isDisabled: false,isAvailable: true,consecutiveFailures: 0,responseTimeMs: 100,providerChannel: { isActive: true,provider: { isActive: true,priority: 0 } } } as Stream);
  it('ONLINE preferred, priority and latency',() => {
    const a = base(), b = { ...base(),id: 2,isPreferred: true,responseTimeMs: 500 }; expect(compareStreams(b,a)).toBeLessThan(0);
    expect(compareStreams({ ...a,priority: 1 },a)).toBeGreaterThan(0);
    expect(compareStreams({ ...a,responseTimeMs: 50 },a)).toBeLessThan(0);
    expect(compareStreams({ ...a,status: StreamStatus.UNKNOWN },a)).toBeGreaterThan(0);
  });
  it('excludes inactive and offline sources; admin opt-in',() => {
    const s = base(); expect(exclusion({ ...s,isDisabled: true })).toBe('DISABLED'); expect(exclusion({ ...s,isAvailable: false })).toBe('UNAVAILABLE');
    s.providerChannel!.isActive = false; expect(exclusion(s)).toBe('SOURCE_INACTIVE'); s.providerChannel!.isActive = true;
    s.providerChannel!.provider.isActive = false; expect(exclusion(s)).toBe('PROVIDER_INACTIVE'); s.providerChannel!.provider.isActive = true;
    s.status = StreamStatus.OFFLINE; expect(exclusion(s)).toBe('OFFLINE'); expect(exclusion(s,true)).toBeNull();
  });
});

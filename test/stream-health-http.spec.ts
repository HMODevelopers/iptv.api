import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { request } from 'node:http';
import { lookup } from 'node:dns';
import { StreamHealthChecker } from '../src/stream-health/checker';
jest.mock('node:http',() => ({ request: jest.fn() }));
jest.mock('node:dns',() => ({ lookup: jest.fn() }));
describe('Health transport: controlled DNS and responses; no Internet',() => {
  const requestMock = jest.mocked(request), dnsMock = jest.mocked(lookup);
  beforeEach(() => { requestMock.mockReset(); dnsMock.mockReset(); });
  function serve(status: number,body: Buffer,headers: Record<string,string> = {}) {
    requestMock.mockImplementationOnce(((_url: unknown,options: { lookup: (host: string,options: object,cb: (err: Error | null,address: string,family: number) => void) => void },callback: (res: EventEmitter & { statusCode: number; headers: Record<string,string>; destroy: () => void }) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
      req.destroy = error => { req.emit('error',error); req.emit('close'); };
      req.end = () => {
        options.lookup('public.tv',{},error => {
          if (error) { req.destroy(error); return; }
          const res = Object.assign(new EventEmitter(),{ statusCode: status,headers,destroy: () => { req.emit('close'); } });
          callback(res);
          queueMicrotask(() => { if (body.length) res.emit('data',body); res.emit('end'); req.emit('close'); });
        });
      };
      return req;
    }) as never);
  }
  function dns(ip: string) { dnsMock.mockImplementation(((_host: unknown,_options: unknown,cb: (error: Error | null,ip: string,family: number) => void) => cb(null,ip,4)) as never); }
  it('checks actual connection DNS and refuses private result',async () => {
    dns('10.0.0.1'); serve(200,Buffer.alloc(0));
    await expect(new StreamHealthChecker(new ConfigService()).request('http://public.tv/a','HEAD',{},Date.now()+1000)).rejects.toMatchObject({ reason: 'PRIVATE_ADDRESS' });
  });
  it('redirect to private is rejected before another connection',async () => {
    dns('8.8.8.8'); serve(302,Buffer.alloc(0),{ location: 'http://127.0.0.1/metadata' });
    await expect(new StreamHealthChecker(new ConfigService()).request('http://public.tv/a','GET',{},Date.now()+1000)).rejects.toMatchObject({ reason: 'PRIVATE_ADDRESS' }); expect(requestMock).toHaveBeenCalledTimes(1);
  });
  it('redirect re-resolves public destination and caps hop count',async () => {
    dns('8.8.8.8'); serve(302,Buffer.alloc(0),{ location: '/b' }); serve(302,Buffer.alloc(0),{ location: '/c' });
    await expect(new StreamHealthChecker(new ConfigService({ STREAM_HEALTH_MAX_REDIRECTS: 1 })).request('http://public.tv/a','GET',{},Date.now()+1000)).rejects.toMatchObject({ reason: 'REDIRECT_BLOCKED' }); expect(dnsMock).toHaveBeenCalledTimes(2);
  });
  it('enforces actual body size even without Content-Length',async () => {
    dns('8.8.8.8'); serve(200,Buffer.alloc(2048));
    await expect(new StreamHealthChecker(new ConfigService({ STREAM_HEALTH_MAX_RESPONSE_BYTES: 1024 })).request('http://public.tv/a','GET',{},Date.now()+1000)).rejects.toMatchObject({ reason: 'TOO_LARGE' });
  });
  it('minimal sample stops at 1024 bytes even if server ignores Range',async () => {
    dns('8.8.8.8'); serve(200,Buffer.alloc(2048));
    const response = await new StreamHealthChecker(new ConfigService()).request('http://public.tv/a','GET',{},Date.now()+1000,0,true); expect(response.body.length).toBe(1024);
  });
  it('timeout includes stalled DNS',async () => {
    dnsMock.mockImplementation((() => undefined) as never); serve(200,Buffer.alloc(0));
    await expect(new StreamHealthChecker(new ConfigService()).request('http://public.tv/a','GET',{},Date.now()+20)).rejects.toMatchObject({ reason: 'TIMEOUT' });
  });
});

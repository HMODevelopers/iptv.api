import axios from 'axios';
import { lookup } from 'node:dns';
import { fetchPlaylist, PLAYLIST_MAX_BYTES } from '../src/providers/safe-http';
jest.mock('axios');
jest.mock('node:dns',() => ({ lookup: jest.fn() }));
const get = jest.mocked(axios.get);
describe('Descarga M3U anti-SSRF sin red real', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('deshabilita redirects/proxies y verifica la misma resolución usada para conectar', async () => {
    get.mockImplementation(async (_url,config) => {
      expect(config).toMatchObject({ proxy: false,maxRedirects: 0,timeout: 15000,maxContentLength: PLAYLIST_MAX_BYTES,responseType: 'arraybuffer' });
      const agent = config!.httpsAgent as { options: { lookup: (host: string,options: object,callback: (error: Error | null,address: string,family: number) => void) => void } };
      jest.mocked(lookup).mockImplementation(((_host: string,_options: object,cb: (error: Error | null,address: string,family: number) => void) => cb(null,'127.0.0.1',4)) as typeof lookup);
      await new Promise<void>(resolve => agent.options.lookup('public.tv',{},error => { expect(error).toBeInstanceOf(Error); resolve(); }));
      jest.mocked(lookup).mockImplementation(((_host: string,_options: object,cb: (error: Error | null,address: string,family: number) => void) => cb(null,'8.8.8.8',4)) as typeof lookup);
      await new Promise<void>(resolve => agent.options.lookup('public.tv',{},(error,address) => { expect(error).toBeNull(); expect(address).toBe('8.8.8.8'); resolve(); }));
      return { data: Buffer.from('#EXTM3U') };
    });
    expect(await fetchPlaylist('https://public.tv/list.m3u')).toBe('#EXTM3U');
  });
  it('limita reintentos y sanitiza errores HTTP que contienen secretos', async () => {
    get.mockRejectedValue(new Error('Authorization: sensitive-token'));
    await expect(fetchPlaylist('https://public.tv/list.m3u','sensitive-token')).rejects.toThrow('No se pudo obtener');
    expect(get).toHaveBeenCalledTimes(3);
  });
  it('rechaza encoding inválido', async () => {
    get.mockResolvedValue({ data: Buffer.from([0xff]) }); await expect(fetchPlaylist('https://public.tv/list.m3u')).rejects.toThrow('UTF-8');
  });
});

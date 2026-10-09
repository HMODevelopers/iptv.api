import { m3uFixture } from './m3u-fixture';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CredentialsService, credentialsKey } from '../src/providers/credentials.service';
import { parseM3u } from '../src/providers/m3u';
import { providerUrl } from '../src/providers/safe-http';
import { isPublicAddress } from '../src/common/url-policy';
export const playlist = '#EXTM3U\n#EXTINF:-1 tvg-id="News.mx" tvg-name="Noticias" tvg-logo="https://images.public.tv/logo.png" group-title="News",News HD\nhttps://cdn.public.tv/live.m3u8\n';
describe('M3U y secretos', () => {
  it('normaliza atributos y streams sin imponer países/blocklist IPTV-org', () => {
    const snapshot = parseM3u(playlist);
    expect(snapshot.channels[0]).toMatchObject({ externalId: 'News.mx',name: 'Noticias',logo: 'https://images.public.tv/logo.png' });
    expect(snapshot.categories[0].name).toBe('News');
    expect(snapshot.streams.get('News.mx')![0].format).toBe('HLS'); expect(snapshot.countries).toEqual([]);
  });
  it('deduplica URLs dentro de una fuente pero no por nombres', () => {
    const s = parseM3u(playlist+'#EXTINF:-1 tvg-id="Other",Noticias\nhttps://cdn.public.tv/other.m3u8\n'+playlist.split('\n').slice(1).join('\n'));
    expect(s.channels).toHaveLength(2); expect(s.streams.get('News.mx')).toHaveLength(1); expect(s.discarded).toBe(1);
  });
  it.each(['bad','#EXTM3U','#EXTM3U\n#EXTINF:-1,Missing','#EXTM3U\nhttps://cdn.public.tv/live.m3u8',
    '#EXTM3U\n#EXT-X-TARGETDURATION:10\nsegment.ts',playlist.replace('https://cdn.public.tv/live.m3u8','http://127.0.0.1/a'),playlist.replace('live.m3u8','live.m3u8?token=secret'),playlist+'\0',playlist+'x'.repeat(5*1024*1024)])('rechaza playlists inválidas', content => {
    expect(() => parseM3u(content)).toThrow();
  });
  it('limita número de registros', () => { expect(() => parseM3u('#EXTM3U\n'+('#EXTINF:-1,A\nhttps://cdn.public.tv/a\n').repeat(10001))).toThrow(); });
  it.each(['standard','extended'])('acepta encabezado de fixture %s', name => {
    expect(parseM3u(m3uFixture(name)).channels).toHaveLength(1);
  });
  it('acepta atributos en el encabezado estándar', () => {
    expect(parseM3u(m3uFixture('standard').replace('#EXTM3U','#EXTM3U x-tvg-url="https://public.tv/epg.xml"')).channels).toHaveLength(1);
  });
  it('descarta entradas inseguras y conserva las válidas', () => {
    const snapshot = parseM3u(m3uFixture('mixed'));
    expect(snapshot.discarded).toBe(3);
    expect(snapshot.channels.map(c => c.externalId)).toEqual(['valid']);
    expect([...snapshot.streams.values()].flat().map(s => s.url)).toEqual(['https://cdn.public.tv/live.m3u8']);
  });
  it.each(['token','userinfo','private','all-invalid','hls-media'])('rechaza fixture sin catálogo válido %s', name => {
    expect(() => parseM3u(m3uFixture(name))).toThrow();
  });
  it.each([
    '#EXTINF:-1,Bad\nnot-a-url\n',
    '#EXTINF:-1,Bad\nrtsp://cdn.public.tv/live\n',
    '#EXTINF:-1,\nhttps://cdn.public.tv/live.m3u8\n',
    `#EXTINF:-1,${'x'.repeat(256)}\nhttps://cdn.public.tv/live.m3u8\n`,
    '#EXTINF:-1 tvg-logo="http://10.0.0.1/logo.png",Bad\nhttps://cdn.public.tv/live.m3u8\n',
    '#EXTINF:-1 tvg-logo="https://public.tv/logo.png?token=secret",Bad\nhttps://cdn.public.tv/live.m3u8\n',
    '#EXTINF:-1,Bad\n#EXTVLCOPT:http-referrer=https://public.tv/\nhttps://cdn.public.tv/live.m3u8\n',
    '#EXTINF:-1,Bad\nhttps://[::ffff:127.0.0.1]/live\n',
  ])('aísla validación de una entrada', entry => {
    const snapshot = parseM3u(m3uFixture('standard')+entry);
    expect(snapshot.discarded).toBe(1); expect(snapshot.channels).toHaveLength(1);
  });
  it('rechaza corrupción global incluso después de entradas válidas', () => {
    for (const suffix of ['#EXT-X-ENDLIST','\ufffd','#EXTINF:broken','https://cdn.public.tv/orphan']) {
      expect(() => parseM3u(m3uFixture('standard')+suffix)).toThrow();
    }
  });
  it('cifra autenticadamente, separa contexto y detecta modificaciones', () => {
    const service = new CredentialsService(new ConfigService({ PROVIDER_CREDENTIALS_KEY: randomBytes(32).toString('base64') }));
    const encrypted = service.encrypt('sensitive-value','credentials:1');
    expect(encrypted).not.toContain('sensitive-value'); expect(service.decrypt(encrypted,'credentials:1')).toBe('sensitive-value');
    expect(() => service.decrypt(encrypted,'credentials:2')).toThrow();
    expect(() => service.decrypt(encrypted.slice(0,-3)+'xxx','credentials:1')).toThrow();
    expect(service.encrypt('sensitive-value','credentials:1')).not.toBe(encrypted);
  });
  it.each([undefined,'COLOCAR_CLAVE_BASE64_DE_32_BYTES','bad',randomBytes(16).toString('base64')])('rechaza claves inválidas al iniciar', value => { expect(() => credentialsKey(value)).toThrow(); });
  it.each(['http://public.tv/a','https://127.0.0.1/a','https://[::1]/a','https://169.254.169.254/a','https://10.1.2.3/a','https://user:pass@public.tv/a','https://public.tv/a?apiKey=value','file:///etc/passwd'])('rechaza URL saliente insegura %s', url => { expect(() => providerUrl(url)).toThrow(); });
  it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1','0.0.0.0','224.0.0.1'])('DNS privado/reservado %s', ip => { expect(isPublicAddress(ip)).toBe(false); });
});

import { normalizeSnapshot } from '../src/providers/iptv-org/normalizer';
import { publicHttpUrl, isPublicAddress } from '../src/common/url-policy';
import { fixture } from './fixtures';
describe('Normalización y seguridad', () => {
  it('relaciona logos, países y categorías y mantiene los valores nulos', () => {
    const normalized = normalizeSnapshot(fixture());
    expect(normalized.channels).toHaveLength(2);
    expect(normalized.channels[0]).toMatchObject({ countryCode: 'MX', website: null, logo: 'https://images.public.tv/news.svg', categorySlugs: ['news','sports'] });
    expect(normalized.channels[1].countryCode).toBe('US');
    expect(normalized.streams.get('News.mx')?.[0]).toMatchObject({ feedId: null, quality: null, format: 'HLS', userAgent: null });
  });
  it('excluye NSFW, DMCA, canales sin clasificación segura y streams no relacionados', () => {
    const raw = fixture(); raw.channels.push({ id: 'Unknown.mx', name: 'Unknown' });
    const result = normalizeSnapshot(raw);
    expect([...result.excludedIds]).toEqual(expect.arrayContaining(['Blocked.mx','Adult.us','Unknown.mx']));
    expect(result.streams.has('Blocked.mx')).toBe(false);
  });
  it('rechaza una blocklist inválida y catálogos esenciales vacíos', () => {
    const raw = fixture(); raw.blocklist = [{ channel: null }];
    expect(() => normalizeSnapshot(raw)).toThrow('Blocklist inválida');
    expect(() => normalizeSnapshot({ ...fixture(), countries: [] })).toThrow('Catálogo esencial vacío');
  });
  it('deduplica streams y tolera metadatos inválidos sin persistirlos', () => {
    const raw = fixture(); raw.streams.push(raw.streams[0]);
    raw.streams.push({ channel: 'News.mx', title: 'Unsafe', url: 'http://127.0.0.1/video' });
    const result = normalizeSnapshot(raw);
    expect(result.streams.get('News.mx')).toHaveLength(1);
    expect(result.discarded).toBeGreaterThan(2);
  });
  it.each(['http://127.0.0.1/a','http://10.0.0.1/a','http://192.168.1.12/a','http://169.254.169.254/a','http://[::1]/a','http://[::ffff:127.0.0.1]/a','file:///etc/passwd','https://user:password@public.tv/a','http://service.internal/a','javascript:alert(1)'])('rechaza URL %s', url => {
    expect(publicHttpUrl(url)).toBeNull();
  });
  it('clasifica direcciones públicas y no públicas', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('fc00::1')).toBe(false);
    expect(isPublicAddress('224.0.0.1')).toBe(false);
  });
});

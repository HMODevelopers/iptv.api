import { ProviderType } from '../entities';

/** Version of the shipped definitions, never a reason to overwrite existing rows. */
export const PROVIDER_CATALOG_VERSION = 1;
export const DEFAULT_PROVIDERS = [
  { slug: 'iptv-org', name: 'IPTV-org', type: ProviderType.IPTV_ORG,
    description: 'Catálogo público de IPTV-org utilizado como fuente estructurada de canales, streams, países, categorías, logos y blocklist. https://iptv-org.github.io/api',
    isActive: true, syncEnabled: true, priority: 0, config: {} },
  { slug: 'manual', name: 'Manual', type: ProviderType.MANUAL,
    description: 'Contenido administrado directamente por SUPER_ADMIN sin sincronización externa.',
    isActive: true, syncEnabled: false, priority: 0, config: {} },
  { slug: 'free-tv', name: 'Free-TV', type: ProviderType.M3U_URL,
    description: 'Playlist curada de canales gratuitos disponibles públicamente. Requiere revisión administrativa. Fuente: https://github.com/Free-TV/IPTV',
    isActive: false, syncEnabled: false, priority: 100,
    config: { url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8' } },
  { slug: 'freecasthub-public-iptv', name: 'FreeCastHub Public IPTV', type: ProviderType.M3U_URL,
    description: 'Colección pública curada de streams gratuitos provenientes de broadcasters públicos/oficiales según la descripción del proyecto. Requiere revisión administrativa. Fuente: https://github.com/freecasthub/public-iptv',
    isActive: false, syncEnabled: false, priority: 110,
    config: { url: 'https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u' } },
  { slug: 'rw1986-iptv', name: 'RW1986 IPTV', type: ProviderType.M3U_URL,
    description: 'Fuente candidata: playlist curada de canales FAST/gratuitos provenientes de distintas plataformas. Requiere revisión administrativa antes de habilitarse. Fuente: https://github.com/RW1986/IPTV',
    isActive: false, syncEnabled: false, priority: 200,
    config: { url: 'https://raw.githubusercontent.com/RW1986/IPTV/main/lineup.m3u8' } },
];

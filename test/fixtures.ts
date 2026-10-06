import { ProviderSnapshot } from '../src/providers/provider';
export function fixture(): ProviderSnapshot {
  return {
    countries: [{ code: 'MX', name: 'Mexico', languages: ['spa'], flag: '🇲🇽' }, { code: 'US', name: 'United States', languages: ['eng'], flag: '🇺🇸' }],
    categories: [{ id: 'news', name: 'News', description: null }, { id: 'sports', name: 'Sports', description: 'Sports' }],
    channels: [
      { id: 'News.mx', name: 'Noticias', country: 'MX', categories: ['news','sports'], is_nsfw: false, website: null, closed: null },
      { id: 'Sports.us', name: 'Sports', country: 'US', categories: ['sports'], is_nsfw: false },
      { id: 'Blocked.mx', name: 'Blocked', country: 'MX', categories: [], is_nsfw: false },
      { id: 'Adult.us', name: 'Adult', country: 'US', categories: [], is_nsfw: true },
    ],
    streams: [
      { channel: 'News.mx', feed: null, title: 'Noticias HD', url: 'https://cdn.public.tv/live.m3u8', quality: null, referrer: null, user_agent: null, labels: [] },
      { channel: 'Sports.us', feed: 'HD', title: 'Sports HD', url: 'https://cdn.public.tv/sports.mpd', quality: '1080p', labels: ['Geo-blocked'] },
      { channel: 'Blocked.mx', title: 'Blocked', url: 'https://cdn.public.tv/blocked.m3u8' },
      { channel: null, title: 'Unmatched', url: 'https://cdn.public.tv/unmatched.m3u8' },
    ],
    logos: [{ channel: 'News.mx', feed: null, in_use: true, url: 'https://images.public.tv/news.svg' }],
    blocklist: [{ channel: 'Blocked.mx', reason: 'dmca' }],
  };
}

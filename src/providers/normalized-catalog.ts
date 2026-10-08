export interface NormalizedChannel {
  externalId: string; name: string; description: string | null; countryCode: string | null;
  website: string | null; logo: string | null; isActive: boolean; categorySlugs: string[];
}
export interface NormalizedStream {
  identityKey: string; feedId: string | null; title: string; url: string;
  quality: string | null; format: string | null; referrer: string | null;
  userAgent: string | null; labels: string[];
}
export interface NormalizedSnapshot {
  channels: NormalizedChannel[];
  streams: Map<string, NormalizedStream[]>;
  countries: { code: string; name: string; languages: string[]; flag: string | null }[];
  categories: { slug: string; name: string; description: string | null }[];
  excludedIds: Set<string>; discarded: number;
}

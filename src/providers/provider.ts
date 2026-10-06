export interface ProviderSnapshot {
  channels: unknown[]; streams: unknown[]; logos: unknown[];
  categories: unknown[]; countries: unknown[]; blocklist: unknown[];
}
export interface CatalogProvider {
  readonly source: string;
  fetchSnapshot(): Promise<ProviderSnapshot>;
}

export interface IptvOrgSnapshot {
  channels: unknown[]; streams: unknown[]; logos: unknown[];
  categories: unknown[]; countries: unknown[]; blocklist: unknown[];
}
export interface CatalogProvider {
  readonly source: string;
  fetchSnapshot(): Promise<IptvOrgSnapshot>;
}

/** Legacy compatibility aliases; new adapters return NormalizedSnapshot. */
export type ProviderSnapshot = IptvOrgSnapshot;
export { ProviderAdapter, Capability } from './adapters';
export * from './normalized-catalog';

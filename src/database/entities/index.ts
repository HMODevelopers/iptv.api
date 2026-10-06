import * as security from './security.entity';
export * from './security.entity';
import { Category, Channel, ChannelCategory, Country, Stream } from './catalog.entity';
export * from './catalog.entity';
export const ENTITIES = [Channel, Stream, Category, Country, ChannelCategory, ...Object.values(security)];

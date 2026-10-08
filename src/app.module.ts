import { ProvidersModule } from './providers/providers.module';
import { SecurityModule } from './security/security.module';
import { ChannelAccessModule } from './channel-access/channel-access.module';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './config/core.module';
import { ChannelsModule } from './channels/channels.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { HealthModule } from './health/health.module';
import { ConfigurableThrottlerGuard } from './common/configurable-throttler.guard';
@Module({ imports: [CoreModule,ProvidersModule,SecurityModule,ChannelAccessModule,ChannelsModule,CatalogsModule,HealthModule,
  ThrottlerModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => [{ ttl: config.get<number>('RATE_LIMIT_TTL_MS')!, limit: config.get<number>('RATE_LIMIT_MAX')! }] }),
], providers: [{ provide: APP_GUARD, useClass: ConfigurableThrottlerGuard }] })
export class AppModule {}

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IptvOrgClient } from './iptv-org/iptv-org.client';
import { CredentialsService } from './credentials.service';
import { AdapterRegistry } from './adapters';
import { ProvidersService } from './providers.service';
import { ProviderSyncEngine } from './sync-engine';
import { CatalogEditingController, ProviderChannelsController, ProvidersController, SyncRunsController } from './providers.controller';
@Module({ imports: [HttpModule],controllers: [ProvidersController,SyncRunsController,ProviderChannelsController,CatalogEditingController],
  providers: [IptvOrgClient,CredentialsService,AdapterRegistry,ProvidersService,ProviderSyncEngine],exports: [ProviderSyncEngine] })
export class ProvidersModule {}

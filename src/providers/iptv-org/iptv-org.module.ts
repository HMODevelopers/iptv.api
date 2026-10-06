import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { IptvOrgClient } from './iptv-org.client';
import { IptvOrgSyncService } from './sync.service';
@Module({ imports: [HttpModule], providers: [IptvOrgClient,IptvOrgSyncService], exports: [IptvOrgSyncService] })
export class IptvOrgModule {}

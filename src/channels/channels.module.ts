import { ChannelAccessModule } from '../channel-access/channel-access.module';
import { AdminChannelsController, MeController } from './content.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, Stream } from '../database/entities';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
@Module({ imports: [ChannelAccessModule,TypeOrmModule.forFeature([Channel,Stream])], controllers: [ChannelsController,AdminChannelsController,MeController], providers: [ChannelsService] })
export class ChannelsModule {}

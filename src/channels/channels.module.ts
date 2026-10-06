import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, Stream } from '../database/entities';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
@Module({ imports: [TypeOrmModule.forFeature([Channel,Stream])], controllers: [ChannelsController], providers: [ChannelsService] })
export class ChannelsModule {}

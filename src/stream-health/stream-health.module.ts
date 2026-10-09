import { Module } from '@nestjs/common';
import { ChannelAccessModule } from '../channel-access/channel-access.module';
import { StreamHealthChecker } from './checker';
import { StreamHealthService } from './service';
import { StreamSelectionService } from './selection';
import { PlaybackController, StreamHealthController } from './controller';
@Module({ imports: [ChannelAccessModule],controllers: [StreamHealthController,PlaybackController],providers: [StreamHealthChecker,StreamHealthService,StreamSelectionService],exports: [StreamHealthService,StreamSelectionService] })
export class StreamHealthModule {}

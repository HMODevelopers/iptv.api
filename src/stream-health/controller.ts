import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions, Roles } from '../security/guards';
import { Principal } from '../security/policy';
import { HealthTrigger } from '../database/entities';
import { CandidatesQuery, HealthQuery, HealthRunsQuery } from './dto';
import { StreamHealthService } from './service';
import { StreamSelectionService } from './selection';
@ApiTags('Stream health') @ApiBearerAuth() @Roles('ADMIN','SUPER_ADMIN') @Controller('admin')
export class StreamHealthController {
  constructor(private readonly health: StreamHealthService,private readonly selection: StreamSelectionService) {}
  @Post('stream-health/run') @HttpCode(202) @Permissions('streams.manage') run(@Query() q: HealthQuery,@CurrentUser() a: Principal) { return this.health.start(q,a.id); }
  @Post('providers/:id/stream-health') @HttpCode(202) @Permissions('streams.manage') provider(@Param('id',ParseIntPipe) id: number,@Query() q: HealthQuery,@CurrentUser() a: Principal) { return this.health.start({ ...q,providerId: id,channelId: undefined,streamId: undefined },a.id); }
  @Post('channels/:id/check-streams') @HttpCode(202) @Permissions('streams.manage') channel(@Param('id',ParseIntPipe) id: number,@Query() q: HealthQuery,@CurrentUser() a: Principal) { return this.health.start({ ...q,channelId: id,providerId: undefined,streamId: undefined },a.id); }
  @Post('streams/:id/check') @HttpCode(200) @Permissions('streams.manage') stream(@Param('id',ParseIntPipe) id: number,@Query() q: HealthQuery,@CurrentUser() a: Principal) { return this.health.run({ ...q,streamId: id,channelId: undefined,providerId: undefined },a.id,HealthTrigger.HTTP); }
  @Get('stream-health/runs') @Permissions('streams.read') runs(@Query() q: HealthRunsQuery) { return this.health.runs(q); }
  @Get('stream-health/stats') @Permissions('streams.read') stats() { return this.health.stats(); }
  @Get('channels/:id/playback-candidates') @Permissions('streams.read') candidates(@Param('id',ParseIntPipe) id: number,@Query() q: CandidatesQuery) { return this.selection.candidates(id,q.includeOffline); }
  @Get('dashboard') @Permissions('streams.read','channels.read','providers.read','users.read') dashboard() { return this.health.dashboard(); }
}
@ApiTags('Playback') @ApiBearerAuth() @Controller('me/channels')
export class PlaybackController {
  constructor(private readonly selection: StreamSelectionService) {}
  @Get(':id/playback') playback(@Param('id',ParseIntPipe) id: number,@CurrentUser() a: Principal) { return this.selection.playback(id,a); }
}

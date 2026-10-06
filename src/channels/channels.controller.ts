import { CurrentUser } from '../security/guards';
import { Principal } from '../security/policy';
import { Controller, Get, Param, ParseIntPipe, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Channel, Stream } from '../database/entities';
import { ChannelPage, ChannelQuery, PageQuery } from './dto/query.dto';
import { ChannelsService } from './channels.service';
export class StreamsPage {
  @ApiProperty({ type: Channel }) channel!: Channel;
  @ApiProperty({ type: [Stream] }) data!: Stream[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}
function validId(id: number): number {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new BadRequestException('ID inválido');
  return id;
}
@ApiBearerAuth() @ApiTags('Canales') @ApiBadRequestResponse({ description: 'Parámetros inválidos' })
@Controller('channels')
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}
  @Get() @ApiOkResponse({ type: ChannelPage })
  list(@Query() query: ChannelQuery, @CurrentUser() actor: Principal) { return this.service.list(query,actor); }
  @Get(':id') @ApiOkResponse({ type: Channel }) @ApiNotFoundResponse({ description: 'Canal no encontrado' })
  find(@Param('id',ParseIntPipe) id: number, @CurrentUser() actor: Principal) { return this.service.find(validId(id),actor); }
  @Get(':id/streams') @ApiOkResponse({ type: StreamsPage }) @ApiNotFoundResponse({ description: 'Canal no encontrado' })
  streams(@Param('id',ParseIntPipe) id: number, @Query() query: PageQuery, @CurrentUser() actor: Principal) { return this.service.findStreams(validId(id),query,actor); }
}

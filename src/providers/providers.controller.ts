import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions, Roles } from '../security/guards';
import { Principal } from '../security/policy';
import { PageQuery } from '../channels/dto/query.dto';
import { ProvidersService } from './providers.service';
import { CreateProviderDto, LinkChannelDto, ManualChannelDto, ManualStreamDto, SyncQuery, UpdateChannelDto, UpdateProviderDto, UpdateStreamDto, UploadPlaylistDto } from './dto';
@Roles('SUPER_ADMIN','ADMIN') @ApiBearerAuth() @ApiTags('Proveedores administrativos') @Controller('admin/providers')
export class ProvidersController {
  constructor(private readonly service: ProvidersService) {}
  @Get() @ApiOperation({ summary: 'Listar proveedores sin secretos' }) @Permissions('providers.read') list(@Query() q: PageQuery) { return this.service.list(q); }
  @Post() @ApiOperation({ summary: 'Registrar una fuente autorizada' }) @Permissions('providers.manage') create(@Body() dto: CreateProviderDto,@CurrentUser() a: Principal) { return this.service.create(dto,a.id); }
  @Get(':id') @Permissions('providers.read') async find(@Param('id',ParseIntPipe) id: number) { return this.service.response(await this.service.provider(id)); }
  @Patch(':id') @Permissions('providers.manage') update(@Param('id',ParseIntPipe) id: number,@Body() dto: UpdateProviderDto,@CurrentUser() a: Principal) { return this.service.update(id,dto,a.id); }
  @Post(':id/test') @HttpCode(200) @Permissions('providers.manage') test(@Param('id',ParseIntPipe) id: number,@CurrentUser() a: Principal) { return this.service.test(id,a.id); }
  @Post(':id/sync') @HttpCode(202) @ApiOperation({ summary: 'Reserva una ejecución en proceso; consultar sync-runs por ID. No publica contenido.' }) @Permissions('sync.execute') sync(@Param('id',ParseIntPipe) id: number,@CurrentUser() a: Principal) { return this.service.sync(id,a.id); }
  @ApiOperation({ summary: 'Validar y guardar cifrado el texto UTF-8 de un archivo M3U' }) @Post(':id/upload') @HttpCode(200) @Permissions('providers.manage') upload(@Param('id',ParseIntPipe) id: number,@Body() dto: UploadPlaylistDto,@CurrentUser() a: Principal) { return this.service.upload(id,dto.content,a.id); }
  @Get(':id/channels') @Permissions('providers.read') channels(@Param('id',ParseIntPipe) id: number,@Query() q: PageQuery) { return this.service.channels(id,q); }
  @Get(':id/sync-runs') @Permissions('sync.history') runs(@Param('id',ParseIntPipe) id: number,@Query() q: SyncQuery) { return this.service.runs(q,id); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiBearerAuth() @ApiTags('Sincronizaciones') @Controller('admin/sync-runs')
export class SyncRunsController {
  constructor(private readonly service: ProvidersService) {}
  @Get() @Permissions('sync.history') list(@Query() q: SyncQuery) { return this.service.runs(q); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiBearerAuth() @ApiTags('Fuentes de canales') @Controller('admin/provider-channels')
export class ProviderChannelsController {
  constructor(private readonly service: ProvidersService) {}
  @ApiOperation({ summary: 'Reasignar una fuente y sus streams sin trasladar decisiones editoriales' }) @Patch(':id/channel') @Permissions('providers.manage','channels.manage','streams.manage') link(@Param('id',ParseIntPipe) id: number,@Body() dto: LinkChannelDto,@CurrentUser() a: Principal) { return this.service.link(id,dto.channelId,a.id); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiBearerAuth() @ApiTags('Edición del catálogo') @Controller('admin')
export class CatalogEditingController {
  constructor(private readonly service: ProvidersService) {}
  @Post('channels') @Permissions('channels.manage') create(@Body() dto: ManualChannelDto,@CurrentUser() a: Principal) { return this.service.createChannel(dto,a.id); }
  @Patch('channels/:id') @Permissions('channels.manage') update(@Param('id',ParseIntPipe) id: number,@Body() dto: UpdateChannelDto,@CurrentUser() a: Principal) { return this.service.updateChannel(id,dto,a.id); }
  @Delete('channels/:id') @Permissions('channels.manage') disable(@Param('id',ParseIntPipe) id: number,@CurrentUser() a: Principal) { return this.service.updateChannel(id,{ isActive: false },a.id); }
  @Post('channels/:id/streams') @Permissions('streams.manage') createStream(@Param('id',ParseIntPipe) id: number,@Body() dto: ManualStreamDto,@CurrentUser() a: Principal) { return this.service.createStream(id,dto,a.id); }
  @Patch('streams/:id') @Permissions('streams.manage') updateStream(@Param('id',ParseIntPipe) id: number,@Body() dto: UpdateStreamDto,@CurrentUser() a: Principal) { return this.service.updateStream(id,dto,a.id); }
  @Delete('streams/:id') @Permissions('streams.manage') disableStream(@Param('id',ParseIntPipe) id: number,@CurrentUser() a: Principal) { return this.service.updateStream(id,{ isDisabled: true },a.id); }
}

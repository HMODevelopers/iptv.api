import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChannelAccessGuard } from '../channel-access/channel-access.module';
import { ChannelAccessService } from '../channel-access/channel-access.service';
import { AdminService } from '../security/admin.service';
import { AuthService } from '../security/auth.service';
import { PublicationDto } from '../security/dto';
import { AuthRequest, CurrentUser, Permissions, Roles } from '../security/guards';
import { Principal, requirePermission } from '../security/policy';
import { ChannelsService } from './channels.service';
import { ChannelQuery, PageQuery } from './dto/query.dto';
@ApiTags('Mi contenido') @ApiBearerAuth() @Controller('me')
export class MeController {
  constructor(private readonly channels: ChannelsService, private readonly access: ChannelAccessService, private readonly auth: AuthService) {}
  @Get('channels') list(@CurrentUser() a: Principal, @Query() q: ChannelQuery) { return this.channels.list(q,a); }
  @Get('channels/:id') @UseGuards(ChannelAccessGuard) find(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number) { return this.channels.find(id,a); }
  @Get('channels/:id/streams') @UseGuards(ChannelAccessGuard) streams(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Query() q: PageQuery) { return this.channels.findStreams(id,q,a); }
  @Get('collections') collections(@CurrentUser() a: Principal) { return this.access.collections(a.id); }
  @Get('profile') profile(@CurrentUser() a: Principal) { return this.auth.profile(a); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Catálogo administrativo') @ApiBearerAuth() @Controller('admin/channels')
export class AdminChannelsController {
  constructor(private readonly channels: ChannelsService, private readonly admin: AdminService) {}
  @Get() @Permissions('channels.read') list(@CurrentUser() a: Principal, @Query() q: ChannelQuery) { return this.channels.list(q,a,'administrative'); }
  @Get(':id') @Permissions('channels.read') find(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number) { return this.channels.find(id,a,'administrative'); }
  @Get(':id/streams') @Permissions('streams.read') streams(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Query() q: PageQuery) { return this.channels.findStreams(id,q,a,'administrative'); }
  @Get(':id/publication') @Permissions('channels.read') getPublication(@Param('id',ParseIntPipe) id: number) { return this.admin.getPublication(id); }
  @Patch(':id/publication') @Permissions('channels.manage') publication(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: PublicationDto, @Req() req: AuthRequest) {
    requirePermission(a,dto.status === 'PUBLISHED' ? 'channels.publish' : 'channels.hide');
    return this.admin.publication(a,id,dto,req.ip);
  }
}

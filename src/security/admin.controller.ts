import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQuery } from '../channels/dto/query.dto';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { AuthRequest, CurrentUser, Permissions, Roles } from './guards';
import { Principal } from './policy';
import { ChannelGrantsDto, CreateCollectionDto, CreateRoleDto, CreateUserDto, IdsDto, StatusDto, UpdateCollectionDto, UpdateRoleDto, UpdateUserDto } from './dto';

@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Usuarios') @ApiBearerAuth() @Controller('users')
export class UsersController {
  constructor(private readonly admin: AdminService) {}
  @Get() @Permissions('users.read') list(@Query() q: PageQuery) { return this.admin.users(q); }
  @Get(':id') @Permissions('users.read') find(@Param('id',ParseIntPipe) id: number) { return this.admin.user(id); }
  @Post() @Permissions('users.create') create(@CurrentUser() a: Principal, @Body() dto: CreateUserDto, @Req() req: AuthRequest) { return this.admin.createUser(a,dto,req.ip); }
  @Patch(':id') @Permissions('users.update') update(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @Req() req: AuthRequest) { return this.admin.updateUser(a,id,dto,req.ip); }
  @Patch(':id/status') @Permissions('users.disable') status(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: StatusDto, @Req() req: AuthRequest) { return this.admin.status(a,id,dto.isActive,req.ip); }
  @Get(':id/roles') @Permissions('users.read') rolesFor(@Param('id',ParseIntPipe) id: number) { return this.admin.rolesFor(id); }
  @Put(':id/roles') @Permissions('permissions.assign') setRoles(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: IdsDto, @Req() req: AuthRequest) { return this.admin.setRoles(a,id,dto.ids,req.ip); }
  @Get(':id/collections') @Permissions('users.read') userCollections(@Param('id',ParseIntPipe) id: number) { return this.admin.userCollections(id); }
  @Put(':id/collections') @Permissions('collections.assign') setCollections(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: IdsDto, @Req() req: AuthRequest) { return this.admin.setCollections(a,id,dto.ids,req.ip); }
  @Get(':id/channels') @Permissions('users.read') userChannels(@Param('id',ParseIntPipe) id: number) { return this.admin.userChannels(id); }
  @Put(':id/channels') @Permissions('collections.assign') setChannels(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: ChannelGrantsDto, @Req() req: AuthRequest) { return this.admin.setChannels(a,id,dto,req.ip); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Roles') @ApiBearerAuth() @Controller('roles')
export class RolesController {
  constructor(private readonly admin: AdminService) {}
  @Get() @Permissions('roles.read') list() { return this.admin.roles(); }
  @Post() @Permissions('roles.create') create(@CurrentUser() a: Principal, @Body() dto: CreateRoleDto, @Req() req: AuthRequest) { return this.admin.createRole(a,dto,req.ip); }
  @Patch(':id') @Permissions('roles.update') update(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: UpdateRoleDto, @Req() req: AuthRequest) { return this.admin.updateRole(a,id,dto,req.ip); }
  @Get(':id/permissions') @Permissions('permissions.read') permissions(@Param('id',ParseIntPipe) id: number) { return this.admin.rolePermissions(id); }
  @Put(':id/permissions') @Permissions('permissions.assign') assign(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: IdsDto, @Req() req: AuthRequest) { return this.admin.setPermissions(a,id,dto.ids,req.ip); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Permisos') @ApiBearerAuth() @Controller('permissions')
export class PermissionsController {
  constructor(private readonly admin: AdminService) {}
  @Get() @Permissions('permissions.read') list() { return this.admin.permissions(); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Colecciones administrativas') @ApiBearerAuth() @Controller('admin/collections')
export class CollectionsController {
  constructor(private readonly admin: AdminService) {}
  @Get() @Permissions('collections.read') list(@Query() q: PageQuery) { return this.admin.collections(q); }
  @Post() @Permissions('collections.create') create(@CurrentUser() a: Principal, @Body() dto: CreateCollectionDto, @Req() req: AuthRequest) { return this.admin.createCollection(a,dto,req.ip); }
  @Get(':id') @Permissions('collections.read') find(@Param('id',ParseIntPipe) id: number) { return this.admin.collection(id); }
  @Patch(':id') @Permissions('collections.update') update(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: UpdateCollectionDto, @Req() req: AuthRequest) { return this.admin.updateCollection(a,id,dto,req.ip); }
  @Delete(':id') @Permissions('collections.delete') remove(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Req() req: AuthRequest) { return this.admin.deleteCollection(a,id,req.ip); }
  @Get(':id/channels') @Permissions('collections.read') channels(@Param('id',ParseIntPipe) id: number) { return this.admin.collectionChannels(id); }
  @Put(':id/channels') @Permissions('collections.update') assign(@CurrentUser() a: Principal, @Param('id',ParseIntPipe) id: number, @Body() dto: IdsDto, @Req() req: AuthRequest) { return this.admin.setCollectionChannels(a,id,dto.ids,req.ip); }
  @Get(':id/assignments') @Permissions('collections.read') assignments(@Param('id',ParseIntPipe) id: number) { return this.admin.collectionAssignments(id); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Sesiones administrativas') @ApiBearerAuth() @Controller('admin/users/:userId/sessions')
export class SessionsController {
  constructor(private readonly auth: AuthService) {}
  @Get() @Permissions('sessions.read') list(@Param('userId',ParseIntPipe) id: number) { return this.auth.sessions(id); }
  @Delete(':id') @Permissions('sessions.revoke') revoke(@CurrentUser() a: Principal, @Param('userId',ParseIntPipe) userId: number, @Param('id',ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.auth.revoke(a,id,req.ip,userId); }
  @Delete() @Permissions('sessions.revoke') all(@CurrentUser() a: Principal, @Param('userId',ParseIntPipe) userId: number, @Req() req: AuthRequest) { return this.auth.revoke(a,null,req.ip,userId); }
}
@Roles('SUPER_ADMIN','ADMIN') @ApiTags('Auditoría') @ApiBearerAuth() @Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() @Permissions('audit.read') async list(@Query() q: PageQuery) {
    const [data,total] = await this.audit.list(q.page,q.limit); return { data,total,page: q.page,limit: q.limit };
  }
}

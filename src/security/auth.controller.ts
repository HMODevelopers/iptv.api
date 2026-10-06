import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto';
import { AuthRequest, CurrentUser, LoginRateGuard, PasswordChangeAllowed, Public } from './guards';
import { Principal } from './policy';
@ApiTags('Autenticación') @ApiBearerAuth() @PasswordChangeAllowed() @Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @UseGuards(LoginRateGuard) @Post('login')
  login(@Body() dto: LoginDto, @Req() req: AuthRequest) { return this.auth.login(dto,req.ip,req.headers['user-agent']); }
  @Public() @UseGuards(LoginRateGuard) @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: AuthRequest) { return this.auth.refresh(dto.refreshToken,req.ip); }
  @Post('logout') logout(@CurrentUser() actor: Principal, @Req() req: AuthRequest) { return this.auth.revoke(actor,actor.sessionId,req.ip); }
  @Post('logout-all') logoutAll(@CurrentUser() actor: Principal, @Req() req: AuthRequest) { return this.auth.revoke(actor,null,req.ip); }
  @Get('me') me(@CurrentUser() actor: Principal) { return this.auth.profile(actor); }
  @Get('sessions') sessions(@CurrentUser() actor: Principal) { return this.auth.sessions(actor.id); }
  @Delete('sessions/:id') revoke(@CurrentUser() actor: Principal, @Param('id',ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.auth.revoke(actor,id,req.ip); }
  @Post('change-password') password(@CurrentUser() actor: Principal, @Body() dto: ChangePasswordDto, @Req() req: AuthRequest) { return this.auth.changePassword(actor,dto,req.ip); }
}

import { CanActivate, ExecutionContext, Global, Injectable, Module } from '@nestjs/common';
import { AuthRequest } from '../security/guards';
import { ChannelAccessService } from './channel-access.service';
@Injectable()
export class ChannelAccessGuard implements CanActivate {
  constructor(private readonly access: ChannelAccessService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    await this.access.assert(req.principal.id,Number(req.params.id)); return true;
  }
}
@Global() @Module({ providers: [ChannelAccessService,ChannelAccessGuard], exports: [ChannelAccessService,ChannelAccessGuard] })
export class ChannelAccessModule {}

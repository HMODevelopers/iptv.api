import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
@Injectable()
export class ConfigurableThrottlerGuard extends ThrottlerGuard {
  @Inject(ConfigService) private readonly config!: ConfigService;
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.get('RATE_LIMIT_ENABLED')) return true;
    return super.canActivate(context);
  }
}

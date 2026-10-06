import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, from, mergeMap, throwError } from 'rxjs';
import { DataSource } from 'typeorm';
import { AuditService } from './audit.service';
import { AuthRequest } from './guards';
@Injectable()
export class AuditFailureInterceptor implements NestInterceptor {
  constructor(private readonly db: DataSource, private readonly audit: AuditService) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    return next.handle().pipe(catchError(error => {
      if (!req.principal || ['GET','HEAD','OPTIONS'].includes(req.method)) return throwError(() => error);
      const status = error instanceof HttpException ? error.getStatus() : 500;
      return from(this.audit.record(this.db.manager,req.principal.id,'administration.request.failed','route',null,req.ip,'DENIED',
        { method: req.method, route: String(req.route?.path ?? '').slice(0,200), status })).pipe(mergeMap(() => throwError(() => error)));
    }));
  }
}

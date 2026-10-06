import { AuditFailureInterceptor } from './audit.interceptor';
import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuditService } from './audit.service';
import { AdminService } from './admin.service';
import { AuditController, CollectionsController, PermissionsController, RolesController, SessionsController, UsersController } from './admin.controller';
import { JwtGuard, LoginRateGuard, PermissionsGuard, RolesGuard } from './guards';
@Global() @Module({ controllers: [AuthController,UsersController,RolesController,PermissionsController,CollectionsController,SessionsController,AuditController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditFailureInterceptor },AuthService,AuditService,AdminService,LoginRateGuard,
    { provide: APP_GUARD, useClass: JwtGuard }, { provide: APP_GUARD, useClass: RolesGuard }, { provide: APP_GUARD, useClass: PermissionsGuard }],
  exports: [AuthService,AuditService,AdminService] })
export class SecurityModule {}

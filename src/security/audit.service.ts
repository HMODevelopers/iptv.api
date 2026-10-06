import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from '../database/entities';
@Injectable()
export class AuditService {
  constructor(private readonly db: DataSource) {}
  record(manager: EntityManager, userId: number | null, action: string, entity: string, entityId: string | number | null, ipAddress = '', result = 'SUCCESS', metadata: Record<string, unknown> | null = null) {
    // Callers provide only identifiers/state changes; never payloads or credentials.
    return manager.save(AuditLog,{ userId, action, module: action.split('.')[0], entity,
      entityId: entityId === null ? null : String(entityId), ipAddress: ipAddress.slice(0,64), result, metadata });
  }
  list(page: number, limit: number) {
    return this.db.getRepository(AuditLog).findAndCount({ order: { id: 'DESC' }, skip: (page-1)*limit, take: limit });
  }
}

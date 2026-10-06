import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Channel, ChannelCollection, ChannelCollectionItem, ChannelPublication, UserChannelAccess, UserChannelCollection } from '../database/entities';
import { catalogPrivileges, Principal } from '../security/policy';
@Injectable()
export class ChannelAccessService {
  constructor(private readonly db: DataSource) {}
  restrict(qb: SelectQueryBuilder<Channel>, actor: Principal, alias = 'channel') {
    if (catalogPrivileges(actor).unrestrictedContent) return qb;
    const userId = actor.id;
    // EXISTS avoids duplicate rows and ensures pagination totals count authorized channels only.
    return qb.andWhere(`${alias}.isActive = :contentActive`,{ contentActive: true })
      .andWhere(`EXISTS (SELECT 1 FROM channel_publications pub WHERE pub.channelId = ${alias}.id AND pub.status = :published)`,{ published: 'PUBLISHED' })
      .andWhere(`NOT EXISTS (SELECT 1 FROM user_channel_access deny_access WHERE deny_access.channelId = ${alias}.id AND deny_access.userId = :contentUser AND deny_access.accessType = :deny)`,{ contentUser: userId, deny: 'DENY' })
      .andWhere(`(EXISTS (SELECT 1 FROM user_channel_access direct_access WHERE direct_access.channelId = ${alias}.id AND direct_access.userId = :contentUser AND direct_access.accessType = :allow)
        OR EXISTS (SELECT 1 FROM channel_collection_items item INNER JOIN channel_collections col ON col.id = item.collectionId AND col.isActive = :contentActive
        INNER JOIN user_channel_collections assignment ON assignment.collectionId = col.id AND assignment.userId = :contentUser AND assignment.revokedAt IS NULL
        WHERE item.channelId = ${alias}.id))`,{ allow: 'ALLOW' });
  }
  async assert(actor: Principal, id: number) {
    if (!await this.restrict(this.db.getRepository(Channel).createQueryBuilder('channel'),actor).andWhere('channel.id = :id',{ id }).getOne()) {
      throw new NotFoundException('Canal no encontrado');
    }
  }
  collections(userId: number) {
    return this.db.getRepository(ChannelCollection).createQueryBuilder('col')
      .innerJoin(UserChannelCollection,'assignment','assignment.collectionId = col.id AND assignment.userId = :userId AND assignment.revokedAt IS NULL',{ userId })
      .where('col.isActive = :active',{ active: true }).orderBy('col.name','ASC').getMany();
  }
}
// Imports here make the content schema dependency explicit for future EPG/favorites consumers.
export const CONTENT_ENTITIES = [ChannelPublication,ChannelCollection,ChannelCollectionItem,UserChannelAccess,UserChannelCollection];

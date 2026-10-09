import { catalogPrivileges, Principal } from '../security/policy';
import { ChannelAccessService } from '../channel-access/channel-access.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, Stream } from '../database/entities';
import { ChannelQuery, ChannelState, PageQuery } from './dto/query.dto';
@Injectable()
export class ChannelsService {
  constructor(@InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(Stream) private readonly streams: Repository<Stream>, private readonly access: ChannelAccessService) {}
  async list(query: ChannelQuery, actor: Principal, scope: 'viewer' | 'administrative' = 'viewer') {
    const privileges = catalogPrivileges(actor,scope);
    const qb = this.channels.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.channelCategories','link','link.isCurrent = :current',{ current: true }).leftJoinAndSelect('link.category','category');
    if (!privileges.unrestrictedContent) this.access.restrict(qb,actor);
    if (query.country) qb.andWhere('channel.countryCode = :country', { country: query.country });
    if (query.category) {
      qb.innerJoin('channel.channelCategories','filterLink','filterLink.isCurrent = :current',{ current: true }).innerJoin('filterLink.category','filterCategory')
        .andWhere('filterCategory.slug = :slug', { slug: query.category });
    }
    if (query.search) qb.andWhere("LOWER(channel.name) LIKE :search ESCAPE '!'", {
      search: `%${query.search.toLowerCase().replace(/[!%_]/g,'!$&')}%`,
    });
    const state = query.status ?? privileges.defaultChannelState;
    if (state !== ChannelState.ALL) qb.andWhere('channel.isActive = :active', { active: state === ChannelState.ACTIVE });
    qb.orderBy(`channel.${query.sortBy}`,query.order).addOrderBy('channel.id','ASC')
      .skip((query.page - 1) * query.limit).take(query.limit);
    const [data,total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
  async find(id: number, actor: Principal, scope: 'viewer' | 'administrative' = 'viewer'): Promise<Channel> {
    return this.findRecord(id,actor,catalogPrivileges(actor,scope).unrestrictedContent);
  }
  private async findRecord(id: number, actor: Principal, unrestrictedContent: boolean): Promise<Channel> {
    const qb = this.channels.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.channelCategories','link','link.isCurrent = :current',{ current: true })
      .leftJoinAndSelect('link.category','category').leftJoinAndSelect('channel.country','country')
      .where('channel.id = :id',{ id });
    if (!unrestrictedContent) this.access.restrict(qb,actor);
    const channel = await qb.getOne();
    if (!channel) throw new NotFoundException('Canal no encontrado');
    return channel;
  }
  async findStreams(id: number, query: PageQuery, actor: Principal, scope: 'viewer' | 'administrative' = 'viewer') {
    const privileges = catalogPrivileges(actor,scope,'streams.read');
    // Stream read permission authorizes the channel lookup in this administrative operation.
    const channel = await this.findRecord(id,actor,privileges.unrestrictedContent);
    const [data,total] = await this.streams.findAndCount({ where: { channelId: id, ...(privileges.includeUnavailableStreams ? {} : { isAvailable: true,isDisabled: false }) }, order: { id: 'ASC' }, skip: (query.page - 1) * query.limit, take: query.limit });
    return { channel, data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
}

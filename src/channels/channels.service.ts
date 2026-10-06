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
  async list(query: ChannelQuery, userId: number | null) {
    const qb = this.channels.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.channelCategories','link','link.isCurrent = :current',{ current: true }).leftJoinAndSelect('link.category','category');
    if (userId !== null) this.access.restrict(qb,userId);
    if (query.country) qb.andWhere('channel.countryCode = :country', { country: query.country });
    if (query.category) {
      qb.innerJoin('channel.channelCategories','filterLink','filterLink.isCurrent = :current',{ current: true }).innerJoin('filterLink.category','filterCategory')
        .andWhere('filterCategory.slug = :slug', { slug: query.category });
    }
    if (query.search) qb.andWhere("LOWER(channel.name) LIKE :search ESCAPE '!'", {
      search: `%${query.search.toLowerCase().replace(/[!%_]/g,'!$&')}%`,
    });
    if (query.status !== ChannelState.ALL) qb.andWhere('channel.isActive = :active', { active: query.status === ChannelState.ACTIVE });
    qb.orderBy(`channel.${query.sortBy}`,query.order).addOrderBy('channel.id','ASC')
      .skip((query.page - 1) * query.limit).take(query.limit);
    const [data,total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
  async find(id: number, userId: number | null): Promise<Channel> {
    const qb = this.channels.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.channelCategories','link','link.isCurrent = :current',{ current: true })
      .leftJoinAndSelect('link.category','category').leftJoinAndSelect('channel.country','country')
      .where('channel.id = :id',{ id });
    if (userId !== null) this.access.restrict(qb,userId);
    const channel = await qb.getOne();
    if (!channel) throw new NotFoundException('Canal no encontrado');
    return channel;
  }
  async findStreams(id: number, query: PageQuery, userId: number | null) {
    const channel = await this.find(id,userId);
    const [data,total] = await this.streams.findAndCount({ where: { channelId: id, isAvailable: true }, order: { id: 'ASC' }, skip: (query.page - 1) * query.limit, take: query.limit });
    return { channel, data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
}

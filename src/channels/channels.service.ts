import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, Stream } from '../database/entities';
import { ChannelQuery, ChannelState, PageQuery } from './dto/query.dto';
@Injectable()
export class ChannelsService {
  constructor(@InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(Stream) private readonly streams: Repository<Stream>) {}
  async list(query: ChannelQuery) {
    const qb = this.channels.createQueryBuilder('channel')
      .leftJoinAndSelect('channel.channelCategories','link').leftJoinAndSelect('link.category','category');
    if (query.country) qb.andWhere('channel.countryCode = :country', { country: query.country });
    if (query.category) {
      qb.innerJoin('channel.channelCategories','filterLink').innerJoin('filterLink.category','filterCategory')
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
  async find(id: number): Promise<Channel> {
    const channel = await this.channels.findOne({ where: { id }, relations: { channelCategories: { category: true }, country: true } });
    if (!channel) throw new NotFoundException('Canal no encontrado');
    return channel;
  }
  async findStreams(id: number, query: PageQuery) {
    const channel = await this.find(id);
    const [data,total] = await this.streams.findAndCount({ where: { channelId: id }, order: { id: 'ASC' }, skip: (query.page - 1) * query.limit, take: query.limit });
    return { channel, data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) };
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Channel } from '../../database/entities';
export enum ChannelState { ACTIVE = 'active', INACTIVE = 'inactive', ALL = 'all' }
export enum ChannelSort { NAME = 'name', CREATED = 'createdAt', SYNCED = 'lastSyncedAt' }
export enum SortOrder { ASC = 'ASC', DESC = 'DESC' }
export class PageQuery {
  @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1, maximum: 1000000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page: number = 1;
  @ApiPropertyOptional({ type: 'integer', default: 20, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
}
export class ChannelQuery extends PageQuery {
  @ApiPropertyOptional({ example: 'MX' })
  @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiPropertyOptional({ example: 'sports' })
  @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{1,100}$/) category?: string;
  @ApiPropertyOptional()
  // eslint-disable-next-line no-control-regex -- Reject control characters in user input.
  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[^\x00-\x1f\x7f]*$/)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) search?: string;
  @ApiPropertyOptional({ enum: ChannelState, default: ChannelState.ACTIVE })
  @IsEnum(ChannelState) status: ChannelState = ChannelState.ACTIVE;
  @ApiPropertyOptional({ enum: ChannelSort, default: ChannelSort.NAME })
  @IsEnum(ChannelSort) sortBy: ChannelSort = ChannelSort.NAME;
  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.ASC })
  @IsEnum(SortOrder) order: SortOrder = SortOrder.ASC;
}
export class ChannelPage {
  @ApiProperty({ type: [Channel] }) data!: Channel[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}

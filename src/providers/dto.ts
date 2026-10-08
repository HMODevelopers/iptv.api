import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, ValidateIf, IsString, Matches, Max, MaxLength, Min, ArrayMaxSize } from 'class-validator';
import { ProviderType, SyncStatus } from '../database/entities';
import { PageQuery } from '../channels/dto/query.dto';
const OptionalValue = () => ValidateIf((_object: unknown,value: unknown) => value !== undefined);
export class CreateProviderDto {
  @ApiProperty() @IsString() @MaxLength(255) @Matches(/\S/) name!: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9][a-z0-9_-]{0,99}$/) slug!: string;
  @ApiProperty({ enum: ProviderType }) @IsEnum(ProviderType) type!: ProviderType;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(10000) description?: string;
  @ApiPropertyOptional() @OptionalValue() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @OptionalValue() @IsBoolean() syncEnabled?: boolean;
  @ApiPropertyOptional() @OptionalValue() @IsInt() @Min(0) @Max(100000) priority?: number;
  @ApiProperty({ type: Object }) @IsObject() config!: Record<string,unknown>;
  @ApiPropertyOptional({ type: Object, writeOnly: true, description: 'Secretos cifrados; nunca retornados. token para M3U_URL; username/password para XTREAM.' })
  @OptionalValue() @IsObject() credentials?: Record<string,string>;
}
export class UpdateProviderDto extends PartialType(CreateProviderDto,{ skipNullProperties: false }) {}
export class LinkChannelDto { @ApiProperty() @IsInt() @Min(1) channelId!: number; }
export class UploadPlaylistDto {
  @ApiProperty({ writeOnly: true, description: 'Contenido UTF-8 de archivo M3U/M3U8 autorizado (máximo 5 MiB). No se guarda en disco.' })
  @IsString() @MaxLength(5*1024*1024) content!: string;
}
export class SyncQuery extends PageQuery {
  @ApiPropertyOptional({ enum: SyncStatus }) @OptionalValue() @IsEnum(SyncStatus) status?: SyncStatus;
  @ApiPropertyOptional() @OptionalValue() @Type(() => Number) @IsInt() @Min(1) providerId?: number;
}
export class ManualChannelDto {
  @ApiProperty() @IsString() @MaxLength(255) @Matches(/\S/) name!: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(10000) description?: string;
  @ApiPropertyOptional() @OptionalValue() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(8192) logo?: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(8192) website?: string;
  @ApiPropertyOptional({ type: [Number] }) @OptionalValue() @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) @Min(1,{ each: true }) categoryIds?: number[];
  @ApiPropertyOptional() @OptionalValue() @IsBoolean() isActive?: boolean;
}
export class UpdateChannelDto extends PartialType(ManualChannelDto,{ skipNullProperties: false }) {}
export class ManualStreamDto {
  @ApiProperty() @IsString() @MaxLength(512) @Matches(/\S/) title!: string;
  @ApiProperty() @IsString() @MaxLength(8192) url!: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(255) feedId?: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(8192) referrer?: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(2048) @Matches(/^[^\r\n]*$/) userAgent?: string;
  @ApiPropertyOptional({ type: [String] }) @OptionalValue() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(255,{ each: true }) labels?: string[];
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(32) quality?: string;
  @ApiPropertyOptional() @OptionalValue() @IsString() @MaxLength(32) format?: string;
  @ApiPropertyOptional() @OptionalValue() @IsInt() @Min(0) @Max(100000) priority?: number;
  @ApiPropertyOptional() @OptionalValue() @IsBoolean() isPreferred?: boolean;
  @ApiPropertyOptional() @OptionalValue() @IsBoolean() isDisabled?: boolean;
}
export class UpdateStreamDto extends PartialType(ManualStreamDto,{ skipNullProperties: false }) {}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, ArrayMaxSize, ArrayUnique, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class LoginDto {
  @ApiProperty() @IsString() @Length(1,254) username!: string;
  @ApiProperty() @IsString() @Length(1,128) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,100) deviceName?: string;
}
export class RefreshDto {
  @ApiProperty() @IsString() @Length(20,2048) refreshToken!: string;
}
export class ChangePasswordDto {
  @ApiProperty() @IsString() @Length(1,128) currentPassword!: string;
  @ApiProperty() @IsString() @Length(12,128) newPassword!: string;
}
export class CreateUserDto {
  @ApiProperty() @IsString() @Length(3,64) @Matches(/^[a-zA-Z0-9_.-]+$/) username!: string;
  @ApiProperty() @IsEmail() @Length(3,254) email!: string;
  @ApiProperty() @IsString() @Length(12,128) password!: string;
  @ApiProperty() @IsString() @Length(1,100) firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,100) lastName?: string;
}
export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3,64) @Matches(/^[a-zA-Z0-9_.-]+$/) username?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @Length(3,254) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,100) lastName?: string;
}
export class StatusDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
export class IdsDto {
  @ApiProperty({ type: [Number] }) @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsInt({ each: true }) @Min(1,{ each: true }) @Max(2147483647,{ each: true }) ids!: number[];
}
export class ChannelGrantDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) channelId!: number;
  @ApiProperty({ enum: ['ALLOW','DENY'] }) @IsIn(['ALLOW','DENY']) accessType!: string;
}
export class ChannelGrantsDto {
  @ApiProperty({ type: [ChannelGrantDto] }) @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ChannelGrantDto) channels!: ChannelGrantDto[];
}
export class CreateRoleDto {
  @ApiProperty() @IsString() @Length(3,64) @Matches(/^[A-Z][A-Z0-9_]+$/) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,255) description?: string;
}
export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateCollectionDto {
  @ApiProperty() @IsString() @Length(1,100) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCollectionDto extends PartialType(CreateCollectionDto) {}
export class PublicationDto {
  @ApiProperty({ enum: ['DRAFT','PUBLISHED','HIDDEN','DISABLED'] }) @IsIn(['DRAFT','PUBLISHED','HIDDEN','DISABLED']) status!: string;
}

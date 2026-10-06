import { Controller, Get, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { Category, Country } from '../database/entities';
@ApiBearerAuth() @ApiTags('Catálogos') @Controller()
class CatalogsController {
  constructor(@InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Country) private readonly countries: Repository<Country>) {}
  @Get('categories') @ApiOkResponse({ type: [Category] })
  getCategories() { return this.categories.find({ order: { name: 'ASC' } }); }
  @Get('countries') @ApiOkResponse({ type: [Country] })
  getCountries() { return this.countries.find({ order: { name: 'ASC' } }); }
}
@Module({ imports: [TypeOrmModule.forFeature([Category,Country])], controllers: [CatalogsController] })
export class CatalogsModule {}

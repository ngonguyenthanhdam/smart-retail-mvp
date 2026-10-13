import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { CategoriesService } from './categories.service';

@Controller('categories')
@Roles('ADMIN')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) { return this.categories.list(query); }
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown) { return this.categories.create(body); }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown) { return this.categories.update(id, body); }
}

import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProductsService } from './products.service';
@Controller('products')
@Roles('ADMIN')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get()
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.products.list(query, user); }
  @Get(':id')
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.products.detail(id, user); }
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown) { return this.products.create(body); }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown) { return this.products.update(id, body); }
}

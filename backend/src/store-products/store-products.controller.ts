import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { StoreProductsService } from './store-products.service';
@Controller('store-products')
@Roles('ADMIN', 'STORE_MANAGER')
export class StoreProductsController {
  constructor(private readonly service: StoreProductsService) {}
  @Get()
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.list(query, user); }
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.create(body, user); }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.update(id, body, user); }
}

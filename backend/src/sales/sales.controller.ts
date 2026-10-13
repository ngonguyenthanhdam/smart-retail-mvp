import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SalesService } from './sales.service';
@Controller('sales')
@Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
export class SalesController {
  constructor(private readonly service: SalesService) {}
  @Post() @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.create(body, user); }
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.list(query, user); }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.detail(id, user); }
}

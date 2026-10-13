import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PurchasesService } from './purchases.service';
@Controller('purchases')
@Roles('ADMIN', 'STORE_MANAGER')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.list(query, user); }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.detail(id, user); }
  @Post() @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.create(body, user); }
  @Patch(':id') @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.update(id, body, user); }
  @Post(':id/cancel') @Header('Cache-Control', 'no-store')
  cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.cancel(id, body, user); }
  @Post(':id/receive') @Header('Cache-Control', 'no-store')
  receive(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.receive(id, body, user); }
}

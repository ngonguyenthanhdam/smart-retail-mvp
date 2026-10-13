import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ReplenishmentService } from './replenishment.service';
@Controller('replenishment') @Roles('ADMIN','STORE_MANAGER')
export class ReplenishmentController {
  constructor(private readonly service: ReplenishmentService) {}
  @Get() @Header('Cache-Control','no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.list(query,user); }
  @Get(':id') @Header('Cache-Control','no-store')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.detail(id,user); }
  @Post('generate') @Header('Cache-Control','no-store')
  generate(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.generate(body,user); }
  @Post(':id/decision') @Header('Cache-Control','no-store')
  decide(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.decide(id,body,user); }
  @Post(':id/purchase') @Header('Cache-Control','no-store')
  purchase(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.purchase(id,body,user); }
}

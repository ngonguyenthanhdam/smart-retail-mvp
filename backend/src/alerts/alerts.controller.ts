import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AlertsService } from './alerts.service';
@Controller('alerts') @Roles('ADMIN','STORE_MANAGER')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}
  @Get() @Header('Cache-Control','no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.list(query,user); }
  @Post('evaluate') @Header('Cache-Control','no-store')
  evaluate(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.evaluate(body,user); }
}

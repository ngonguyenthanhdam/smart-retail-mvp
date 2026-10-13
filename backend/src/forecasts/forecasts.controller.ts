import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ForecastsService } from './forecasts.service';

@Controller('forecasts/runs')
@Roles('ADMIN', 'STORE_MANAGER')
export class ForecastsController {
  constructor(private readonly service: ForecastsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.list(query, user); }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.detail(id, query, user); }
  @Post() @Roles('ADMIN') @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.create(body, user); }
}

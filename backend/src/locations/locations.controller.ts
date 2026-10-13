import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { resolveLocationScope } from '../auth/location-scope';
import { uuidValue } from '../common/validation';
import { LocationsService } from './locations.service';

@Controller('locations')
@Roles('ADMIN')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) { return this.locations.list(query); }

  @Get(':id')
  @Roles('ADMIN', 'STORE_MANAGER', 'STAFF')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const validId = uuidValue(id);
    resolveLocationScope(user, validId);
    return this.locations.detail(validId);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown) { return this.locations.create(body); }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown) { return this.locations.update(id, body); }
}

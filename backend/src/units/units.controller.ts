import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { UnitsService } from './units.service';
@Controller('units')
@Roles('ADMIN')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) { return this.units.list(query); }
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown) { return this.units.create(body); }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown) { return this.units.update(id, body); }
}

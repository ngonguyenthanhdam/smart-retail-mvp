import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UsersService } from './users.service';

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) { return this.users.list(query); }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) { return this.users.detail(id); }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.users.create(body, actor.id); }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) { return this.users.update(id, body, actor.id); }
}

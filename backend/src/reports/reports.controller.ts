import { Controller, Get, Header, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ReportsService } from './reports.service';
@Controller('reports')
@Roles('ADMIN', 'STORE_MANAGER')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get('dashboard') @Header('Cache-Control', 'no-store')
  dashboard(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.dashboard(query, user); }
}

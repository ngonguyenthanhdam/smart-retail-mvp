import { Body, Controller, Get, Header, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ForecastDataService } from './forecast-data.service';
import { PredictionClient } from './prediction-client';

@Controller('forecasts/data')
@Roles('ADMIN', 'STORE_MANAGER')
export class ForecastDataController {
  constructor(private readonly data: ForecastDataService, private readonly prediction: PredictionClient) {}
  @Get() @Header('Cache-Control', 'no-store')
  status(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) { return this.data.status(query, user); }
  @Get('model') @Header('Cache-Control', 'no-store')
  async model() {
    try { return { available: true, ...await this.prediction.modelInfo() }; }
    catch { return { available: false, errorCode: 'MODEL_UNAVAILABLE' }; }
  }
  @Post('coverage') @Roles('ADMIN') @Header('Cache-Control', 'no-store')
  coverage(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.data.confirmCoverage(body, user); }
  @Get('export') @Roles('ADMIN')
  async export(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const result = await this.data.exportCsv(query, user);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="store-history-${result.origin}-${result.sha256.slice(0, 12)}.csv"`);
    response.setHeader('X-Dataset-SHA256', result.sha256); response.setHeader('Cache-Control', 'no-store');
    response.send(result.csv);
  }
}

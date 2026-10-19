import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ForecastsController } from './forecasts.controller';
import { ForecastsService } from './forecasts.service';
import { ForecastHistory } from './forecast-history';
import { PredictionClient } from './prediction-client';
import { AlertsModule } from '../alerts/alerts.module';
import { ForecastDataController } from './forecast-data.controller';
import { ForecastDataService } from './forecast-data.service';
@Module({ imports: [DatabaseModule, AlertsModule], controllers: [ForecastsController, ForecastDataController], providers: [ForecastsService, ForecastHistory, PredictionClient, ForecastDataService], exports: [ForecastHistory] })
export class ForecastsModule {}

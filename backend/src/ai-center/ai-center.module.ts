import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ForecastsModule } from '../forecasts/forecasts.module';
import { AiGuard, AiResourceInterceptor, AiStorage } from './ai-core';
import { AiCenterController } from './ai-center.controller';
import { DatasetsService } from './datasets.service';
import { TrainingService } from './training.service';
import { BusinessTools } from './business-tools';
import { ChatService } from './chat.service';
@Module({ imports: [DatabaseModule, AuthModule, ReportsModule, AlertsModule, ForecastsModule], controllers: [AiCenterController],
  providers: [AiGuard, AiResourceInterceptor, AiStorage, DatasetsService, TrainingService, BusinessTools, ChatService] })
export class AiCenterModule {}

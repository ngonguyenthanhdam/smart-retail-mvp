import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { ReplenishmentController } from './replenishment.controller';
import { ReplenishmentService } from './replenishment.service';
@Module({ imports: [DatabaseModule, AlertsModule, PurchasesModule], controllers: [ReplenishmentController], providers: [ReplenishmentService] })
export class ReplenishmentModule {}

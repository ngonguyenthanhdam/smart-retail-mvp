import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { LocationsModule } from './locations/locations.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { UnitsModule } from './units/units.module';
import { ProductsModule } from './products/products.module';
import { StoreProductsModule } from './store-products/store-products.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ImportsModule } from './imports/imports.module';
import { ReportsModule } from './reports/reports.module';
import { ForecastsModule } from './forecasts/forecasts.module';
import { ReplenishmentModule } from './replenishment/replenishment.module';
import { AlertsModule } from './alerts/alerts.module';
import { AiCenterModule } from './ai-center/ai-center.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    HealthModule,
    AuthModule,
    LocationsModule,
    UsersModule,
    CategoriesModule,
    UnitsModule,
    ProductsModule,
    StoreProductsModule,
    InventoryModule,
    PurchasesModule,
    SalesModule,
    ExpensesModule,
    ImportsModule,
    ReportsModule,
    ForecastsModule,
    ReplenishmentModule,
    AlertsModule,
    AiCenterModule,
  ],
})
export class AppModule {}

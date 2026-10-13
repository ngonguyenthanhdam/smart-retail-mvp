import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StoreProductsController } from './store-products.controller';
import { StoreProductsService } from './store-products.service';
@Module({ imports: [DatabaseModule], controllers: [StoreProductsController], providers: [StoreProductsService] })
export class StoreProductsModule {}

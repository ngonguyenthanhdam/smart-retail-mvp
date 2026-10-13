import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
@Module({ imports: [DatabaseModule], controllers: [SalesController], providers: [SalesService] })
export class SalesModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportPlanner } from './import-plan';
@Module({ imports: [DatabaseModule], controllers: [ImportsController], providers: [ImportsService, ImportPlanner] })
export class ImportsModule {}

import { Body, Controller, Get, Header, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MAX_BYTES } from './import-file';
import { ImportsService } from './imports.service';

@Controller('imports')
@Roles('ADMIN')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}
  @Get('templates') @Header('Cache-Control', 'no-store')
  templates() { return this.service.definitions(); }
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) { return this.service.list(query); }
  @Get(':id') @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) { return this.service.detail(id); }
  @Post('preview') @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1, fields: 1, parts: 2, fieldSize: 100 } }))
  preview(@Body() body: unknown, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) { return this.service.upload(body, file, user); }
  @Post(':id/confirm') @Header('Cache-Control', 'no-store')
  confirm(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.confirm(id, body, user); }
  @Post(':id/cancel') @Header('Cache-Control', 'no-store')
  cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.service.cancel(id, body, user); }
}

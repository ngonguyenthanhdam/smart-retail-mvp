import { Body, Controller, Delete, Get, Param, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AiGuard, AiResourceInterceptor, AI_LIMITS, aiError } from './ai-core';
import { DATA_FIELDS } from './dataset-validation';
import { DatasetsService } from './datasets.service';
import { TrainingService } from './training.service';
import { ChatService } from './chat.service';

@Controller('ai-center')
@UseGuards(AiGuard)
@UseInterceptors(AiResourceInterceptor)
export class AiCenterController {
  constructor(private readonly datasets: DatasetsService, private readonly training: TrainingService, private readonly chat: ChatService, private readonly db: PrismaService) {}
  @Get('config') async config(@CurrentUser() user: AuthenticatedUser) {
    return { limits: AI_LIMITS, fields: DATA_FIELDS, algorithms: ['SeasonalNaive','RollingMean28','LightGBM'],
      stores: await this.db.location.findMany({ where: { locationType: 'STORE', isActive: true, deletedAt: null, ...(user.role === 'STORE_MANAGER' ? { id: user.locationId! } : {}) }, select: { id: true, code: true, name: true }, take: 500 }) };
  }
  @Get('datasets') list(@CurrentUser() user: AuthenticatedUser) { return this.datasets.list(user); }
  @Post('datasets') create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.datasets.create(body, user); }
  @Get('datasets/:id') detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.datasets.detail(id, user); }
  @Post('datasets/:id/files')
  @UseInterceptors(FilesInterceptor('files', AI_LIMITS.files, { limits: { files: AI_LIMITS.files, fileSize: AI_LIMITS.fileBytes, fields: 0, parts: AI_LIMITS.files } }))
  upload(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthenticatedUser) { return this.datasets.upload(id, files, user); }
  @Post('datasets/:id/files/:fileId/mapping') mapping(@Param('id') id: string, @Param('fileId') fileId: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.datasets.mapFile(id, fileId, body, user); }
  @Post('datasets/:id/files/:fileId/replacement')
  @UseInterceptors(FilesInterceptor('files', 1, { limits: { files: 1, fileSize: AI_LIMITS.fileBytes, fields: 0, parts: 1 } }))
  replace(@Param('id') id: string, @Param('fileId') fileId: string, @UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthenticatedUser) { return this.datasets.replaceFile(id, fileId, files, user); }
  @Delete('datasets/:id/files/:fileId') remove(@Param('id') id: string, @Param('fileId') fileId: string, @CurrentUser() user: AuthenticatedUser) { return this.datasets.removeFile(id, fileId, user); }
  @Post('datasets/:id/validate') validate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.datasets.validate(id, user); }
  @Post('datasets/:id/publish') publish(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.datasets.publish(id, body, user); }
  @Delete('datasets/:id') discard(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.datasets.discard(id, user); }
  @Get('training') jobs(@CurrentUser() user: AuthenticatedUser) { return this.training.list(user); }
  @Post('training') train(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.training.start(body, user); }
  @Get('training/:id') job(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.training.detail(id, user); }
  @Post('training/:id/cancel') cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.training.cancel(id, user); }
  @Get('models') models(@CurrentUser() user: AuthenticatedUser) { return this.training.models(user); }
  @Post('models/activate') activate(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.training.deploy(body, user); }
  @Get('chat/status') chatStatus() { return this.chat.status(); }
  @Get('chat/sessions') sessions(@CurrentUser() user: AuthenticatedUser) { return this.chat.sessions(user); }
  @Post('chat/sessions') session(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.chat.create(body, user); }
  @Get('chat/sessions/:id') conversation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) { return this.chat.detail(id, user); }
  @Post('chat/sessions/:id/messages') message(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) { return this.chat.send(id, body, user); }
  @Get('audit') async events(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') aiError('ACCESS_DENIED', 'Chỉ ADMIN xem nhật ký AI toàn hệ thống.', 403);
    return { items: await this.db.aiAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) };
  }
}

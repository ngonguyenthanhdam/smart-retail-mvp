import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { PasswordResetService } from './password-reset.service';
import { ResetMailer } from './reset-mailer.service';

@Module({
  imports: [DatabaseModule, JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      secret: config.getOrThrow<string>('JWT_SECRET'),
      signOptions: { algorithm: 'HS256', expiresIn: config.getOrThrow<number>('JWT_EXPIRES_SECONDS') },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  })],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, PasswordResetService, ResetMailer,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [AuthGuard, RolesGuard],
})
export class AuthModule {}

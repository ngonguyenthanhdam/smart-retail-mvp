import { Body, Controller, Get, Header, HttpCode, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AUTH_COOKIE, authCookieOptions } from './auth-cookie';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { PasswordResetService } from './password-reset.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService, private readonly passwords: PasswordResetService) {}

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  forgotPassword(@Body() body: unknown) {
    return this.passwords.request(body);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async resetPassword(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.passwords.reset(body);
    response.clearCookie(AUTH_COOKIE, authCookieOptions(this.config.get('NODE_ENV') === 'production'));
    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<AuthenticatedUser> {
    const { user, token } = await this.auth.login(body);
    response.cookie(AUTH_COOKIE, token, {
      ...authCookieOptions(this.config.get('NODE_ENV') === 'production'),
      maxAge: this.config.getOrThrow<number>('JWT_EXPIRES_SECONDS') * 1000,
    });
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(AUTH_COOKIE, authCookieOptions(this.config.get('NODE_ENV') === 'production'));
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

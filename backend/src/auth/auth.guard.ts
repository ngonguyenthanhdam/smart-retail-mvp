import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { readAuthCookie } from './auth-cookie';
import { PUBLIC_ROUTE } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // CORS governs reading responses; this check also prevents untrusted browser writes.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if ((origin && origin !== this.config.getOrThrow<string>('FRONTEND_ORIGIN')) ||
        (!origin && request.headers['sec-fetch-site'] === 'cross-site')) {
        throw new ForbiddenException('Request origin is not allowed.');
      }
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;

    const token = readAuthCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException();
    let subject: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown; exp?: unknown }>(token, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payload.sub) ||
        typeof payload.exp !== 'number') throw new Error('Invalid token claims');
      subject = payload.sub;
    } catch {
      throw new UnauthorizedException();
    }
    request.user = await this.auth.currentUser(subject);
    return true;
  }
}

import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, RoleCode } from './auth.types';

export const PUBLIC_ROUTE = 'auth:public';
export const REQUIRED_ROLES = 'auth:roles';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: RoleCode[]) => SetMetadata(REQUIRED_ROLES, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new UnauthorizedException();
  return user;
});

import { BadRequestException } from '@nestjs/common';
import { bodyObject, emailAddress, passwordValue } from '../common/validation';

export interface ForgotPasswordDto { email: string }
export interface ResetPasswordDto { token: string; newPassword: string }

export function parseForgotPassword(input: unknown): ForgotPasswordDto {
  const body = bodyObject(input, ['email']);
  return { email: emailAddress(body.email) };
}

export function parseResetPassword(input: unknown): ResetPasswordDto {
  const body = bodyObject(input, ['token', 'newPassword']);
  if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
    throw new BadRequestException('The reset link is invalid or has expired.');
  }
  return { token: body.token, newPassword: passwordValue(body.newPassword) };
}

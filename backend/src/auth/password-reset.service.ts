import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { hash } from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { parseForgotPassword, parseResetPassword } from './password-reset.dto';
import { ResetMailer } from './reset-mailer.service';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const GENERIC_RESPONSE = { message: 'If an account with that email exists, a password reset link has been sent.' };

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: ResetMailer,
  ) {}

  async request(input: unknown): Promise<{ message: string }> {
    const { email } = parseForgotPassword(input);
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true, deletedAt: null }, select: { id: true },
    });
    if (!user) return GENERIC_RESPONSE;

    const token = randomBytes(32).toString('hex');
    const tokenHash = digest(token);
    const updated = await this.prisma.user.updateMany({
      where: { id: user.id, email, isActive: true, deletedAt: null },
      data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });
    if (!updated.count) return GENERIC_RESPONSE;

    const link = new URL('/reset-password', this.config.getOrThrow<string>('FRONTEND_ORIGIN'));
    link.hash = new URLSearchParams({ token }).toString();
    try {
      await this.mailer.sendPasswordReset(email, link.toString());
    } catch {
      await this.prisma.user.updateMany({
        where: { id: user.id, passwordResetTokenHash: tokenHash },
        data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
      });
      this.logger.warn('Password reset email could not be delivered. Check the SMTP service and configuration.');
    }
    return GENERIC_RESPONSE;
  }

  async reset(input: unknown): Promise<{ message: string }> {
    const { token, newPassword } = parseResetPassword(input);
    const tokenHash = digest(token);
    const user = await this.prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('The reset link is invalid or has expired.');

    const passwordHash = await hash(newPassword, 12);
    // A conditional write consumes the token once, including concurrent reset requests.
    const result = await this.prisma.user.updateMany({
      where: { id: user.id, passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() }, isActive: true, deletedAt: null },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    if (result.count !== 1) throw new BadRequestException('The reset link is invalid or has expired.');
    return { message: 'Your password has been reset. You can now sign in.' };
  }
}

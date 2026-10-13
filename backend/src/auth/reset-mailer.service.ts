import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class ResetMailer {
  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const host = this.config.getOrThrow<string>('SMTP_HOST');
    if (!host) throw new Error('SMTP is not configured.');
    const user = this.config.get<string>('SMTP_USER');
    const transport = nodemailer.createTransport({
      host,
      port: this.config.getOrThrow<number>('SMTP_PORT'),
      secure: this.config.getOrThrow<boolean>('SMTP_SECURE'),
      requireTLS: !['localhost', '127.0.0.1', '::1'].includes(host),
      auth: user ? { user, pass: this.config.getOrThrow<string>('SMTP_PASSWORD') } : undefined,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true,
      logger: false, debug: false,
    });
    await transport.sendMail({
      from: { name: 'RetailSense', address: this.config.getOrThrow<string>('SMTP_FROM') },
      to: { address: email, name: '' },
      subject: 'Reset your RetailSense password',
      text: `A password reset was requested for your RetailSense account.\n\nOpen this link to choose a new password:\n${resetUrl}\n\nThis link expires in 30 minutes and can be used once.\nIf you did not request a reset, you can ignore this email.`,
    });
  }
}

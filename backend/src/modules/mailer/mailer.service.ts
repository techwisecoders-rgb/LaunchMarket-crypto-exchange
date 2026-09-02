import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const port = this.configService.get<number>('SMTP_PORT', 587);

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      tls: {
       rejectUnauthorized:
    this.configService.get<string>('SMTP_REJECT_UNAUTHORIZED') !== 'false',
      },
    });
  }

  async sendMail(options: MailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM', 'SIDRA Exchange <no-reply@sidra.exchange>'),
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
    const appName = this.configService.get<string>('APP_NAME', 'SIDRA Exchange');
    await this.sendMail({
      to,
      subject: `${appName} - Verify your email address`,
      html: this.template(
        'Email Verification',
        `Please verify your email address to activate your ${appName} account. This link expires in 24 hours.`,
        'Verify Email',
        verificationUrl,
      ),
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const appName = this.configService.get<string>('APP_NAME', 'SIDRA Exchange');
    await this.sendMail({
      to,
      subject: `${appName} - Reset your password`,
      html: this.template(
        'Password Reset',
        'You requested to reset your password. Click below to choose a new password. This link expires in 1 hour. If you did not request this, you can safely ignore this email.',
        'Reset Password',
        resetUrl,
      ),
    });
  }

  async sendOtpEmail(to: string, otp: string, purpose: string): Promise<void> {
    const appName = this.configService.get<string>('APP_NAME', 'SIDRA Exchange');
    await this.sendMail({
      to,
      subject: `${appName} - Your verification code`,
      html: this.template(
        purpose,
        `Your verification code is:<br/><div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#F0B90B;background:#121212;padding:16px 24px;border-radius:8px;display:inline-block;margin:12px 0;">${otp}</div><br/>This code expires in 5 minutes. Do not share this code with anyone.`,
        'Enter this code',
        '#',
      ),
    });
  }

  async sendWithdrawalConfirmation(to: string, detailsHtml: string): Promise<void> {
    const appName = this.configService.get<string>('APP_NAME', 'SIDRA Exchange');
    await this.sendMail({
      to,
      subject: `${appName} - Withdrawal request received`,
      html: this.template(
        'Withdrawal Request',
        detailsHtml,
        'View in dashboard',
        `${this.getFrontendUrl()}/withdraw`,
      ),
    });
  }

  async sendNotificationEmail(params: {
    to: string;
    subject: string;
    title: string;
    message: string;
    userName?: string;
  }): Promise<void> {
    const { to, subject, title, message, userName } = params;
    const appName = this.configService.get<string>('APP_NAME', 'SIDRA Exchange');
    await this.sendMail({
      to,
      subject: `${appName} - ${subject}`,
      html: this.template(
        title,
        `${userName ? `<p style="color:#FFFFFF;font-size:15px;margin:0 0 16px 0;">Hello ${userName},</p>` : ''}<p style="color:#848E9C;font-size:15px;line-height:1.6;margin:0 0 24px 0;">${message}</p>`,
        'Open Dashboard',
        `${this.getFrontendUrl()}/dashboard`,
      ),
    });
  }

  private getFrontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  private template(title: string, content: string, buttonText: string, buttonUrl: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#0B0E11;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0B0E11;padding:40px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#161A1E;border:1px solid #2B3139;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:32px 40px;background-color:#0B0E11;border-bottom:1px solid #2B3139;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:22px;font-weight:800;color:#F0B90B;">SIDRA</span>
                    <span style="font-size:22px;font-weight:800;color:#FFFFFF;">EXCHANGE</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:32px 40px;">
                  <h1 style="color:#FFFFFF;font-size:22px;margin:0 0 16px 0;font-weight:700;">${title}</h1>
                  <p style="color:#848E9C;font-size:15px;line-height:1.6;margin:0 0 24px 0;">${content}</p>
                  <a href="${buttonUrl}" style="display:inline-block;background-color:#F0B90B;color:#0B0E11;font-weight:700;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:6px;">${buttonText}</a>
                  <p style="color:#5E6673;font-size:13px;line-height:1.5;margin:24px 0 0 0;">
                    If the button does not work, copy and paste this URL into your browser:<br/>
                    <a href="${buttonUrl}" style="color:#F0B90B;word-break:break-all;">${buttonUrl}</a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 40px;background-color:#0B0E11;border-top:1px solid #2B3139;">
                  <p style="color:#5E6673;font-size:12px;margin:0;text-align:center;">© ${new Date().getFullYear()} SIDRA Exchange. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }
}
import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate and send an OTP to the user's email.
   * OTP is 6 digits, stored as SHA-256 hash, expires in 5 minutes.
   */
  async generateAndSendOtp(
    userId: string,
    purpose: string,
    email: string,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<{ expiresAt: Date; resendAfterSec: number }> {
    // Enforce resend cooldown: 60 seconds
    const resendCooldownSec = this.configService.get<number>('OTP_RESEND_COOLDOWN_SEC', 60);
    const recentOtp = await this.prisma.otp.findFirst({
      where: {
        userId,
        purpose,
        status: { in: ['PENDING', 'VERIFIED'] },
        createdAt: { gt: new Date(Date.now() - resendCooldownSec * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp && recentOtp.createdAt > new Date(Date.now() - resendCooldownSec * 1000)) {
      const waitSec = Math.ceil(
        (recentOtp.createdAt.getTime() + resendCooldownSec * 1000 - Date.now()) / 1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSec} seconds before requesting a new code`,
      );
    }

    // Generate 6-digit code
    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresInMs = this.configService.get<number>('OTP_EXPIRY_MS', 5 * 60 * 1000);
    const expiresAt = new Date(Date.now() + expiresInMs);
    const maxAttempts = this.configService.get<number>('OTP_MAX_ATTEMPTS', 5);

    // Invalidate previous pending OTPs for this purpose
    await this.prisma.otp.updateMany({
      where: { userId, purpose, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    await this.prisma.otp.create({
      data: {
        userId,
        purpose,
        codeHash,
        expiresAt,
        maxAttempts,
        status: 'PENDING',
      },
    });

    // Send email
    await this.mailerService.sendOtpEmail(email, code, purpose.toLowerCase());

    // Audit
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'OTP_GENERATED',
        entity: 'Otp',
        entityId: userId,
        details: { purpose },
        ipAddress: context.ip,
        userAgent: context.userAgent,
      },
    });

    return {
      expiresAt,
      resendAfterSec: resendCooldownSec,
    };
  }

  /**
   * Verify an OTP code against the stored hash.
   */
  async verifyOtp(
    userId: string,
    purpose: string,
    code: string,
  ): Promise<{ success: boolean; otpId: string }> {
    // Reject obviously invalid formats
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid OTP format');
    }

    const otp = await this.prisma.otp.findFirst({
      where: {
        userId,
        purpose,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('No active OTP found. Please request a new code.');
    }

    // Check expiry
    if (otp.expiresAt < new Date()) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('OTP has expired. Please request a new code.');
    }

    // Check attempts
    if (otp.attempts >= otp.maxAttempts) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { status: 'MAX_ATTEMPTS' },
      });
      throw new BadRequestException('Maximum OTP attempts exceeded. Please request a new code.');
    }

    // Increment attempts
    const updated = await this.prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    // Compare hash (constant-time comparison)
    const providedHash = this.hashCode(code);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(otp.codeHash, 'hex'),
    );

    if (!isValid) {
      if (updated.attempts >= otp.maxAttempts) {
        await this.prisma.otp.update({
          where: { id: otp.id },
          data: { status: 'MAX_ATTEMPTS' },
        });
      }
      throw new BadRequestException('Invalid OTP code');
    }

    // Mark as verified
    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    });

    await this.prisma.securityLog.create({
      data: {
        userId,
        eventType: 'OTP_VERIFIED',
        details: { purpose } as Prisma.InputJsonValue,
      },
    });

    return { success: true, otpId: otp.id };
  }

  /**
   * Create a withdrawal OTP record associated with a pending withdrawal request.
   * Returns the plaintext code only once for sending to the user.
   */
  async createWithdrawalOtp(
    userId: string,
    email: string,
    withdrawalRequestId: string,
  ): Promise<{ code: string; expiresAt: Date; resendAfterSec: number }> {
    const resendCooldownSec = this.configService.get<number>('OTP_RESEND_COOLDOWN_SEC', 60);
    const code = this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresInMs = this.configService.get<number>('OTP_EXPIRY_MS', 5 * 60 * 1000);
    const expiresAt = new Date(Date.now() + expiresInMs);

    // Store the OTP linked to the withdrawal request via metadata
    await this.prisma.otp.create({
      data: {
        userId,
        purpose: 'WITHDRAWAL',
        codeHash,
        expiresAt,
        maxAttempts: this.configService.get<number>('OTP_MAX_ATTEMPTS', 5),
        status: 'PENDING',
        metadata: { withdrawalRequestId } as Prisma.InputJsonValue,
      },
    });

    await this.mailerService.sendOtpEmail(email, code, 'withdrawal verification');

    return {
      code,
      expiresAt,
      resendAfterSec: resendCooldownSec,
    };
  }

  /**
   * Verify withdrawal OTP and return the withdrawal request ID.
   */
  async verifyWithdrawalOtp(
    userId: string,
    code: string,
  ): Promise<{ success: boolean; withdrawalRequestId: string }> {
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid OTP format');
    }

    const otp = await this.prisma.otp.findFirst({
      where: {
        userId,
        purpose: 'WITHDRAWAL',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('No active OTP found. Please request a new code.');
    }

    if (otp.expiresAt < new Date()) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('OTP has expired. Please request a new code.');
    }

    if (otp.attempts >= otp.maxAttempts) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { status: 'MAX_ATTEMPTS' },
      });
      throw new BadRequestException('Maximum OTP attempts exceeded. Please request a new code.');
    }

    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    const providedHash = this.hashCode(code);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(otp.codeHash, 'hex'),
    );

    if (!isValid) {
      throw new BadRequestException('Invalid OTP code');
    }

    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    });

    const metadata = otp.metadata as { withdrawalRequestId?: string } | null;
    if (!metadata?.withdrawalRequestId) {
      throw new BadRequestException('OTP is not associated with a withdrawal request');
    }

    return {
      success: true,
      withdrawalRequestId: metadata.withdrawalRequestId,
    };
  }

  /**
   * Get last OTP request time for a user and purpose (for resend timer UI).
   */
  async getLastOtpRequest(userId: string, purpose: string) {
    const otp = await this.prisma.otp.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return otp?.createdAt ?? null;
  }

  private generateCode(): string {
    // Use crypto for true randomness
    const buffer = crypto.randomBytes(3);
    const num = buffer.readUIntBE(0, 3) % 1000000;
    return num.toString().padStart(6, '0');
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Delete expired OTPs (maintenance).
   */
  async cleanupExpiredOtps(): Promise<number> {
    const result = await this.prisma.otp.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { status: { in: ['EXPIRED', 'USED', 'MAX_ATTEMPTS'] } },
        ],
      },
    });
    return result.count;
  }
}
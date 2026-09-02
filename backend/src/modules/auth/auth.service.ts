import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { WalletService } from '../wallets/wallet.service';
import { OtpService } from '../otp/otp.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtUser } from '../../common/decorators/current-user.decorator';

interface RequestContext {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  deviceType?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly walletService: WalletService,
    private readonly otpService: OtpService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Register a new user.
   * Creates user, generates wallets for all chains, sends verification email.
   */
  async register(dto: RegisterDto, ctx: RequestContext) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email.toLowerCase(),
            passwordHash,
            role: 'USER',
            status: 'PENDING_VERIFICATION',
          },
        });

        // Generate wallets for all supported chains
        await this.walletService.createUserWallets(created.id, tx);

        // Create verification token
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(token);

        await tx.emailVerificationToken.create({
          data: {
            userId: created.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId: created.id,
            action: 'USER_REGISTERED',
            entity: 'User',
            entityId: created.id,
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
          },
        });

        return { user: created, token };
      });

      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const verificationUrl = `${frontendUrl}/verify-email?token=${user.token}`;

      // Email delivery is non-blocking: registration succeeds even if the
      // verification email cannot be delivered (user can resend). In development
      // the link is also logged so flows can be tested without SMTP.
      await this.mailerService
        .sendVerificationEmail(user.user.email, verificationUrl)
        .then(() => this.logger.log(`Verification email sent to ${user.user.email}`))
        .catch((err) => {
          this.logger.warn(
            `Verification email could not be delivered to ${user.user.email}. URL: ${verificationUrl}`,
            err instanceof Error ? err.message : String(err),
          );
        });

      return {
        message: 'Registration successful. Please check your email to verify your account.',
      };
    } catch (error) {
      this.logger.error('Registration failed', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  /**
   * Login with email and password. Issues JWT access + refresh tokens.
   */
  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.validateCredentials(dto.email, dto.password, ctx);
    return this.issueTokensForUser(user, ctx);
  }

  /**
   * Step 1 of OTP-protected login: validate email/password and dispatch
   * a 6-digit login OTP to the user's email.
   */
  async requestLoginOtp(
    dto: { email: string; password: string },
    ctx: RequestContext,
  ): Promise<{ message: string; expiresAt: Date; resendAfterSec: number }> {
    const user = await this.validateCredentials(dto.email, dto.password, ctx);

    const result = await this.otpService.generateAndSendOtp(
      user.id,
      'LOGIN',
      user.email,
      { ip: ctx.ip, userAgent: ctx.userAgent },
    );

    return {
      message:
        'If your credentials are valid, a 6-digit verification code has been sent to your email.',
      expiresAt: result.expiresAt,
      resendAfterSec: result.resendAfterSec,
    };
  }

  /**
   * Step 2 of OTP-protected login: verify the 6-digit code and issue
   * JWT access + refresh tokens.
   */
  async verifyLoginOtp(
    dto: { email: string; code: string },
    ctx: RequestContext,
  ) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await this.securityEventLog(null, 'LOGIN_FAILED', { reason: 'USER_NOT_FOUND' }, ctx);
      throw new UnauthorizedException('Invalid email or verification code');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }
    if (user.status === 'BLOCKED' || user.status === 'FROZEN') {
      throw new ForbiddenException('Account is blocked. Contact support.');
    }

    await this.otpService.verifyOtp(user.id, 'LOGIN', dto.code);
    return this.issueTokensForUser(user, ctx);
  }

  /**
   * Refresh access token using a valid refresh token.
   */
  async refreshToken(refreshToken: string, ctx: RequestContext) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (stored.user.status === 'BLOCKED' || stored.user.status === 'FROZEN') {
      throw new ForbiddenException('Account is blocked');
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedBy: newTokenHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: newTokenHash,
          sessionId: stored.sessionId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      }),
    ]);

    const payload: JwtUser = {
      sub: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
      status: stored.user.status,
    };

    const accessToken = this.jwtService.sign(payload);

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Verify email using the token sent to the user's email.
   */
  async verifyEmail(token: string, ctx: RequestContext) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new BadRequestException('Invalid verification token');
    }

    if (stored.usedAt) {
      throw new BadRequestException('Verification token has already been used');
    }

    if (stored.expiresAt < new Date()) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: stored.userId,
          action: 'EMAIL_VERIFIED',
          entity: 'User',
          entityId: stored.userId,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      }),
    ]);

    return { success: true, message: 'Email verified successfully' };
  }

  /**
   * Request a password reset email.
   */
  async forgotPassword(email: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent user enumeration
    if (!user) {
      return { success: true, message: 'If the email exists, a reset link has been sent' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.mailerService
      .sendPasswordResetEmail(user.email, resetUrl)
      .catch((err) => {
        this.logger.warn(
          `Password reset email could not be delivered to ${user.email}. URL: ${resetUrl}`,
          err instanceof Error ? err.message : String(err),
        );
      });

    await this.securityEventLog(user.id, 'PASSWORD_RESET_REQUESTED', {}, ctx);

    return { success: true, message: 'If the email exists, a reset link has been sent' };
  }

  /**
   * Reset password using the token from the email.
   */
  async resetPassword(token: string, newPassword: string, ctx: RequestContext) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new BadRequestException('Invalid reset token');
    }

    if (stored.usedAt) {
      throw new BadRequestException('Reset token has already been used');
    }

    if (stored.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      // Revoke all refresh tokens for security
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: stored.userId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: stored.userId,
          action: 'PASSWORD_RESET',
          entity: 'User',
          entityId: stored.userId,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      }),
    ]);

    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Logout — revoke the refresh token and expire the session.
   */
  async logout(refreshToken: string, ctx: RequestContext) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      return { success: true };
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { id: stored.sessionId ?? '', status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      }),
    ]);

    if (stored.userId) {
      await this.securityEventLog(stored.userId, 'LOGOUT', {}, ctx);
    }

    return { success: true };
  }

  /**
   * Get all active sessions for a user.
   */
  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  /**
   * Revoke a specific session.
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'REVOKED' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  /**
   * Revoke all sessions for a user.
   */
  async revokeAllSessions(userId: string) {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  /**
   * Change password for an authenticated user.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGED',
          entity: 'User',
          entityId: userId,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      }),
    ]);

    await this.securityEventLog(userId, 'PASSWORD_CHANGE', {}, ctx);

    return { success: true, message: 'Password changed successfully' };
  }

  /**
   * Get current user profile.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Validate email + password and enforce lockout / status rules.
   * Returns the user on success; throws on failure.
   */
  private async validateCredentials(email: string, password: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      await this.securityEventLog(null, 'LOGIN_FAILED', { reason: 'USER_NOT_FOUND' }, ctx);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }

    if (user.status === 'BLOCKED' || user.status === 'FROZEN') {
      throw new ForbiddenException('Account is blocked. Contact support.');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const maxAttempts = this.configService.get<number>('MAX_LOGIN_ATTEMPTS', 5);
      const lockDurationMs = this.configService.get<number>('LOGIN_LOCK_DURATION_MS', 15 * 60 * 1000);

      const updateData: Prisma.UserUpdateInput = {
        failedLoginAttempts: failedAttempts,
      };

      if (failedAttempts >= maxAttempts) {
        updateData.lockedUntil = new Date(Date.now() + lockDurationMs);
        updateData.failedLoginAttempts = 0;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      await this.securityEventLog(user.id, 'LOGIN_FAILED', { reason: 'INVALID_PASSWORD' }, ctx);

      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email address before logging in');
    }

    return user;
  }

  /**
   * Create a session, JWT access token, and refresh token for the user.
   * Used by both the legacy single-step login and the OTP-protected flow.
   */
  private async issueTokensForUser(
    user: {
      id: string;
      email: string;
      role: string;
      status: string;
      emailVerified: boolean;
    },
    ctx: RequestContext,
  ) {
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        deviceName: ctx.deviceName ?? 'Unknown Device',
        deviceType: ctx.deviceType,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        sessionId: session.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ctx.ip },
    });

    await this.securityEventLog(user.id, 'LOGIN_SUCCESS', {}, ctx);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
      },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async securityEventLog(
    userId: string | null,
    eventType: string,
    details: Record<string, unknown>,
    ctx: RequestContext,
  ) {
    try {
      await this.prisma.securityLog.create({
        data: {
          userId,
          eventType,
          details: details as Prisma.InputJsonValue,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write security log', error instanceof Error ? error.stack : String(error));
    }
  }
}
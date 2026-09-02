import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService, ChainType } from '../wallets/wallet.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { FeesService } from '../fees/fees.service';
import { OtpService } from '../otp/otp.service';
import { MailerService } from '../mailer/mailer.service';

interface TokenContractConfig {
  symbol: string;
  contractAddress: string | null;
  decimals: number;
  minWithdrawal: string;
}

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly blockchainService: BlockchainService,
    private readonly feesService: FeesService,
    private readonly otpService: OtpService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Step 1: Request a withdrawal.
   * Creates a pending request with a hash of the OTP and stores the idempotency key.
   */
  async requestWithdrawal(params: {
    userId: string;
    chain: ChainType;
    token: string;
    amount: string;
    address: string;
    ip?: string;
    userAgent?: string;
  }) {
    const { userId, chain, token, amount, address, ip, userAgent } = params;
    const tokenUpper = token.toUpperCase();

    // Validate address
    if (!this.blockchainService.isValidAddress(address)) {
      throw new BadRequestException('Invalid destination address');
    }

    // Validate token is supported
    const supportedTokens = ['ETH', 'USDT', 'USDC'];
    if (!supportedTokens.includes(tokenUpper)) {
      throw new BadRequestException('Token not supported for withdrawals');
    }

    // Get token config for minimums and decimals
    const tokenConfig = await this.prisma.tokenConfig.findFirst({
      where: { symbol: tokenUpper, enabled: true },
    });

    const minWithdrawal = tokenConfig?.minWithdrawal
      ? Number(tokenConfig.minWithdrawal)
      : this.getMinWithdrawal(chain, tokenUpper);

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    if (amountNum < minWithdrawal) {
      throw new BadRequestException(
        `Minimum withdrawal is ${minWithdrawal} ${tokenUpper}`,
      );
    }

    // Get user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException('Account is not active');
    }

    // Prevent sending to own wallet or exchange-internal address
    const existingAddress = await this.prisma.wallet.findUnique({
      where: { address },
    });
    if (existingAddress) {
      throw new BadRequestException('Cannot withdraw to an exchange wallet address');
    }

    // Check available balance
    const wallet = await this.walletService.getUserWallet(userId, chain);
    const balance = await this.prisma.balance.findUnique({
      where: {
        walletId_token: {
          walletId: wallet.id,
          token: tokenUpper,
        },
      },
    });

    if (!balance || Number(balance.available) < amountNum) {
      throw new BadRequestException('Insufficient available balance');
    }

    // Get fee
    const feeInfo = await this.feesService.getFee({
      type: 'WITHDRAWAL',
      chain,
      token: tokenUpper,
    });
    const feeAmount = this.feesService.calculateWithdrawalFee(amount, feeInfo.percentage);
    const netAmount = new Prisma.Decimal(amount).sub(feeAmount);

    // Idempotency / replay protection
    const idempotencyKey = this.blockchainService.buildIdempotencyKey(
      userId,
      chain,
      tokenUpper,
      amount,
      address,
    );
    const idempotencyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');

    const existingRequest = await this.prisma.withdrawalRequest.findFirst({
      where: { status: { in: ['PENDING', 'OTP_VERIFIED', 'COMPLETED'] } },
      orderBy: { createdAt: 'desc' },
    });

    // Check recent similar withdrawals for replay
    const recentWithdrawals = await this.prisma.withdrawal.findFirst({
      where: {
        userId,
        chain,
        token: tokenUpper,
        address: address.toLowerCase(),
        createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });

    if (recentWithdrawals) {
      const recentKey = this.blockchainService.buildIdempotencyKey(
        userId,
        chain,
        tokenUpper,
        recentWithdrawals.amount.toString(),
        recentWithdrawals.address,
      );
      if (crypto.createHash('sha256').update(recentKey).digest('hex') === idempotencyHash) {
        throw new BadRequestException('Duplicate withdrawal request detected. Please wait.');
      }
    }

    // Lock available balance
    const lockedAmount = new Prisma.Decimal(amount);

    await this.prisma.$transaction(async (tx) => {
      const lockedBalances = await tx.$queryRaw`
        SELECT id FROM "Balance" WHERE id = ${balance.id} FOR UPDATE
      `;

      const current = await tx.balance.findUnique({ where: { id: balance.id } });
      if (!current || Number(current.available) < amountNum) {
        throw new BadRequestException('Insufficient available balance');
      }

      await tx.balance.update({
        where: { id: balance.id },
        data: {
          available: current.available.sub(lockedAmount),
          locked: current.locked.add(lockedAmount),
          total: current.total,
        },
      });

      // Create wallet transaction record (PENDING)
      await tx.walletTransaction.create({
        data: {
          userId,
          walletId: wallet.id,
          chain,
          token: tokenUpper,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          amount: new Prisma.Decimal(amount),
          fee: feeAmount,
          netAmount,
          balanceAfter: current.available.sub(lockedAmount),
          description: `Withdrawal of ${amount} ${tokenUpper} on ${chain}`,
        },
      });
    });

    // Create withdrawal request with OTP hash
    const otpCode = this.generateOtpCode();
    const otpHash = this.hashOtp(otpCode);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const withdrawalRequest = await this.prisma.withdrawalRequest.create({
      data: {
        userId,
        chain,
        token: tokenUpper,
        amount: new Prisma.Decimal(amount),
        address: address.toLowerCase(),
        otpHash,
        otpExpiresAt,
        status: 'PENDING',
      },
    });

    // Send OTP email
    await this.mailerService.sendOtpEmail(
      user.email,
      otpCode,
      `Withdrawal of ${amount} ${tokenUpper} to ${address}`,
    );

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'WITHDRAWAL_REQUESTED',
        entity: 'WithdrawalRequest',
        entityId: withdrawalRequest.id,
        details: { chain, token: tokenUpper, amount, address, fee: feeAmount.toString() },
        ipAddress: ip,
        userAgent,
      },
    });

    this.logger.log(`Withdrawal requested by ${userId}: ${amount} ${tokenUpper} on ${chain}`);

    return {
      requestId: withdrawalRequest.id,
      status: 'PENDING',
      requiresOtp: true,
      fee: feeAmount.toString(),
      netAmount: netAmount.toString(),
      expiresAt: otpExpiresAt,
      message: 'OTP sent to your email',
    };
  }

  /**
   * Step 2: Verify the withdrawal OTP and execute.
   */
  async verifyAndExecuteWithdrawal(params: {
    userId: string;
    requestId: string;
    code: string;
    ip?: string;
    userAgent?: string;
  }) {
    const { userId, requestId, code, ip, userAgent } = params;

    // Fetch the withdrawal request
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.userId !== userId) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Withdrawal request is not pending');
    }

    if (request.otpExpiresAt < new Date()) {
      await this.prisma.withdrawalRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('OTP has expired. Please request a new withdrawal.');
    }

    // Check attempts
    if (request.otpAttempts >= request.maxAttempts) {
      await this.prisma.withdrawalRequest.update({
        where: { id: request.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Maximum OTP attempts exceeded. Please request a new withdrawal.');
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid OTP format');
    }

    // Increment attempts
    await this.prisma.withdrawalRequest.update({
      where: { id: request.id },
      data: { otpAttempts: { increment: 1 } },
    });

    // Verify OTP hash (constant-time)
    const providedHash = this.hashOtp(code);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(request.otpHash, 'hex'),
    );

    if (!isValid) {
      await this.prisma.securityLog.create({
        data: {
          userId,
          eventType: 'OTP_ATTEMPT',
          details: { requestId, success: false },
          ipAddress: ip,
          userAgent,
        },
      });
      throw new BadRequestException('Invalid OTP code');
    }

    // Mark request as OTP verified
    await this.prisma.withdrawalRequest.update({
      where: { id: request.id },
      data: { status: 'OTP_VERIFIED' },
    });

    // Execute the withdrawal in an atomic transaction
    return this.executeWithdrawal(userId, request.id, ip, userAgent);
  }

  /**
   * Execute the withdrawal: create on-chain transaction, update balances.
   */
  private async executeWithdrawal(
    userId: string,
    requestId: string,
    ip?: string,
    userAgent?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the request row
      await tx.$queryRaw`
        SELECT id FROM "WithdrawalRequest" WHERE id = ${requestId} FOR UPDATE
      `;

      const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
      if (!request || request.status !== 'OTP_VERIFIED') {
        throw new BadRequestException('Withdrawal request is not ready for execution');
      }

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== 'ACTIVE') {
        throw new BadRequestException('Account is not active');
      }

      // Get fee config
      const feeInfo = await this.feesService.getFee({
        type: 'WITHDRAWAL',
        chain: request.chain as ChainType,
        token: request.token,
      });
      const feeAmount = this.feesService.calculateWithdrawalFee(
        request.amount.toString(),
        feeInfo.percentage,
      );
      const netAmount = new Prisma.Decimal(request.amount).sub(feeAmount);

      // Get wallet and decrypt private key
      const wallet = await tx.wallet.findFirst({
        where: { userId, chain: request.chain, walletType: 'SPOT' },
      });
      if (!wallet) {
        throw new Error(`No SPOT wallet for user ${userId} on ${request.chain}`);
      }

      const privateKey = await this.walletService.getDecryptedPrivateKey(userId, request.chain as ChainType);

      // Get token contract config
      const tokenConfig = await this.getTokenContractConfig(request.chain as ChainType, request.token);

      // Get current balance
      const balance = await tx.balance.findUnique({
        where: {
          walletId_token: {
            walletId: wallet.id,
            token: request.token,
          },
        },
      });

      if (!balance || Number(balance.locked) < Number(request.amount)) {
        throw new BadRequestException('Insufficient locked balance');
      }

      // Get pending nonce for the sender address
      const nonce = await this.blockchainService.getPendingNonce(
        request.chain,
        wallet.address,
      );

      // Send the blockchain transaction
      let txHash: string;
      let txNonce: number;
      try {
        const result = await this.blockchainService.sendTransaction(
          request.chain,
          privateKey,
          request.address,
          netAmount.toString(),
          tokenConfig,
          nonce,
        );
        txHash = result.txHash;
        txNonce = result.nonce;
      } catch (error) {
        this.logger.error(
          `Blockchain transaction failed for withdrawal request ${requestId}`,
          error instanceof Error ? error.stack : String(error),
        );

        // Refund the locked balance
        const refundedBalance = await tx.balance.findUnique({
          where: {
            walletId_token: {
              walletId: wallet.id,
              token: request.token,
            },
          },
        });

        if (refundedBalance) {
          const refundedAvailable = refundedBalance.available.add(request.amount);
          const refundedLocked = refundedBalance.locked.sub(request.amount);
          await tx.balance.update({
            where: { id: refundedBalance.id },
            data: {
              available: refundedAvailable,
              locked: refundedLocked,
            },
          });
        }

        await tx.withdrawalRequest.update({
          where: { id: requestId },
          data: { status: 'FAILED' },
        });

        await tx.walletTransaction.create({
          data: {
            userId,
            walletId: wallet.id,
            chain: request.chain,
            token: request.token,
            type: 'WITHDRAWAL',
            status: 'FAILED',
            amount: request.amount,
            fee: new Prisma.Decimal(0),
            netAmount: request.amount,
            balanceAfter: refundedBalance?.available.add(request.amount) ?? new Prisma.Decimal(0),
            referenceId: requestId,
            description: `Failed withdrawal refund of ${request.amount.toString()} ${request.token}`,
          },
        });

        throw new BadRequestException('Blockchain transaction failed. Amount has been refunded.');
      }

      // Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          chain: request.chain,
          token: request.token,
          amount: request.amount,
          fee: feeAmount,
          netAmount,
          address: request.address,
          txHash,
          nonce: txNonce,
          status: 'PROCESSING',
        },
      });

      // Create blockchain transaction record
      await tx.blockchainTransaction.create({
        data: {
          withdrawalId: withdrawal.id,
          chain: request.chain,
          txHash,
          fromAddress: wallet.address,
          toAddress: request.address,
          amount: netAmount,
          token: request.token,
          nonce: txNonce,
          status: 'PENDING',
        },
      });

      // Update balances: subtract from locked
      const newLocked = balance.locked.sub(request.amount);
      await tx.balance.update({
        where: { id: balance.id },
        data: {
          locked: newLocked,
        },
      });

      // Update wallet transaction to PROCESSING
      const pendingTx = await tx.walletTransaction.findFirst({
        where: { userId, referenceId: requestId, type: 'WITHDRAWAL', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (pendingTx) {
        await tx.walletTransaction.update({
          where: { id: pendingTx.id },
          data: {
            status: 'PROCESSING',
            fee: feeAmount,
            netAmount,
          },
        });
      }

      // Update the withdrawal request
      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED' },
      });

      // Create notification
      await tx.notification.create({
        data: {
          userId,
          type: 'WITHDRAWAL',
          title: 'Withdrawal processing',
          message: `${request.amount.toString()} ${request.token} withdrawal to ${request.address} is being processed.`,
          channel: 'BOTH',
        },
      });

      // Security log
      await tx.securityLog.create({
        data: {
          userId,
          eventType: 'WITHDRAWAL_EXECUTED',
          details: {
            requestId,
            chain: request.chain,
            token: request.token,
            amount: request.amount.toString(),
            address: request.address,
            txHash,
          },
          ipAddress: ip,
          userAgent,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'WITHDRAWAL_EXECUTED',
          entity: 'Withdrawal',
          entityId: withdrawal.id,
          details: {
            chain: request.chain,
            token: request.token,
            amount: request.amount.toString(),
            fee: feeAmount.toString(),
            netAmount: netAmount.toString(),
            address: request.address,
            txHash,
          },
          ipAddress: ip,
          userAgent,
        },
      });

      this.logger.log(`Withdrawal executed: ${withdrawal.id} tx=${txHash}`);

      return {
        withdrawalId: withdrawal.id,
        status: 'PROCESSING',
        txHash,
        amount: request.amount.toString(),
        fee: feeAmount.toString(),
        netAmount: netAmount.toString(),
      };
    });
  }

  /**
   * Resend OTP for a pending withdrawal request.
   */
  async resendOtp(userId: string, requestId: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.userId !== userId) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Withdrawal request is not pending');
    }

    if (request.otpExpiresAt > new Date(Date.now() - 60 * 1000)) {
      const waitSec = Math.ceil(
        (request.otpExpiresAt.getTime() - 60 * 1000 - Date.now()) / 1000,
      );
      if (waitSec > 0) {
        throw new BadRequestException(`Please wait ${Math.max(waitSec, 1)} seconds before resending`);
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otpCode = this.generateOtpCode();
    const otpHash = this.hashOtp(otpCode);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.withdrawalRequest.update({
      where: { id: request.id },
      data: {
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
      },
    });

    await this.mailerService.sendOtpEmail(
      user.email,
      otpCode,
      `Withdrawal of ${request.amount.toString()} ${request.token} to ${request.address}`,
    );

    return { success: true, expiresAt: otpExpiresAt };
  }

  /**
   * Get user withdrawals with pagination.
   */
  async getUserWithdrawals(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.withdrawal.count({ where: { userId } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get user withdrawal requests (pending OTP).
   */
  async getUserWithdrawalRequests(userId: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: { userId, status: { in: ['PENDING', 'OTP_VERIFIED'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List all withdrawals (admin).
   */
  async listAllWithdrawals(params: {
    page: number;
    limit: number;
    userId?: string;
    chain?: string;
    token?: string;
    status?: string;
  }) {
    const { page, limit, userId, chain, token, status } = params;
    const where: Prisma.WithdrawalWhereInput = {};

    if (userId) where.userId = userId;
    if (chain) where.chain = chain;
    if (token) where.token = token;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where,
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.withdrawal.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Cancel a pending withdrawal request (before OTP verification).
   */
  async cancelWithdrawalRequest(userId: string, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({ where: { id: requestId } });
      if (!request || request.userId !== userId) {
        throw new NotFoundException('Withdrawal request not found');
      }

      if (request.status !== 'PENDING') {
        throw new BadRequestException('Only pending withdrawal requests can be cancelled');
      }

      // Refund the locked amount
      const wallet = await tx.wallet.findFirst({
        where: { userId, chain: request.chain, walletType: 'SPOT' },
      });

      if (wallet) {
        const balance = await tx.balance.findUnique({
          where: {
            walletId_token: {
              walletId: wallet.id,
              token: request.token,
            },
          },
        });

        if (balance) {
          const refundedAvailable = balance.available.add(request.amount);
          const refundedLocked = balance.locked.sub(request.amount);
          await tx.balance.update({
            where: { id: balance.id },
            data: {
              available: refundedAvailable,
              locked: refundedLocked,
            },
          });

          await tx.walletTransaction.create({
            data: {
              userId,
              walletId: wallet.id,
              chain: request.chain,
              token: request.token,
              type: 'WITHDRAWAL',
              status: 'CANCELLED',
              amount: request.amount,
              fee: new Prisma.Decimal(0),
              netAmount: request.amount,
              balanceAfter: refundedAvailable,
              referenceId: requestId,
              description: `Cancelled withdrawal refund of ${request.amount.toString()} ${request.token}`,
            },
          });
        }
      }

      await tx.withdrawalRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      });

      return { cancelled: true };
    });
  }

  /**
   * Get minimum withdrawal per chain/token.
   */
  private getMinWithdrawal(chain: ChainType, token: string): number {
    // ETH: 0.001, USDT/USDC: 10
    if (token === 'ETH') return 0.001;
    return 10;
  }

  /**
   * Get token contract config for a chain.
   */
  private async getTokenContractConfig(
    chain: ChainType,
    token: string,
  ): Promise<TokenContractConfig> {
    const tokenConfig = await this.prisma.tokenConfig.findFirst({
      where: { symbol: token, enabled: true },
    });

    const config: TokenContractConfig = {
      symbol: token,
      contractAddress: null,
      decimals: tokenConfig?.decimals ?? 18,
      minWithdrawal: tokenConfig?.minWithdrawal?.toString() ?? '0',
    };

    if (token !== 'ETH') {
      const contractAddress =
        chain === 'ETHEREUM'
          ? this.configService.get<string | null>(`TOKEN_${token}_ETHEREUM_CONTRACT`)
          : this.configService.get<string | null>(`TOKEN_${token}_BASE_CONTRACT`);

      if (!contractAddress) {
        throw new Error(`No contract address configured for ${token} on ${chain}`);
      }
      config.contractAddress = contractAddress;
    }

    return config;
  }

  private generateOtpCode(): string {
    const buffer = crypto.randomBytes(3);
    const num = buffer.readUIntBE(0, 3) % 1000000;
    return num.toString().padStart(6, '0');
  }

  private hashOtp(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
}
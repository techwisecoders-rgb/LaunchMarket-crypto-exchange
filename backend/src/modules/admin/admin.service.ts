import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BlockchainService } from '../blockchain/blockchain.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly blockchainService: BlockchainService,
  ) {}

  // ============================================================
  // Dashboard
  // ============================================================

  async getDashboard() {
    const [
      users,
      activeUsers,
      deposits,
      withdrawals,
      orders,
      trades,
      totalVolume,
      pendingWithdrawals,
      frozenUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.deposit.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.withdrawal.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.order.count(),
      this.prisma.trade.count(),
      this.prisma.trade.aggregate({
        _sum: { total: true },
      }),
      this.prisma.withdrawal.count({ where: { status: 'PROCESSING' } }),
      this.prisma.user.count({ where: { status: 'FROZEN' } }),
    ]);

    return {
      users,
      activeUsers,
      frozenUsers,
      deposits: { count: deposits._count, sum: deposits._sum.amount?.toString() ?? '0' },
      withdrawals: { count: withdrawals._count, sum: withdrawals._sum.amount?.toString() ?? '0' },
      orders,
      trades,
      totalVolume: totalVolume._sum.total?.toString() ?? '0',
      pendingWithdrawals,
      updatedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // User Management
  // ============================================================

  async listUsers(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    role?: string;
  }) {
    const { page, limit, search, status, role } = params;
    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (role) where.role = role;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          emailVerified: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: { wallets: true, sellOrders: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallets: {
          include: { balances: true },
        },
        sessions: { orderBy: { lastActiveAt: 'desc' }, take: 10 },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Expose wallet addresses but NEVER private keys
    const safeWallets = user.wallets.map((w) => ({
      id: w.id,
      chain: w.chain,
      walletType: w.walletType,
      address: w.address,
      status: w.status,
      hasPrivateKey: !!w.encryptedKey,
      balances: w.balances,
    }));

    return {
      ...user,
      wallets: safeWallets,
    };
  }

  async setUserStatus(userId: string, status: string, adminUserId: string, reason?: string) {
    const validStatuses = ['ACTIVE', 'FROZEN', 'BLOCKED', 'DISABLED', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'SUPER_ADMIN' && status !== 'ACTIVE') {
      throw new BadRequestException('Cannot modify a SUPER_ADMIN account');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    await this.auditService.log({
      userId: adminUserId,
      action: 'USER_STATUS_CHANGED',
      entity: 'User',
      entityId: userId,
      details: { from: user.status, to: status, reason },
    });

    this.logger.log(`Admin ${adminUserId} set user ${userId} status to ${status}`);
    return { userId, status: updated.status };
  }

  // ============================================================
  // Manual Credit / Debit
  // ============================================================

  async manualBalanceAdjustment(params: {
    adminUserId: string;
    userId: string;
    chain: string;
    token: string;
    type: 'CREDIT' | 'DEBIT';
    amount: string;
    reason: string;
  }) {
    const { adminUserId, userId, chain, token, type, amount, reason } = params;

    const amountDec = new Prisma.Decimal(amount);
    if (amountDec.lte(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    // Validate user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Find wallet
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, chain: chain.toUpperCase(), walletType: 'SPOT' },
    });
    if (!wallet) throw new BadRequestException('User has no wallet on this chain');

    // Execute adjustment atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.upsert({
        where: {
          walletId_token: {
            walletId: wallet.id,
            token: token.toUpperCase(),
          },
        },
        create: {
          walletId: wallet.id,
          userId,
          chain: chain.toUpperCase(),
          token: token.toUpperCase(),
          available: type === 'CREDIT' ? amountDec : new Prisma.Decimal(0),
          locked: new Prisma.Decimal(0),
          total: type === 'CREDIT' ? amountDec : new Prisma.Decimal(0),
        },
        update: {},
      });

      // Lock row to prevent race conditions
      await tx.$queryRaw`SELECT id FROM "Balance" WHERE id = ${balance.id} FOR UPDATE`;

      const current = await tx.balance.findUnique({ where: { id: balance.id } });
      if (!current) throw new NotFoundException('Balance not found');

      if (type === 'DEBIT' && current.available.lt(amountDec)) {
        throw new BadRequestException('Insufficient available balance for debit');
      }

      const delta = type === 'CREDIT' ? amountDec : amountDec.negated();
      const newAvailable = current.available.add(delta);
      const newTotal = current.total.add(delta);

      const updated = await tx.balance.update({
        where: { id: balance.id },
        data: {
          available: newAvailable,
          total: newTotal,
        },
      });

      // Wallet transaction record
      await tx.walletTransaction.create({
        data: {
          userId,
          walletId: wallet.id,
          chain: chain.toUpperCase(),
          token: token.toUpperCase(),
          type: type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
          status: 'COMPLETED',
          amount: amountDec,
          fee: new Prisma.Decimal(0),
          netAmount: amountDec,
          balanceAfter: newAvailable,
          referenceId: adminUserId,
          description: `Admin ${type.toLowerCase()} of ${amount} ${token.toUpperCase()} - ${reason}`,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: `MANUAL_${type}`,
          entity: 'Balance',
          entityId: balance.id,
          details: { chain, token, amount, reason, adminUserId },
        },
      });

      return updated;
    });

    this.logger.log(`Admin ${adminUserId} ${type.toLowerCase()} ${amount} ${token} to user ${userId}`);
    return { success: true, balance: result };
  }

  // ============================================================
  // List views
  // ============================================================

  async listDeposits(params: { page: number; limit: number; userId?: string; chain?: string; status?: string }) {
    const { page, limit, userId, chain, status } = params;
    const where: Prisma.DepositWhereInput = {};
    if (userId) where.userId = userId;
    if (chain) where.chain = chain;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where,
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.deposit.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listWithdrawals(params: { page: number; limit: number; userId?: string; chain?: string; status?: string }) {
    const { page, limit, userId, chain, status } = params;
    const where: Prisma.WithdrawalWhereInput = {};
    if (userId) where.userId = userId;
    if (chain) where.chain = chain;
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

  async listTrades(params: { page: number; limit: number; userId?: string; chain?: string; token?: string; status?: string }) {
    const { page, limit, userId, chain, token, status } = params;
    const where: Prisma.TradeWhereInput = {};
    if (userId) {
      where.OR = [{ sellerId: userId }, { buyerId: userId }];
    }
    if (chain) where.chain = chain;
    if (token) where.token = token;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        include: {
          seller: { select: { id: true, email: true } },
          buyer: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listWallets(params: { page: number; limit: number; chain?: string; userId?: string }) {
    const { page, limit, chain, userId } = params;
    const where: Prisma.WalletWhereInput = {};
    if (chain) where.chain = chain;
    if (userId) where.userId = userId;

    const [data, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        include: {
          balances: true,
          user: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.wallet.count({ where }),
    ]);

    // NEVER expose private keys in admin views
    const safeData = data.map(({ encryptedKey, ...rest }) => ({
      ...rest,
      hasPrivateKey: !!encryptedKey,
    }));

    return { data: safeData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ============================================================
  // Blockchain monitoring
  // ============================================================

  async getBlockchainStatus() {
    const statuses: Record<string, unknown> = {};

    for (const chain of ['ETHEREUM', 'BASE']) {
      try {
        const blockNumber = await this.blockchainService.getCurrentBlockNumber(chain);
        statuses[chain] = {
          status: 'UP',
          blockNumber,
          lastChecked: new Date().toISOString(),
        };
      } catch (error) {
        statuses[chain] = {
          status: 'DOWN',
          error: error instanceof Error ? error.message : 'Unknown error',
          lastChecked: new Date().toISOString(),
        };
      }
    }

    return statuses;
  }

  async listBlockchainTransactions(params: {
    page: number;
    limit: number;
    chain?: string;
    status?: string;
  }) {
    const { page, limit, chain, status } = params;
    const where: Prisma.BlockchainTransactionWhereInput = {};
    if (chain) where.chain = chain;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.blockchainTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.blockchainTransaction.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ============================================================
  // Analytics
  // ============================================================

  async getAnalytics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [newUsersToday, newUsersWeek, newUsersMonth, depositsToday, withdrawalsToday, tradesToday] =
      await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
        this.prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
        this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
        this.prisma.deposit.aggregate({
          where: { createdAt: { gte: todayStart } },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.withdrawal.aggregate({
          where: { createdAt: { gte: todayStart } },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.trade.aggregate({
          where: { createdAt: { gte: todayStart } },
          _sum: { total: true },
          _count: true,
        }),
      ]);

    return {
      userGrowth: {
        today: newUsersToday,
        week: newUsersWeek,
        month: newUsersMonth,
      },
      deposits: {
        todayCount: depositsToday._count,
        todayVolume: depositsToday._sum.amount?.toString() ?? '0',
      },
      withdrawals: {
        todayCount: withdrawalsToday._count,
        todayVolume: withdrawalsToday._sum.amount?.toString() ?? '0',
      },
      trades: {
        todayCount: tradesToday._count,
        todayVolume: tradesToday._sum.total?.toString() ?? '0',
      },
    };
  }
}
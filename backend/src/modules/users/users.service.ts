import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user profile with wallet summary.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        country: true,
        avatarUrl: true,
        role: true,
        status: true,
        emailVerified: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        updatedAt: true,
        wallets: {
          select: {
            id: true,
            chain: true,
            address: true,
            walletType: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user profile.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        country: dto.country,
        avatarUrl: dto.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        country: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Get user's dashboard overview.
   */
  async getOverview(userId: string) {
    const [wallets, balances, openOrders, recentTrades, recentDeposits, recentWithdrawals, notifications] =
      await Promise.all([
        this.prisma.wallet.findMany({
          where: { userId },
          include: { balances: true },
        }),
        this.prisma.balance.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.order.findMany({
          where: {
            OR: [
              { sellerId: userId },
              { buyerId: userId },
              { trades: { some: { buyerId: userId } } },
            ],
            AND: [
              { quantity: { gt: new Prisma.Decimal(0) } },
              { price: { gt: new Prisma.Decimal(0) } },
            ],
            status: { in: ['OPEN', 'PENDING', 'COUNTER_OFFERED'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.trade.findMany({
          where: { OR: [{ sellerId: userId }, { buyerId: userId }] },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.deposit.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.withdrawal.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.notification.findMany({
          where: { userId, read: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    // Compute total portfolio value in USDT (simplified: use available balances)
    const totalBalance = balances.reduce((sum, b) => {
      return sum + Number(b.available);
    }, 0);

    return {
      wallets,
      balances,
      openOrders,
      recentTrades,
      recentDeposits,
      recentWithdrawals,
      notifications,
      stats: {
        totalBalance: totalBalance,
        openOrdersCount: openOrders.length,
        unreadNotifications: notifications.length,
      },
    };
  }

  /**
   * Get user's transaction history.
   */
  async getTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where: { userId } }),
    ]);

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's order history.
   */
  async getOrderHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const userOrderFilter: Prisma.OrderWhereInput = {
      OR: [
        { sellerId: userId },
        { buyerId: userId },
        { trades: { some: { buyerId: userId } } },
      ],
      AND: [
        { quantity: { gt: new Prisma.Decimal(0) } },
        { price: { gt: new Prisma.Decimal(0) } },
      ],
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: userOrderFilter,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          counterOffers: true,
          trades: true,
        },
      }),
      this.prisma.order.count({ where: userOrderFilter }),
    ]);

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's trade history.
   */
  async getTradeHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [trades, total] = await Promise.all([
      this.prisma.trade.findMany({
        where: { OR: [{ sellerId: userId }, { buyerId: userId }] },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: true,
        },
      }),
      this.prisma.trade.count({
        where: { OR: [{ sellerId: userId }, { buyerId: userId }] },
      }),
    ]);

    return {
      data: trades,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's notifications.
   */
  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark a notification as read.
   */
  async markNotificationRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
  }

  /**
   * Mark all notifications as read.
   */
  async markAllNotificationsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }
}
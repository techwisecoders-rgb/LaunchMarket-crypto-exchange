import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the current user's trade history (as buyer or seller).
   */
  async getUserTrades(userId: string, page = 1, limit = 20) {
    const where: Prisma.TradeWhereInput = {
      OR: [{ sellerId: userId }, { buyerId: userId }],
    };

    const [data, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              token: true,
              chain: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trade.count({ where }),
    ]);

    return {
      data: data.map((trade) => ({
        ...trade,
        side: trade.sellerId === userId ? 'SELL' : 'BUY',
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List all trades (admin).
   */
  async listAllTrades(params: {
    page: number;
    limit: number;
    userId?: string;
    chain?: string;
    token?: string;
  }) {
    const { page, limit, userId, chain, token } = params;
    const where: Prisma.TradeWhereInput = {};

    if (userId) {
      where.OR = [{ sellerId: userId }, { buyerId: userId }];
    }
    if (chain) where.chain = chain;
    if (token) where.token = token;

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

  /**
   * Get recent public trades (for market display).
   */
  async getRecentTrades(token?: string, chain?: string, limit = 50) {
    const where: Prisma.TradeWhereInput = { status: 'EXECUTED' };
    if (token) where.token = token.toUpperCase();
    if (chain) where.chain = chain;

    return this.prisma.trade.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        chain: true,
        token: true,
        quantity: true,
        price: true,
        total: true,
        createdAt: true,
      },
    });
  }
}
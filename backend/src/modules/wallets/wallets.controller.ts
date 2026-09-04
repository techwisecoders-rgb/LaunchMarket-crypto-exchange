import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user wallets' })
  async getMyWallets(@CurrentUser('sub') userId: string) {
    const wallets = await this.walletService.getUserWallets(userId);
    return wallets.map((w) => ({
      id: w.id,
      chain: w.chain,
      address: w.address,
      walletType: w.walletType,
      status: w.status,
      createdAt: w.createdAt,
    }));
  }

  /**
   * Aggregated balances for the current user, grouped by token symbol.
   *
   * IMPORTANT: This route MUST be declared BEFORE `me/:chain`, otherwise
   * NestJS / Express matches `me/balances` against the parameterized route
   * first and treats "balances" as the chain name. That triggers a Prisma
   * query with `chain: 'BALANCES'` which fails with PRISMA_VALIDATION_ERROR
   * ("Invalid data provided"), surfacing as a 400 to the frontend.
   *
   * Shape (matches the frontend's `walletsApi.getBalances()`):
   *   {
   *     ETH: { onchainBalance: '5', internalBalance: '5', available: '5', chain: 'ETHEREUM' },
   *     USDT: { onchainBalance: '10000', internalBalance: '10000', available: '10000', chain: 'ETHEREUM' },
   *     ...
   *   }
   */
  @Get('me/balances')
  @ApiOperation({ summary: 'Get current user balances, grouped by token' })
  async getMyBalances(@CurrentUser('sub') userId: string) {
    const balances = await this.prisma.balance.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    const grouped: Record<
      string,
      {
        token: string;
        chain: string;
        onchainBalance: string;
        internalBalance: string;
        available: string;
        locked: string;
        total: string;
      }
    > = {};

    for (const b of balances) {
      const available = new Prisma.Decimal(b.available);
      const locked = new Prisma.Decimal(b.locked);
      const total = new Prisma.Decimal(b.total);

      const key = b.token;
      if (!grouped[key]) {
        grouped[key] = {
          token: b.token,
          chain: b.chain,
          onchainBalance: '0',
          internalBalance: '0',
          available: '0',
          locked: '0',
          total: '0',
        };
      }

      const g = grouped[key];
      g.onchainBalance = new Prisma.Decimal(g.onchainBalance).add(total).toString();
      g.internalBalance = new Prisma.Decimal(g.internalBalance).add(available).toString();
      g.available = new Prisma.Decimal(g.available).add(available).toString();
      g.locked = new Prisma.Decimal(g.locked).add(locked).toString();
      g.total = new Prisma.Decimal(g.total).add(total).toString();
    }

    return grouped;
  }

  @Get('me/:chain')
  @ApiOperation({ summary: 'Get current user wallet for a chain' })
  async getMyWallet(@CurrentUser('sub') userId: string, @Query('chain') chain: string) {
    const wallet = await this.walletService.getUserWallet(userId, chain as 'ETHEREUM' | 'BASE');
    return {
      id: wallet.id,
      chain: wallet.chain,
      address: wallet.address,
      walletType: wallet.walletType,
      status: wallet.status,
      createdAt: wallet.createdAt,
    };
  }

  @Get('admin')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List all wallets (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'chain', required: false, type: String })
  @ApiQuery({ name: 'address', required: false, type: String })
  async listAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('userId') userId?: string,
    @Query('chain') chain?: string,
    @Query('address') address?: string,
  ) {
    return this.walletService.listAllWallets({
      page: Number(page),
      limit: Number(limit),
      userId,
      chain,
      address,
    });
  }
}
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Token Configuration (supports adding SIDRA token later)
  // ============================================================

  async listTokens() {
    return this.prisma.tokenConfig.findMany({
      orderBy: { symbol: 'asc' },
    });
  }

  async getToken(symbol: string) {
    const token = await this.prisma.tokenConfig.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!token) throw new NotFoundException('Token not found');
    return token;
  }

  async upsertToken(params: {
    symbol: string;
    name: string;
    decimals: number;
    chains: string[];
    contractAddress?: string;
    minDeposit?: string;
    minWithdrawal?: string;
    withdrawalFeePercentage?: string;
    isNative?: boolean;
    enabled?: boolean;
    icon?: string;
    updatedBy: string;
  }) {
    const {
      symbol,
      name,
      decimals,
      chains,
      contractAddress,
      minDeposit,
      minWithdrawal,
      withdrawalFeePercentage = '1',
      isNative = false,
      enabled = true,
      icon,
      updatedBy,
    } = params;

    return this.prisma.tokenConfig.upsert({
      where: { symbol: symbol.toUpperCase() },
      create: {
        symbol: symbol.toUpperCase(),
        name,
        decimals,
        chains,
        contractAddress,
        minDeposit: minDeposit ? new Prisma.Decimal(minDeposit) : null,
        minWithdrawal: minWithdrawal ? new Prisma.Decimal(minWithdrawal) : null,
        withdrawalFeePercentage: new Prisma.Decimal(withdrawalFeePercentage),
        isNative,
        enabled,
        icon,
      },
      update: {
        name,
        decimals,
        chains,
        contractAddress,
        minDeposit: minDeposit ? new Prisma.Decimal(minDeposit) : null,
        minWithdrawal: minWithdrawal ? new Prisma.Decimal(minWithdrawal) : null,
        withdrawalFeePercentage: new Prisma.Decimal(withdrawalFeePercentage),
        isNative,
        enabled,
        icon,
      },
    });
  }

  async setTokenStatus(symbol: string, enabled: boolean, updatedBy: string) {
    return this.prisma.tokenConfig.update({
      where: { symbol: symbol.toUpperCase() },
      data: { enabled },
    });
  }

  // ============================================================
  // Chain Configuration
  // ============================================================

  async listChains() {
    return this.prisma.chainConfig.findMany({
      orderBy: { chain: 'asc' },
    });
  }

  async upsertChain(params: {
    chain: string;
    name: string;
    rpcUrl: string;
    chainId: number;
    blockConfirmations: number;
    pollingIntervalMs: number;
    explorerUrl: string;
    enabled?: boolean;
  }) {
    const { chain, name, rpcUrl, chainId, blockConfirmations, pollingIntervalMs, explorerUrl, enabled = true } = params;

    return this.prisma.chainConfig.upsert({
      where: { chain: chain.toUpperCase() },
      create: {
        chain: chain.toUpperCase(),
        name,
        rpcUrl,
        chainId,
        blockConfirmations,
        pollingIntervalMs,
        explorerUrl,
        enabled,
      },
      update: {
        name,
        rpcUrl,
        chainId,
        blockConfirmations,
        pollingIntervalMs,
        explorerUrl,
        enabled,
      },
    });
  }

  async setChainStatus(chain: string, enabled: boolean) {
    return this.prisma.chainConfig.update({
      where: { chain: chain.toUpperCase() },
      data: { enabled },
    });
  }

  // ============================================================
  // Trading Pairs
  // ============================================================

  async listTradingPairs(enabledOnly = false) {
    return this.prisma.tradingPair.findMany({
      where: enabledOnly ? { enabled: true } : undefined,
      orderBy: [{ chain: 'asc' }, { symbol: 'asc' }],
    });
  }

  async upsertTradingPair(params: {
    baseToken: string;
    quoteToken: string;
    chain: string;
    symbol: string;
    enabled?: boolean;
    minOrderSize: string;
    maxOrderSize: string;
    priceDecimals?: number;
    quantityDecimals?: number;
    makerFee?: string;
    takerFee?: string;
    updatedBy: string;
  }) {
    const {
      baseToken,
      quoteToken,
      chain,
      symbol,
      enabled = true,
      minOrderSize,
      maxOrderSize,
      priceDecimals = 6,
      quantityDecimals = 6,
      makerFee = '0',
      takerFee = '0',
      updatedBy,
    } = params;

    return this.prisma.tradingPair.upsert({
      where: { symbol },
      create: {
        baseToken,
        quoteToken,
        chain,
        symbol,
        enabled,
        minOrderSize: new Prisma.Decimal(minOrderSize),
        maxOrderSize: new Prisma.Decimal(maxOrderSize),
        priceDecimals,
        quantityDecimals,
        makerFee: new Prisma.Decimal(makerFee),
        takerFee: new Prisma.Decimal(takerFee),
      },
      update: {
        baseToken,
        quoteToken,
        chain,
        enabled,
        minOrderSize: new Prisma.Decimal(minOrderSize),
        maxOrderSize: new Prisma.Decimal(maxOrderSize),
        priceDecimals,
        quantityDecimals,
        makerFee: new Prisma.Decimal(makerFee),
        takerFee: new Prisma.Decimal(takerFee),
      },
    });
  }

  async setTradingPairStatus(symbol: string, enabled: boolean) {
    return this.prisma.tradingPair.update({
      where: { symbol },
      data: { enabled },
    });
  }

  // ============================================================
  // System Settings
  // ============================================================

  async getSystemSettings(publicOnly = false) {
    const settings = await this.prisma.setting.findMany({
      where: publicOnly ? { isPublic: true } : undefined,
      orderBy: { category: 'asc' },
    });

    // Reduce to key-value map for public settings
    if (publicOnly) {
      return settings.reduce<Record<string, string>>((acc, s) => {
        acc[s.key] = s.value;
        return acc;
      }, {});
    }

    return settings;
  }

  async setSetting(params: {
    key: string;
    value: string;
    category: string;
    isPublic?: boolean;
    updatedBy: string;
  }) {
    const { key, value, category, isPublic = false, updatedBy } = params;

    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value, category, isPublic, updatedBy },
      update: { value, category, isPublic, updatedBy },
    });
  }

  async deleteSetting(key: string) {
    await this.prisma.setting.delete({ where: { key } });
    return { deleted: true };
  }
}
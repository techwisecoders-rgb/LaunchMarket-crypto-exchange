import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface FeeLookup {
  type: 'WITHDRAWAL' | 'TRADING' | 'DEPOSIT';
  chain: string;
  token: string;
}

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the active fee for a specific type/chain/token.
   * Falls back to a default of 1% for withdrawals.
   */
  async getFee(lookup: FeeLookup): Promise<{
    type: string;
    chain: string;
    token: string;
    percentage: string;
  }> {
    const fee = await this.prisma.fee.findFirst({
      where: {
        type: lookup.type,
        chain: lookup.chain,
        token: lookup.token,
        status: 'ACTIVE',
      },
    });

    if (!fee) {
      // Default fallback: 1% withdrawal fee
      const defaultPercentage =
        lookup.type === 'WITHDRAWAL' ? '1' : lookup.type === 'TRADING' ? '0.1' : '0';
      return {
        type: lookup.type,
        chain: lookup.chain,
        token: lookup.token,
        percentage: defaultPercentage,
      };
    }

    return {
      type: fee.type,
      chain: fee.chain,
      token: fee.token,
      percentage: fee.percentage.toString(),
    };
  }

  /**
   * Create or update a fee configuration.
   */
  async upsertFee(params: {
    type: 'WITHDRAWAL' | 'TRADING' | 'DEPOSIT';
    chain: string;
    token: string;
    percentage: string;
    fixedAmount?: string;
    minAmount?: string;
    maxAmount?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    updatedBy: string;
  }) {
    const {
      type,
      chain,
      token,
      percentage,
      fixedAmount,
      minAmount,
      maxAmount,
      status = 'ACTIVE',
      updatedBy,
    } = params;

    const percentageDec = new Prisma.Decimal(percentage);
    if (percentageDec.isNegative()) {
      throw new Error('Fee percentage cannot be negative');
    }

    const fee = await this.prisma.fee.upsert({
      where: {
        type_chain_token: {
          type,
          chain,
          token,
        },
      },
      create: {
        type,
        chain,
        token,
        percentage: percentageDec,
        fixedAmount: fixedAmount ? new Prisma.Decimal(fixedAmount) : null,
        minAmount: minAmount ? new Prisma.Decimal(minAmount) : null,
        maxAmount: maxAmount ? new Prisma.Decimal(maxAmount) : null,
        status,
        updatedBy,
      },
      update: {
        percentage: percentageDec,
        fixedAmount: fixedAmount ? new Prisma.Decimal(fixedAmount) : undefined,
        minAmount: minAmount ? new Prisma.Decimal(minAmount) : undefined,
        maxAmount: maxAmount ? new Prisma.Decimal(maxAmount) : undefined,
        status,
        updatedBy,
      },
    });

    this.logger.log(`Fee upserted: ${type} ${chain} ${token} = ${percentage}%`);
    return fee;
  }

  /**
   * List all fees.
   */
  async listFees() {
    return this.prisma.fee.findMany({
      orderBy: [{ type: 'asc' }, { chain: 'asc' }, { token: 'asc' }],
    });
  }

  /**
   * Delete a fee config (revert to default).
   */
  async deleteFee(type: string, chain: string, token: string) {
    const fee = await this.prisma.fee.findUnique({
      where: { type_chain_token: { type: type as 'WITHDRAWAL', chain, token } },
    });

    if (!fee) {
      throw new NotFoundException('Fee not found');
    }

    await this.prisma.fee.delete({ where: { id: fee.id } });
    return { deleted: true };
  }

  /**
   * Calculate the fee amount for a withdrawal.
   */
  calculateWithdrawalFee(amount: string, percentage: string): Prisma.Decimal {
    const amountDec = new Prisma.Decimal(amount);
    const percentageDec = new Prisma.Decimal(percentage);
    // fee = amount * percentage / 100
    return amountDec.mul(percentageDec).div(100);
  }
}
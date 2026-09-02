import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wallet as EthersWallet } from 'ethers';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';

export type ChainType = 'ETHEREUM' | 'BASE';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generates and stores wallets for all configured chains for a user.
   * Private keys are encrypted with AES-256-GCM before storage.
   */
  async createUserWallets(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const chains = this.getSupportedChains();
    const client = (tx ?? this.prisma) as PrismaService;

    for (const chain of chains) {
      const wallet = EthersWallet.createRandom();
      const encryptedKey = this.encryptionService.encrypt(wallet.privateKey);

      await client.wallet.upsert({
        where: {
          userId_chain_walletType: {
            userId,
            chain,
            walletType: 'SPOT',
          },
        },
        create: {
          userId,
          chain,
          address: wallet.address,
          encryptedKey,
          walletType: 'SPOT',
        },
        update: {},
      });

      this.logger.log(
        `Wallet created for user ${userId} on chain ${chain}: ${wallet.address}`,
      );
    }
  }

  /**
   * Returns a user's wallet for a specific chain.
   */
  async getUserWallet(userId: string, chain: ChainType) {
    const wallet = await this.prisma.wallet.findUnique({
      where: {
        userId_chain_walletType: {
          userId,
          chain,
          walletType: 'SPOT',
        },
      },
    });

    if (!wallet) {
      throw new BadRequestException(`No wallet found for chain ${chain}`);
    }

    return wallet;
  }

  /**
   * Returns a user's wallet address for a specific chain without the private key.
   */
  async getUserWalletAddress(userId: string, chain: ChainType): Promise<string> {
    const wallet = await this.getUserWallet(userId, chain);
    return wallet.address;
  }

  /**
   * Returns decrypted private key for signing transactions.
   */
  async getDecryptedPrivateKey(userId: string, chain: ChainType): Promise<string> {
    const wallet = await this.getUserWallet(userId, chain);
    return this.encryptionService.decrypt(wallet.encryptedKey);
  }

  /**
   * Returns all wallets for a user.
   */
  async getUserWallets(userId: string) {
    return this.prisma.wallet.findMany({
      where: { userId },
      orderBy: { chain: 'asc' },
    });
  }

  /**
   * Lists all wallets (admin).
   */
  async listAllWallets(params: {
    page: number;
    limit: number;
    userId?: string;
    chain?: string;
    address?: string;
  }) {
    const { page, limit, userId, chain, address } = params;
    const where: Prisma.WalletWhereInput = {};

    if (userId) where.userId = userId;
    if (chain) where.chain = chain;
    if (address) where.address = { contains: address, mode: 'insensitive' };

    const [total, data] = await Promise.all([
      this.prisma.wallet.count({ where }),
      this.prisma.wallet.findMany({
        where,
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, data };
  }

  /**
   * Gets the list of supported chains from config.
   * Architecturally extensible — new chains can be added via config.
   */
  private getSupportedChains(): ChainType[] {
    const configured = this.configService
      .get<string>('SUPPORTED_CHAINS', 'ETHEREUM,BASE')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    return configured.filter(
      (c): c is ChainType => c === 'ETHEREUM' || c === 'BASE',
    );
  }
}
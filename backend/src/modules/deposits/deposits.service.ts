import { Injectable, Logger, OnModuleDestroy, OnModuleInit, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { WalletService, ChainType } from '../wallets/wallet.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface TokenScanConfig {
  symbol: string;
  contractAddress: string | null;
  decimals: number;
  minDeposit: string;
}

@Injectable()
export class DepositsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositsService.name);
  private pollingState: Map<string, { currentBlock: number; interval: NodeJS.Timeout }>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainService: BlockchainService,
    private readonly walletService: WalletService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly configService: ConfigService,
  ) {
    this.pollingState = new Map();
  }

  async onModuleInit() {
    await this.startAllPollers();
  }

  async onModuleDestroy() {
    for (const state of this.pollingState.values()) {
      clearInterval(state.interval);
    }
    this.pollingState.clear();
  }

  /**
   * Start pollers for all enabled chains.
   *
   * Testnet guard: only chains with a known testnet chainId (Sepolia
   * `11155111` or Base Sepolia `84532`) are polled. Any other chainId —
   * especially mainnet (`1`, `8453`) — is skipped with a loud error so
   * we never scan or credit real-money deposits.
   */
  private async startAllPollers() {
    const TESTNET_CHAIN_IDS = new Set<number>([11155111, 84532]);
    const chains = await this.prisma.chainConfig.findMany({ where: { enabled: true } });

    for (const chain of chains) {
      if (!TESTNET_CHAIN_IDS.has(chain.chainId)) {
        this.logger.error(
          `[TESTNET-GUARD] Skipping deposit poller for ${chain.chain} — chainId ${chain.chainId} is not a recognised TESTNET chain (expected 11155111 or 84532).`,
        );
        continue;
      }
      this.startPoller(chain.chain as ChainType);
    }
  }

  /**
   * Start a polling loop for a specific chain.
   */
  private startPoller(chain: ChainType) {
    if (this.pollingState.has(chain)) return;

    const pollingIntervalMs = this.configService.get<number>(
      'DEPOSIT_POLLING_INTERVAL_MS',
      parseInt(this.configService.get<string>('DEPOSIT_POLLING_INTERVAL_MS', '30000')),
    );

    const state = {
      currentBlock: 0,
      interval: setInterval(async () => {
        try {
          await this.pollChain(chain);
        } catch (error) {
          this.logger.error(
            `Deposit poller error on ${chain}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }, pollingIntervalMs),
    };

    this.pollingState.set(chain, state);
    this.logger.log(`Deposit poller started for ${chain} (every ${pollingIntervalMs}ms)`);

    // Run immediately
    this.pollChain(chain).catch((error) =>
      this.logger.error(`Initial deposit poll for ${chain} failed`, error instanceof Error ? error.stack : String(error)),
    );
  }

  /**
   * Poll a chain for new deposits to all tracked wallet addresses.
   */
  private async pollChain(chain: ChainType) {
    const chainConfig = await this.prisma.chainConfig.findUnique({ where: { chain } });
    if (!chainConfig || !chainConfig.enabled) return;

    const currentBlock = await this.blockchainService.getCurrentBlockNumber(chain);
    const state = this.pollingState.get(chain);

    let fromBlock = state?.currentBlock ?? chainConfig.lastPolledBlock ?? currentBlock;

    // Guard: never scan ahead of current block
    fromBlock = Math.min(fromBlock, currentBlock);
    // Guard: cap the range to avoid massive scans
    const maxScanRange = 5000;
    if (currentBlock - fromBlock > maxScanRange) {
      fromBlock = currentBlock - maxScanRange;
    }

    if (fromBlock >= currentBlock) {
      // Nothing new
      if (chainConfig.lastPolledBlock !== currentBlock) {
        await this.prisma.chainConfig.update({
          where: { chain },
          data: { lastPolledBlock: currentBlock },
        });
      }
      return;
    }

    const toBlock = currentBlock;
    this.logger.log(`Scanning ${chain} blocks ${fromBlock}-${toBlock}`);

    // Build token scan configs
    const tokenConfigs = await this.getTokenScanConfigs(chain);

    // Get all active deposit addresses
    const depositAddresses = await this.prisma.depositAddress.findMany({
      where: { chain },
      include: { user: { select: { id: true, email: true, status: true } } },
    });

    // Also include wallet addresses (SPOT wallets are the deposit targets)
    const activeWallets = await this.prisma.wallet.findMany({
      where: { chain, status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true, status: true } } },
    });

    // Combine unique addresses with user mapping
    const addressUserMap = new Map<string, { userId: string; userEmail: string; userStatus: string }>();
    const addressWalletMap = new Map<string, string>();

    for (const addr of depositAddresses) {
      addressUserMap.set(addr.address.toLowerCase(), {
        userId: addr.userId,
        userEmail: addr.user.email,
        userStatus: addr.user.status,
      });
    }

    for (const wallet of activeWallets) {
      const key = wallet.address.toLowerCase();
      if (!addressUserMap.has(key)) {
        addressUserMap.set(key, {
          userId: wallet.userId,
          userEmail: wallet.user.email,
          userStatus: wallet.user.status,
        });
      }
      addressWalletMap.set(key, wallet.id);
    }

    // Scan each address (bounded concurrency to respect RPC rate limits)
    const addresses = Array.from(addressUserMap.keys());
    const batchSize = 10;
    const results: {
      txHash: string;
      fromAddress: string;
      toAddress: string;
      amount: string;
      token: string;
      blockNumber: number;
      user: { userId: string; userEmail: string; userStatus: string };
      walletId: string | undefined;
    }[] = [];

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (address) => {
          const scanned = await this.blockchainService.scanBlockRangeForAddress(
            chain,
            address,
            fromBlock,
            toBlock,
            tokenConfigs,
          );

          const user = addressUserMap.get(address)!;
          const walletId = addressWalletMap.get(address);

          return scanned.map((r) => ({ ...r, user, walletId }));
        }),
      );

      results.push(...batchResults.flat());

      // Small delay between batches to respect RPC rate limits
      if (i + batchSize < addresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Process detected deposits
    for (const result of results) {
      await this.processDetectedDeposit({
        txHash: result.txHash,
        chain,
        token: result.token,
        amount: result.amount,
        fromAddress: result.fromAddress,
        toAddress: result.toAddress,
        blockNumber: result.blockNumber,
        userId: result.user.userId,
        userEmail: result.user.userEmail,
        userStatus: result.user.userStatus,
        walletId: result.walletId,
      });
    }

    // Update last polled block
    await this.prisma.chainConfig.update({
      where: { chain },
      data: { lastPolledBlock: toBlock },
    });

    if (state) state.currentBlock = toBlock;
  }

  /**
   * Build the list of token configs for scanning a chain.
   * Config-driven — new tokens (e.g. SIDRA) can be added via TokenConfig table.
   */
  private async getTokenScanConfigs(chain: ChainType): Promise<TokenScanConfig[]> {
    const tokenConfigs = await this.prisma.tokenConfig.findMany({
      where: { enabled: true },
    });

    const configs: TokenScanConfig[] = [];

    for (const token of tokenConfigs) {
      // Check if token is active on this chain via chains array
      const tokenChains: string[] = (token.chains as string[]) ?? [];
      if (!tokenChains.includes(chain)) {
        // Fallback: if chains empty, assume all chains
        if (tokenChains.length > 0) continue;
      }

      const contractAddress =
        chain === 'ETHEREUM'
          ? this.configService.get<string | null>(`TOKEN_${token.symbol}_ETHEREUM_CONTRACT`)
          : this.configService.get<string | null>(`TOKEN_${token.symbol}_BASE_CONTRACT`);

      configs.push({
        symbol: token.symbol,
        contractAddress: token.isNative ? null : (contractAddress ?? null),
        decimals: token.decimals,
        minDeposit: token.minDeposit?.toString() ?? '0',
      });
    }

    return configs;
  }

  /**
   * Process a detected deposit: deduplicate, validate minimum, update balance.
   */
  private async processDetectedDeposit(params: {
    txHash: string;
    chain: ChainType;
    token: string;
    amount: string;
    fromAddress: string;
    toAddress: string;
    blockNumber: number;
    userId: string;
    userEmail: string;
    userStatus: string;
    walletId?: string;
  }) {
    const {
      txHash,
      chain,
      token,
      amount,
      fromAddress,
      toAddress,
      blockNumber,
      userId,
      userEmail,
      userStatus,
      walletId,
    } = params;

    // Deduplicate by txHash (unique constraint on Deposit.txHash)
    const existing = await this.prisma.deposit.findUnique({
      where: { txHash },
    });

    if (existing) {
      // Update confirmations
      const confirmations = await this.blockchainService.getTransactionConfirmations(chain, txHash);
      if (confirmations > existing.confirmations) {
        await this.prisma.deposit.update({
          where: { id: existing.id },
          data: { confirmations },
        });

        // If it crossed the threshold, complete it
        const chainConfig = await this.prisma.chainConfig.findUnique({ where: { chain } });
        const required = chainConfig?.blockConfirmations ?? 3;
        if (existing.status === 'PENDING' && confirmations >= required) {
          await this.completeDeposit(existing.id, userId, chain, token, amount, walletId);
        }
      }
      return;
    }

    // Check minimum deposit
    const tokenConfig = await this.prisma.tokenConfig.findFirst({
      where: { symbol: token, enabled: true },
    });

    if (tokenConfig?.minDeposit) {
      const minDeposit = Number(tokenConfig.minDeposit);
      const amountNum = Number(amount);
      if (amountNum < minDeposit) {
        this.logger.log(`Deposit below minimum ignored: ${txHash} amount=${amount} min=${minDeposit}`);
        await this.prisma.deposit.create({
          data: {
            userId,
            chain,
            token,
            amount: new Prisma.Decimal(amount),
            txHash,
            fromAddress,
            toAddress,
            blockNumber,
            status: 'IGNORED_BELOW_MIN',
          },
        });
        return;
      }
    }

    // Check user status
    if (userStatus !== 'ACTIVE') {
      this.logger.warn(`Deposit from inactive user ${userId} recorded but not credited`);
      await this.prisma.deposit.create({
        data: {
          userId,
          chain,
          token,
          amount: new Prisma.Decimal(amount),
          txHash,
          fromAddress,
          toAddress,
          blockNumber,
          status: 'PENDING',
        },
      });
      return;
    }

    // Create deposit record
    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        chain,
        token,
        amount: new Prisma.Decimal(amount),
        txHash,
        fromAddress,
        toAddress,
        blockNumber,
        status: 'PENDING',
        confirmations: 0,
      },
    });

    this.logger.log(`Deposit detected: ${txHash} ${amount} ${token} on ${chain} for user ${userId}`);

    // Real-time: notify the user as soon as we see the deposit (status will
    // be PENDING until enough confirmations land). This makes the
    // /deposit page update instantly when the poller picks up a new tx.
    this.realtimeGateway.emitToUser(userId, 'deposit:received', {
      userId,
      chain,
      token,
      amount,
      depositId: deposit.id,
      txHash,
      status: 'PENDING',
      at: new Date().toISOString(),
    });

    // Check confirmations immediately
    const confirmations = await this.blockchainService.getTransactionConfirmations(chain, txHash);
    const chainConfig = await this.prisma.chainConfig.findUnique({ where: { chain } });
    const required = chainConfig?.blockConfirmations ?? 3;

    if (confirmations >= required) {
      await this.completeDeposit(deposit.id, userId, chain, token, amount, walletId);
    } else {
      await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: { confirmations },
      });
    }
  }

  /**
   * Complete a deposit: credit balance, create transaction, send notification.
   */
  private async completeDeposit(
    depositId: string,
    userId: string,
    chain: ChainType,
    token: string,
    amount: string,
    walletId?: string,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock the deposit row
        const deposit = await tx.$queryRaw`
          SELECT id FROM "Deposit" WHERE id = ${depositId} FOR UPDATE
        `;

        const current = await tx.deposit.findUnique({ where: { id: depositId } });
        if (!current || current.status !== 'PENDING') return;

        // Resolve wallet ID if not provided
        let targetWalletId = walletId;
        if (!targetWalletId) {
          const wallet = await tx.wallet.findFirst({
            where: { userId, chain, walletType: 'SPOT' },
          });
          if (!wallet) {
            throw new Error(`No SPOT wallet for user ${userId} on ${chain}`);
          }
          targetWalletId = wallet.id;
        }

        // Lock the balance row
        const balances = await tx.$queryRaw`
          SELECT id FROM "Balance" WHERE "walletId" = ${targetWalletId} AND token = ${token} FOR UPDATE
        `;

        let balance = await tx.balance.findUnique({
          where: {
            walletId_token: {
              walletId: targetWalletId,
              token,
            },
          },
        });

        if (!balance) {
          balance = await tx.balance.create({
            data: {
              walletId: targetWalletId,
              userId,
              chain,
              token,
              available: new Prisma.Decimal(0),
              locked: new Prisma.Decimal(0),
              total: new Prisma.Decimal(0),
            },
          });
        }

        const amountDec = new Prisma.Decimal(amount);
        const newAvailable = balance.available.add(amountDec);
        const newTotal = balance.total.add(amountDec);

        await tx.balance.update({
          where: { id: balance.id },
          data: {
            available: newAvailable,
            total: newTotal,
          },
        });

        // Update deposit status
        await tx.deposit.update({
          where: { id: depositId },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });

        // Create wallet transaction record
        await tx.walletTransaction.create({
          data: {
            userId,
            walletId: targetWalletId,
            chain,
            token,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            amount: amountDec,
            fee: new Prisma.Decimal(0),
            netAmount: amountDec,
            balanceAfter: newTotal,
            referenceId: depositId,
            description: `Deposit of ${amount} ${token} on ${chain}`,
          },
        });

        // Create notification
        await tx.notification.create({
          data: {
            userId,
            type: 'DEPOSIT',
            title: 'Deposit received',
            message: `${amount} ${token} has been credited to your ${chain} wallet`,
            channel: 'BOTH',
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'DEPOSIT_COMPLETED',
            entity: 'Deposit',
            entityId: depositId,
            details: { chain, token, amount },
          },
        });
      });

      this.logger.log(`Deposit completed: ${depositId} ${amount} ${token} on ${chain}`);

      // Real-time notifications: tell the user's connected dashboards to
      // refetch balances + deposit history. Sent after the DB transaction
      // commits so subscribers never see a balance that doesn't exist yet.
      this.realtimeGateway.emitToUser(userId, 'balance:update', {
        userId,
        chain,
        token,
        amount,
        depositId,
        at: new Date().toISOString(),
      });

      this.realtimeGateway.emitToUser(userId, 'deposit:received', {
        userId,
        chain,
        token,
        amount,
        depositId,
        txHash: depositId,
        status: 'COMPLETED',
        at: new Date().toISOString(),
      });

      this.realtimeGateway.emitToUser(userId, 'notification:new', {
        userId,
        type: 'DEPOSIT',
        title: 'Deposit received',
        message: `${amount} ${token} has been credited to your ${chain} wallet`,
        at: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to complete deposit ${depositId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Manually create a deposit (admin, also used by tests).
   *
   * Accepts either `userId` (UUID) or `email` to identify the target user.
   * If `toAddress` is omitted, it is auto-fetched from the user's SPOT wallet
   * on the requested chain (so the admin only needs `email` + `chain` +
   * `txHash` + `amount` + `fromAddress` to credit a missed deposit).
   */
  async manualDeposit(params: {
    userId?: string;
    email?: string;
    chain: ChainType;
    token: string;
    amount: string;
    txHash: string;
    fromAddress: string;
    toAddress?: string;
    adminId: string;
    note?: string;
  }) {
    const { userId, email, chain, token, amount, txHash, fromAddress, toAddress, adminId, note } = params;

    // 1) Identify the target user
    if (!userId && !email) {
      throw new BadRequestException('Either `userId` (UUID) or `email` must be provided.');
    }

    let resolvedUser: { id: string; email: string; status: string; role: string } | null = null;

    if (userId) {
      resolvedUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, status: true, role: true },
      });
      if (!resolvedUser) {
        throw new NotFoundException(`No user found with id "${userId}".`);
      }
    } else if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      resolvedUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, status: true, role: true },
      });
      if (!resolvedUser) {
        throw new NotFoundException(`No user found with email "${normalizedEmail}".`);
      }
    }

    const targetUserId = resolvedUser!.id;

    // 2) Verify the acting admin
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || !['ADMIN', 'SUPER_ADMIN'].includes(admin.role)) {
      throw new ForbiddenException('Only ADMIN / SUPER_ADMIN can credit deposits manually.');
    }

    // 3) Deduplicate by txHash
    const existing = await this.prisma.deposit.findUnique({ where: { txHash } });
    if (existing) {
      throw new ConflictException(
        `Deposit with txHash "${txHash}" already exists (deposit id=${existing.id}, status=${existing.status}).`,
      );
    }

    // 4) Find the user's wallet on this chain (SPOT only)
    const wallet = await this.prisma.wallet.findFirst({
      where: { userId: targetUserId, chain, walletType: 'SPOT' },
    });
    if (!wallet) {
      throw new NotFoundException(
        `No SPOT wallet found for user ${resolvedUser!.email} on chain ${chain}.`,
      );
    }

    // 5) If `toAddress` was not provided, auto-fill from the wallet so the
    //    caller doesn't have to look it up. (Common case: credit a deposit
    //    that the poller missed — admin only knows the explorer URL.)
    const finalToAddress = toAddress ?? wallet.address;
    if (!finalToAddress) {
      throw new BadRequestException(
        'Could not determine a `toAddress`. Pass it explicitly or ensure the user has a wallet on this chain.',
      );
    }

    // 6) Honour minDeposit for the configured token
    const tokenConfig = await this.prisma.tokenConfig.findFirst({
      where: { symbol: token, enabled: true },
    });
    if (tokenConfig?.minDeposit) {
      const minDeposit = Number(tokenConfig.minDeposit);
      const amountNum = Number(amount);
      if (Number.isNaN(amountNum)) {
        throw new BadRequestException(`amount "${amount}" is not a valid number.`);
      }
      if (amountNum < minDeposit) {
        throw new BadRequestException(
          `amount ${amount} is below the configured minDeposit of ${minDeposit} ${token}.`,
        );
      }
    }

    // 7) Create the deposit row (status COMPLETED — admin is asserting on-chain reality)
    const deposit = await this.prisma.deposit.create({
      data: {
        userId: targetUserId,
        chain,
        token,
        amount: new Prisma.Decimal(amount),
        txHash,
        fromAddress,
        toAddress: finalToAddress,
        status: 'COMPLETED',
        processedAt: new Date(),
        confirmations: 999,
      },
    });

    this.logger.log(
      `[MANUAL] admin=${adminId} credited ${amount} ${token} on ${chain} to user ${resolvedUser!.email} (tx=${txHash})`,
    );

    // 8) Credit the balance + emit real-time events (same path the poller uses)
    await this.completeDeposit(deposit.id, targetUserId, chain, token, amount, wallet.id);

    // 9) Audit log — note (free-form reason) goes in `details`
    await this.prisma.adminLog.create({
      data: {
        adminId,
        action: 'MANUAL_DEPOSIT_CREDITED',
        targetUserId,
        details: {
          chain,
          token,
          amount,
          txHash,
          fromAddress,
          toAddress: finalToAddress,
          depositId: deposit.id,
          note: note ?? null,
        },
      },
    });

    return {
      ...deposit,
      creditedTo: {
        userId: targetUserId,
        email: resolvedUser!.email,
        walletId: wallet.id,
        walletAddress: finalToAddress,
      },
    };
  }

  /**
   * List deposits for a user.
   */
  async getUserDeposits(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deposit.count({ where: { userId } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * List all deposits (admin).
   */
  async listAllDeposits(params: {
    page: number;
    limit: number;
    userId?: string;
    chain?: string;
    token?: string;
    status?: string;
  }) {
    const { page, limit, userId, chain, token, status } = params;
    const where: Prisma.DepositWhereInput = {};

    if (userId) where.userId = userId;
    if (chain) where.chain = chain;
    if (token) where.token = token;
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
}
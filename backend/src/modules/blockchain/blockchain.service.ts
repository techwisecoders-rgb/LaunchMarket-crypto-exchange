import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ethers,
  JsonRpcProvider,
  Wallet as EthersWallet,
  Contract,
  formatUnits,
  parseUnits,
  isAddress,
} from 'ethers';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

/**
 * Known EVM mainnet chain IDs.
 * The runtime safety guard in {@link BlockchainService.loadChainConfigs}
 * uses this set to refuse to poll/scan mainnet chains even if the DB row
 * or env var is mis-configured. Always pinned to **testnet** (Sepolia /
 * Base Sepolia) for this MVP.
 */
const MAINNET_CHAIN_IDS = new Set<number>([
  1, // Ethereum mainnet
  8453, // Base mainnet
]);

export interface ChainInfo {
  chain: 'ETHEREUM' | 'BASE';
  chainId: number;
  rpcUrl: string;
  blockConfirmations: number;
  explorerUrl: string;
  nativeSymbol: string;
}

export interface TokenInfo {
  symbol: string;
  decimals: number;
  contractAddress: string | null; // null = native coin
  minDeposit: string;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private providers: Map<string, JsonRpcProvider>;
  private chainConfigs: Map<string, ChainInfo>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {
    this.providers = new Map();
    this.chainConfigs = new Map();
  }

  async onModuleInit() {
    const networkType = this.configService.get<string>('NETWORK_TYPE', 'testnet').toLowerCase();
    if (networkType !== 'testnet') {
      this.logger.error(
        `[TESTNET-GUARD] NETWORK_TYPE="${networkType}" but this deployment is pinned to TESTNET. Refusing to start deposit pollers. Set NETWORK_TYPE=testnet in backend/.env.`,
      );
      return;
    }
    this.logger.log(`[NETWORK] mode=${networkType} (Sepolia / Base Sepolia)`);
    await this.loadChainConfigs();
  }

  /**
   * Load chain configurations from database.
   *
   * Safety: any chain row whose `chainId` matches a known mainnet chain ID
   * (Ethereum mainnet `1`, Base mainnet `8453`) is **skipped** and a loud
   * warning is logged. This MVP is pinned to testnet (Sepolia / Base Sepolia)
   * and will not poll or scan deposits on a mainnet chain even if a row is
   * mis-configured in the database.
   */
  async loadChainConfigs() {
    try {
      const chains = await this.prisma.chainConfig.findMany({
        where: { enabled: true },
      });

      for (const chain of chains) {
        if (MAINNET_CHAIN_IDS.has(chain.chainId)) {
          this.logger.error(
            `[TESTNET-GUARD] Refusing to load chain "${chain.chain}" — chainId ${chain.chainId} is a known MAINNET (Ethereum/Base mainnet). This deployment is pinned to TESTNET. Update the ChainConfig row to a Sepolia / Base Sepolia chainId (11155111 / 84532) and a testnet RPC.`,
          );
          continue;
        }

        const info: ChainInfo = {
          chain: chain.chain as 'ETHEREUM' | 'BASE',
          chainId: chain.chainId,
          rpcUrl: chain.rpcUrl,
          blockConfirmations: chain.blockConfirmations,
          explorerUrl: chain.explorerUrl,
          nativeSymbol: chain.chain === 'ETHEREUM' ? 'ETH' : 'ETH',
        };
        this.chainConfigs.set(chain.chain, info);
        this.providers.set(chain.chain, new JsonRpcProvider(chain.rpcUrl));
      }

      this.logger.log(`Loaded ${this.chainConfigs.size} chain configurations (TESTNET mode)`);
    } catch (error) {
      this.logger.error(
        'Failed to load chain configs, using env fallback',
        error instanceof Error ? error.stack : String(error),
      );
      this.loadChainConfigsFromEnv();
    }
  }

  /**
   * Fallback: load chain configs from environment variables.
   * Defaults are TESTNET (Sepolia / Base Sepolia) so that a fresh checkout
   * with no env overrides still runs against testnets.
   */
  private loadChainConfigsFromEnv() {
    const ethRpc = this.configService.get<string>(
      'ETHEREUM_RPC_URL',
      'https://ethereum-sepolia-rpc.publicnode.com',
    );
    const baseRpc = this.configService.get<string>(
      'BASE_RPC_URL',
      'https://sepolia.base.org',
    );

    const chains: ChainInfo[] = [
      {
        chain: 'ETHEREUM',
        chainId: parseInt(this.configService.get<string>('ETHEREUM_CHAIN_ID', '11155111')),
        rpcUrl: ethRpc,
        blockConfirmations: parseInt(this.configService.get<string>('ETHEREUM_CONFIRMATIONS', '3')),
        explorerUrl: this.configService.get<string>('ETHEREUM_EXPLORER_URL', 'https://sepolia.etherscan.io'),
        nativeSymbol: 'ETH',
      },
      {
        chain: 'BASE',
        chainId: parseInt(this.configService.get<string>('BASE_CHAIN_ID', '84532')),
        rpcUrl: baseRpc,
        blockConfirmations: parseInt(this.configService.get<string>('BASE_CONFIRMATIONS', '3')),
        explorerUrl: this.configService.get<string>('BASE_EXPLORER_URL', 'https://sepolia.basescan.org'),
        nativeSymbol: 'ETH',
      },
    ];

    for (const info of chains) {
      if (MAINNET_CHAIN_IDS.has(info.chainId)) {
        this.logger.error(
          `[TESTNET-GUARD] Refusing to load chain "${info.chain}" — chainId ${info.chainId} is a known MAINNET. This deployment is pinned to TESTNET.`,
        );
        continue;
      }
      this.chainConfigs.set(info.chain, info);
      this.providers.set(info.chain, new JsonRpcProvider(info.rpcUrl));
    }

    this.logger.log('Loaded chain configs from environment (TESTNET mode)');
  }

  /**
   * Get a provider for a chain.
   */
  getProvider(chain: string): JsonRpcProvider {
    const provider = this.providers.get(chain);
    if (!provider) {
      throw new Error(`No provider configured for chain ${chain}`);
    }
    return provider;
  }

  getChainInfo(chain: string): ChainInfo {
    const info = this.chainConfigs.get(chain);
    if (!info) {
      throw new Error(`No chain config for ${chain}`);
    }
    return info;
  }

  /**
   * Scan a block range for deposits to a specific address.
   * Returns parsed deposit events.
   */
  async scanBlockRangeForAddress(
    chain: string,
    address: string,
    fromBlock: number,
    toBlock: number,
    tokenConfigs: { symbol: string; contractAddress: string | null; decimals: number }[],
  ) {
    const provider = this.getProvider(chain);
    const results: {
      txHash: string;
      fromAddress: string;
      toAddress: string;
      amount: string;
      token: string;
      blockNumber: number;
    }[] = [];

    const normalizedAddress = address.toLowerCase();

    for (const token of tokenConfigs) {
      try {
        if (token.contractAddress === null) {
          // Native coin (ETH): scan blocks for transactions to this address
          for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
            const block = await provider.getBlock(blockNum, true);
            if (!block) continue;

            for (const tx of block.prefetchedTransactions ?? []) {
              if (
                tx.to &&
                tx.to.toLowerCase() === normalizedAddress &&
                tx.from.toLowerCase() !== normalizedAddress
              ) {
                results.push({
                  txHash: tx.hash,
                  fromAddress: tx.from,
                  toAddress: tx.to,
                  amount: formatUnits(tx.value, 18),
                  token: token.symbol,
                  blockNumber: blockNum,
                });
              }
            }
          }
        } else {
          // ERC-20 token: use Transfer event logs
          const contract = new Contract(token.contractAddress, ERC20_ABI, provider);

          // Query Transfer events where `to` = address
          const filterTo = contract.filters.Transfer(null, address);
          const eventsTo = await contract.queryFilter(filterTo, fromBlock, toBlock);

          for (const event of eventsTo) {
            const parsed = event as unknown as {
              args?: {
                from?: { toString: () => string };
                to?: { toString: () => string };
                value?: { toString: () => string };
              };
              transactionHash: string;
              blockNumber: number;
            };

            const from = parsed.args?.from?.toString() ?? '';
            const to = parsed.args?.to?.toString() ?? '';
            const value = parsed.args?.value?.toString() ?? '0';

            results.push({
              txHash: parsed.transactionHash,
              fromAddress: from,
              toAddress: to,
              amount: formatUnits(value, token.decimals),
              token: token.symbol,
              blockNumber: parsed.blockNumber,
            });
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to scan ${token.symbol} on ${chain} blocks ${fromBlock}-${toBlock}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return results;
  }

  /**
   * Get the current block number for a chain.
   */
  async getCurrentBlockNumber(chain: string): Promise<number> {
    const provider = this.getProvider(chain);
    return provider.getBlockNumber();
  }

  /**
   * Get the number of confirmations for a transaction.
   */
  async getTransactionConfirmations(
    chain: string,
    txHash: string,
  ): Promise<number> {
    const provider = this.getProvider(chain);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return 0;
    const currentBlock = await provider.getBlockNumber();
    return currentBlock - receipt.blockNumber + 1;
  }

  /**
   * Get a user's on-chain balance for a token.
   * Contract address null = native coin.
   */
  async getOnChainBalance(
    chain: string,
    address: string,
    token: { symbol: string; contractAddress: string | null; decimals: number },
  ): Promise<string> {
    const provider = this.getProvider(chain);

    if (token.contractAddress === null) {
      const balance = await provider.getBalance(address);
      return formatUnits(balance, token.decimals);
    }

    const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(address);
    return formatUnits(balance as bigint, token.decimals);
  }

  /**
   * Get current gas price for a chain in gwei.
   */
  async getGasPrice(chain: string): Promise<string> {
    const provider = this.getProvider(chain);
    const feeData = await provider.getFeeData();
    return feeData.gasPrice ? formatUnits(feeData.gasPrice, 'gwei') : '0';
  }

  /**
   * Estimate gas for a token transfer.
   */
  async estimateTransferGas(
    chain: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    token: { symbol: string; contractAddress: string | null; decimals: number },
  ): Promise<string> {
    const provider = this.getProvider(chain);

    if (token.contractAddress === null) {
      const gas = await provider.estimateGas({
        from: fromAddress,
        to: toAddress,
        value: parseUnits(amount, token.decimals),
      });
      return gas.toString();
    }

    const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
    const gas = await contract.transfer.estimateGas(toAddress, parseUnits(amount, token.decimals), {
      from: fromAddress,
    });
    return gas.toString();
  }

  /**
   * Send a withdrawal transaction.
   * Returns tx hash.
   */
  async sendTransaction(
    chain: string,
    privateKey: string,
    toAddress: string,
    amount: string,
    token: { symbol: string; contractAddress: string | null; decimals: number },
    nonce?: number,
  ): Promise<{ txHash: string; nonce: number }> {
    const provider = this.getProvider(chain);
    const wallet = new EthersWallet(privateKey, provider);

    const amountWei = parseUnits(amount, token.decimals);

    let tx;
    if (token.contractAddress === null) {
      const feeData = await provider.getFeeData();
      tx = await wallet.sendTransaction({
        to: toAddress,
        value: amountWei,
        gasPrice: feeData.gasPrice ?? undefined,
        gasLimit: 21000,
        nonce,
      });
    } else {
      const contract = new Contract(token.contractAddress, ERC20_ABI, wallet);
      const feeData = await provider.getFeeData();
      tx = await contract.transfer(toAddress, amountWei, {
        gasPrice: feeData.gasPrice ?? undefined,
        nonce,
      });
    }

    this.logger.log(`Transaction sent on ${chain}: ${tx.hash}`);
    return { txHash: tx.hash, nonce: tx.nonce };
  }

  /**
   * Validate a withdrawal address.
   */
  isValidAddress(address: string): boolean {
    return isAddress(address);
  }

  /**
   * Serialize a transaction for replay protection.
   */
  buildIdempotencyKey(
    userId: string,
    chain: string,
    token: string,
    amount: string,
    address: string,
  ): string {
    return `${userId}:${chain}:${token}:${amount}:${address.toLowerCase()}`;
  }

  /**
   * Get pending nonce for an address (account nonce).
   */
  async getPendingNonce(chain: string, address: string): Promise<number> {
    const provider = this.getProvider(chain);
    return provider.getTransactionCount(address, 'pending');
  }
}
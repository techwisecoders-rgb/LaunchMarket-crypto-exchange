import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding SIDRA EXCHANGE database...');

  // ============================================================
  // Admin user
  // ============================================================
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@sidra.exchange';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Sidra@Admin2025!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      fullName: 'SIDRA Exchange Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  console.log(`✅ Admin user: ${admin.email} (${admin.id})`);

  // ============================================================
  // Chain configurations
  // ============================================================
  const chains = [
    {
      chain: 'ETHEREUM',
      name: 'Ethereum Sepolia',
      // Fallback defaults are TESTNET so a fresh checkout with no env
      // overrides still seeds the database with Sepolia configuration.
      rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '11155111', 10),
      blockConfirmations: parseInt(process.env.ETHEREUM_CONFIRMATIONS || '3', 10),
      pollingIntervalMs: parseInt(process.env.ETHEREUM_POLLING_INTERVAL || '30000', 10),
      explorerUrl: process.env.ETHEREUM_EXPLORER_URL || 'https://sepolia.etherscan.io',
      enabled: true,
    },
    {
      chain: 'BASE',
      name: 'Base Sepolia',
      rpcUrl: process.env.BASE_RPC_URL || 'https://sepolia.base.org',
      chainId: parseInt(process.env.BASE_CHAIN_ID || '84532', 10),
      blockConfirmations: parseInt(process.env.BASE_CONFIRMATIONS || '3', 10),
      pollingIntervalMs: parseInt(process.env.BASE_POLLING_INTERVAL || '30000', 10),
      explorerUrl: process.env.BASE_EXPLORER_URL || 'https://sepolia.basescan.org',
      enabled: true,
    },
  ];

  // Safety guard: refuse to seed with mainnet chainIds regardless of env.
  const MAINNET_CHAIN_IDS = new Set<number>([1, 8453]);
  for (const chain of chains) {
    if (MAINNET_CHAIN_IDS.has(chain.chainId)) {
      console.error(
        `❌ Refusing to seed ${chain.name} — chainId ${chain.chainId} is MAINNET. This deployment is pinned to TESTNET (Sepolia / Base Sepolia).`,
      );
      process.exit(1);
    }
    await prisma.chainConfig.upsert({
      where: { chain: chain.chain },
      update: chain,
      create: chain,
    });
    console.log(`✅ Chain: ${chain.name}`);
  }

  // ============================================================
  // Token configurations (ETH, USDT, USDC + future SIDRA)
  // ============================================================

  const tokens = [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      chains: ['ETHEREUM', 'BASE'],
      contractAddress: null,
      minDeposit: new Prisma.Decimal('0.001'),
      minWithdrawal: new Prisma.Decimal('0.001'),
      withdrawalFeePercentage: new Prisma.Decimal('1'),
      isNative: true,
      enabled: true,
      icon: '/icons/eth.svg',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      chains: ['ETHEREUM', 'BASE'],
      contractAddress:
        process.env.USDT_CONTRACT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      minDeposit: new Prisma.Decimal('0.1'),
      minWithdrawal: new Prisma.Decimal('10'),
      withdrawalFeePercentage: new Prisma.Decimal('1'),
      isNative: false,
      enabled: true,
      icon: '/icons/usdt.svg',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      chains: ['ETHEREUM', 'BASE'],
      contractAddress:
        process.env.USDC_CONTRACT_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      minDeposit: new Prisma.Decimal('0.1'),
      minWithdrawal: new Prisma.Decimal('10'),
      withdrawalFeePercentage: new Prisma.Decimal('1'),
      isNative: false,
      enabled: true,
      icon: '/icons/usdc.svg',
    },
    {
      symbol: 'SIDRA',
      name: 'SIDRA Token',
      decimals: 18,
      chains: ['ETHEREUM', 'BASE'],
      contractAddress: null, // Set when the token is deployed
      minDeposit: new Prisma.Decimal('0.1'),
      minWithdrawal: new Prisma.Decimal('1'),
      withdrawalFeePercentage: new Prisma.Decimal('1'),
      isNative: false,
      enabled: false, // Disabled until deployed; enable via admin settings
      icon: '/icons/sidra.svg',
    },
  ];

  for (const token of tokens) {
    await prisma.tokenConfig.upsert({
      where: { symbol: token.symbol },
      update: token,
      create: token,
    });
    console.log(`✅ Token: ${token.symbol}${token.enabled ? '' : ' (disabled)'}`);
  }

  // ============================================================
  // Trading pairs
  // ============================================================

  const pairs = [
    {
      baseToken: 'ETH',
      quoteToken: 'USDT',
      chain: 'ETHEREUM',
      symbol: 'ETH/USDT',
      minOrderSize: new Prisma.Decimal('0.001'),
      maxOrderSize: new Prisma.Decimal('100'),
      priceDecimals: 6,
      quantityDecimals: 6,
      makerFee: new Prisma.Decimal('0.1'),
      takerFee: new Prisma.Decimal('0.1'),
      enabled: true,
    },
    {
      baseToken: 'ETH',
      quoteToken: 'USDT',
      chain: 'BASE',
      symbol: 'ETH/USDT-BASE',
      minOrderSize: new Prisma.Decimal('0.001'),
      maxOrderSize: new Prisma.Decimal('100'),
      priceDecimals: 6,
      quantityDecimals: 6,
      makerFee: new Prisma.Decimal('0.1'),
      takerFee: new Prisma.Decimal('0.1'),
      enabled: true,
    },
    {
      baseToken: 'USDT',
      quoteToken: 'USDC',
      chain: 'ETHEREUM',
      symbol: 'USDT/USDC',
      minOrderSize: new Prisma.Decimal('1'),
      maxOrderSize: new Prisma.Decimal('100000'),
      priceDecimals: 6,
      quantityDecimals: 6,
      makerFee: new Prisma.Decimal('0'),
      takerFee: new Prisma.Decimal('0'),
      enabled: true,
    },
    {
      baseToken: 'USDT',
      quoteToken: 'USDC',
      chain: 'BASE',
      symbol: 'USDT/USDC-BASE',
      minOrderSize: new Prisma.Decimal('1'),
      maxOrderSize: new Prisma.Decimal('100000'),
      priceDecimals: 6,
      quantityDecimals: 6,
      makerFee: new Prisma.Decimal('0'),
      takerFee: new Prisma.Decimal('0'),
      enabled: true,
    },
    {
      baseToken: 'USDC',
      quoteToken: 'ETH',
      chain: 'ETHEREUM',
      symbol: 'USDC/ETH',
      minOrderSize: new Prisma.Decimal('1'),
      maxOrderSize: new Prisma.Decimal('100000'),
      priceDecimals: 6,
      quantityDecimals: 6,
      makerFee: new Prisma.Decimal('0.1'),
      takerFee: new Prisma.Decimal('0.1'),
      enabled: true,
    },
    {
      baseToken: 'USDC',
      quoteToken: 'ETH',
      chain: 'BASE',
      symbol: 'USDC/ETH-BASE',
      minOrderSize: new Prisma.Decimal('1'),
      maxOrderSize: new Prisma.Decimal('100000'),
      priceDecimals: 6,
      quantityDecimals: 6,
      makerFee: new Prisma.Decimal('0.1'),
      takerFee: new Prisma.Decimal('0.1'),
      enabled: true,
    },
    // Future SIDRA pairs (enabled when the token is live)
    {
      baseToken: 'SIDRA',
      quoteToken: 'USDT',
      chain: 'ETHEREUM',
      symbol: 'SIDRA/USDT',
      minOrderSize: new Prisma.Decimal('1'),
      maxOrderSize: new Prisma.Decimal('1000000'),
      priceDecimals: 8,
      quantityDecimals: 2,
      makerFee: new Prisma.Decimal('0.1'),
      takerFee: new Prisma.Decimal('0.1'),
      enabled: false,
    },
    {
      baseToken: 'SIDRA',
      quoteToken: 'USDT',
      chain: 'BASE',
      symbol: 'SIDRA/USDT-BASE',
      minOrderSize: new Prisma.Decimal('1'),
      maxOrderSize: new Prisma.Decimal('1000000'),
      priceDecimals: 8,
      quantityDecimals: 2,
      makerFee: new Prisma.Decimal('0.1'),
      takerFee: new Prisma.Decimal('0.1'),
      enabled: false,
    },
  ];

  for (const pair of pairs) {
    await prisma.tradingPair.upsert({
      where: { symbol: pair.symbol },
      update: pair,
      create: pair,
    });
    console.log(`✅ Trading pair: ${pair.symbol}${pair.enabled ? '' : ' (disabled)'}`);
  }

  // ============================================================
  // Fees
  // ============================================================

  const fees = [
    { type: 'WITHDRAWAL', chain: 'ETHEREUM', token: 'ETH' },
    { type: 'WITHDRAWAL', chain: 'ETHEREUM', token: 'USDT' },
    { type: 'WITHDRAWAL', chain: 'ETHEREUM', token: 'USDC' },
    { type: 'WITHDRAWAL', chain: 'BASE', token: 'ETH' },
    { type: 'WITHDRAWAL', chain: 'BASE', token: 'USDT' },
    { type: 'WITHDRAWAL', chain: 'BASE', token: 'USDC' },
  ];

  for (const fee of fees) {
    await prisma.fee.upsert({
      where: {
        type_chain_token: {
          type: fee.type,
          chain: fee.chain,
          token: fee.token,
        },
      },
      update: { percentage: new Prisma.Decimal('1'), status: 'ACTIVE' },
      create: {
        type: fee.type,
        chain: fee.chain,
        token: fee.token,
        percentage: new Prisma.Decimal('1'),
        status: 'ACTIVE',
      },
    });
    console.log(`✅ Fee: WITHDRAWAL ${fee.token} on ${fee.chain} = 1%`);
  }

  // ============================================================
  // System settings
  // ============================================================

  const settings = [
    { key: 'exchange_name', value: 'SIDRA EXCHANGE', category: 'GENERAL', isPublic: true },
    { key: 'support_email', value: 'support@sidra.exchange', category: 'GENERAL', isPublic: true },
    { key: 'min_withdrawal_eth', value: '0.001', category: 'WITHDRAWAL', isPublic: false },
    { key: 'min_withdrawal_usdt', value: '10', category: 'WITHDRAWAL', isPublic: false },
    { key: 'min_withdrawal_usdc', value: '10', category: 'WITHDRAWAL', isPublic: false },
    { key: 'min_deposit_eth', value: '0.001', category: 'DEPOSIT', isPublic: true },
    { key: 'min_deposit_usdt', value: '0.1', category: 'DEPOSIT', isPublic: true },
    { key: 'min_deposit_usdc', value: '0.1', category: 'DEPOSIT', isPublic: true },
    { key: 'withdrawal_fee_percentage', value: '1', category: 'WITHDRAWAL', isPublic: true },
    { key: 'order_expiry_hours', value: '72', category: 'ORDERS', isPublic: false },
    { key: 'max_otp_attempts', value: '5', category: 'SECURITY', isPublic: false },
    { key: 'otp_expiry_minutes', value: '5', category: 'SECURITY', isPublic: false },
    { key: 'otp_resend_seconds', value: '60', category: 'SECURITY', isPublic: false },
    { key: 'maintenance_mode', value: 'false', category: 'SYSTEM', isPublic: true },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: setting,
      create: setting,
    });
  }
  console.log(`✅ System settings (${settings.length})`);

  console.log('🎉 SIDRA EXCHANGE database seeded successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
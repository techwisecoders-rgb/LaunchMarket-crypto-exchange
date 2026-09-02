// Seed test data for two specific users.
// Run with: node seed-test-data.js
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const COUNTERPARTY_EMAILS = {
  'perumallasurakowshik11@gmail.com': 'thoughtsofvisdom@gmail.com',
  'thoughtsofvisdom@gmail.com': 'perumallasurakowshik11@gmail.com',
};

function makeTxHash(prefix) {
  return '0x' + crypto.randomBytes(32).toString('hex') + prefix;
}
function makeAddress(prefix) {
  return '0x' + crypto.randomBytes(20).toString('hex') + prefix;
}

async function getOrCreateCounterparty(email) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) return user;
  user = await prisma.user.create({
    data: {
      email,
      passwordHash: '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholderpl',
      fullName: email.split('@')[0],
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  for (const chain of ['ETHEREUM', 'BASE']) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
        chain,
        address: makeAddress(chain),
        encryptedKey: 'placeholder',
        walletType: 'SPOT',
        status: 'ACTIVE',
      },
    });
  }
  return user;
}

async function ensureWallet(userId, chain) {
  let w = await prisma.wallet.findFirst({ where: { userId, chain, walletType: 'SPOT' } });
  if (!w) {
    w = await prisma.wallet.create({
      data: {
        userId, chain,
        address: makeAddress(chain),
        encryptedKey: 'placeholder',
        walletType: 'SPOT',
        status: 'ACTIVE',
      },
    });
  }
  return w;
}

async function setBalance(userId, chain, token, available) {
  const wallet = await ensureWallet(userId, chain);
  const total = available;
  const locked = 0;
  const existing = await prisma.balance.findFirst({ where: { userId, chain, token } });
  if (existing) {
    return prisma.balance.update({
      where: { id: existing.id },
      data: { available, locked, total },
    });
  }
  return prisma.balance.create({
    data: { userId, walletId: wallet.id, chain, token, available, locked, total },
  });
}

async function addDeposit(userId, chain, token, amount, toAddress) {
  return prisma.deposit.create({
    data: {
      userId, chain, token, amount,
      txHash: makeTxHash(chain),
      fromAddress: makeAddress('from'),
      toAddress,
      blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
      confirmations: 64,
      status: 'CONFIRMED',
      processedAt: new Date(),
    },
  });
}

async function addOpenOrders(userId, counterpartyId, count) {
  const orders = [];
  for (let i = 0; i < count; i++) {
    const type = i % 2 === 0 ? 'SELL' : 'BUY';
    const chain = i % 2 === 0 ? 'ETHEREUM' : 'BASE';
    const token = i % 3 === 0 ? 'ETH' : 'USDT';
    const quoteToken = token === 'ETH' ? 'USDT' : 'ETH';
    const price = token === 'ETH'
      ? (3000 + Math.random() * 200).toFixed(2)
      : (1 / (3000 + Math.random() * 200)).toFixed(8);
    const quantity = token === 'ETH'
      ? (0.1 + Math.random() * 2).toFixed(4)
      : (100 + Math.random() * 5000).toFixed(2);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const order = await prisma.order.create({
      data: {
        sellerId: type === 'SELL' ? userId : counterpartyId,
        buyerId: type === 'BUY' ? userId : null,
        chain, token, quoteToken, type,
        status: 'OPEN', price, quantity, expiresAt,
      },
    });
    orders.push(order);
  }
  return orders;
}

async function main() {
  const targets = [
    {
      email: 'perumallasurakowshik11@gmail.com',
      ethBalance: '5', usdtBalance: '10000',
      depositCount: 6, openOrderCount: 8,
    },
    {
      email: 'thoughtsofvisdom@gmail.com',
      ethBalance: '7', usdtBalance: '5000',
      depositCount: 6, openOrderCount: 8,
    },
  ];

  for (const t of targets) {
    console.log(`\n=== Processing ${t.email} ===`);
    const user = await prisma.user.findUnique({
      where: { email: t.email },
      include: { wallets: true },
    });
    if (!user) {
      console.error(`  X User ${t.email} not found, skipping.`);
      continue;
    }
    console.log(`  V User id: ${user.id}`);

    const ethWallet = await ensureWallet(user.id, 'ETHEREUM');
    const baseWallet = await ensureWallet(user.id, 'BASE');
    console.log(`  V ETH wallet: ${ethWallet.address}`);
    console.log(`  V BASE wallet: ${baseWallet.address}`);

    await setBalance(user.id, 'ETHEREUM', 'ETH', t.ethBalance);
    await setBalance(user.id, 'BASE', 'USDT', t.usdtBalance);
    await setBalance(user.id, 'BASE', 'ETH', (parseFloat(t.ethBalance) * 0.1).toFixed(4));
    await setBalance(user.id, 'ETHEREUM', 'USDT', (parseFloat(t.usdtBalance) * 0.1).toFixed(2));
    console.log(`  V Balances set: ${t.ethBalance} ETH + ${t.usdtBalance} USDT`);

    const counterpartyEmail = COUNTERPARTY_EMAILS[t.email];
    const counterparty = await getOrCreateCounterparty(counterpartyEmail);
    console.log(`  V Counterparty (${counterpartyEmail}): ${counterparty.id}`);

    const depositTokens = ['ETH', 'USDT', 'ETH', 'USDT', 'ETH', 'USDT'];
    const depositAmounts = ['2', '3000', '1.5', '4000', '1.5', '3000'];
    for (let i = 0; i < t.depositCount; i++) {
      const chain = i % 2 === 0 ? 'ETHEREUM' : 'BASE';
      const token = depositTokens[i % depositTokens.length];
      const amount = depositAmounts[i % depositAmounts.length];
      const wallet = chain === 'ETHEREUM' ? ethWallet : baseWallet;
      const dep = await addDeposit(user.id, chain, token, amount, wallet.address);
      await prisma.walletTransaction.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          chain, token,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount,
          netAmount: amount,
          fee: 0,
          balanceAfter: token === 'ETH' ? t.ethBalance : t.usdtBalance,
          referenceId: dep.id,
          description: `Deposit of ${amount} ${token} on ${chain}`,
        },
      });
    }
    console.log(`  V ${t.depositCount} deposits created`);

    const orders = await addOpenOrders(user.id, counterparty.id, t.openOrderCount);
    console.log(`  V ${orders.length} open orders created`);
  }

  console.log('\nOK Seed complete.');
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

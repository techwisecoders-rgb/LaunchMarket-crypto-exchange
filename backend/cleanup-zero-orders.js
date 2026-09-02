// Cleanup script: delete any open orders with zero quantity or zero price.
// These pollute the marketplace UI with "0 ETH" rows that have no real data.
//
// Run:  node cleanup-zero-orders.js
// Dry run (no deletes):  node cleanup-zero-orders.js --dry-run
//
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const zeroQty = await prisma.order.findMany({
    where: { quantity: { lte: 0 } },
    select: { id: true, status: true, token: true, quoteToken: true, quantity: true, price: true, sellerId: true, createdAt: true },
  });
  const zeroPrice = await prisma.order.findMany({
    where: { price: { lte: 0 } },
    select: { id: true, status: true, token: true, quoteToken: true, quantity: true, price: true, sellerId: true, createdAt: true },
  });

  const seen = new Set();
  const toDelete = [];
  for (const o of [...zeroQty, ...zeroPrice]) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    toDelete.push(o);
  }

  console.log(`Found ${zeroQty.length} orders with quantity <= 0`);
  console.log(`Found ${zeroPrice.length} orders with price <= 0`);
  console.log(`Total unique orders to delete: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('Nothing to clean up. Exiting.');
    return;
  }

  for (const o of toDelete) {
    console.log(
      `  - ${o.id}  ${o.status}  ${o.quantity} ${o.token} @ ${o.price} ${o.quoteToken}  (created ${o.createdAt.toISOString()})`,
    );
  }

  if (dryRun) {
    console.log('\nDry run: no rows deleted.');
    return;
  }

  // Delete in a transaction so the count and the deletes are consistent.
  const result = await prisma.$transaction(async (tx) => {
    // OrderHistory is FK-linked, so clear it first to avoid constraint violations.
    await tx.orderHistory.deleteMany({
      where: { orderId: { in: toDelete.map((o) => o.id) } },
    });
    // Counter offers can also reference these orders.
    await tx.counterOffer.deleteMany({
      where: { orderId: { in: toDelete.map((o) => o.id) } },
    });
    // Trades reference orders; for safety, only delete trade-less orders here.
    const tradeLinked = await tx.trade.findMany({
      where: { orderId: { in: toDelete.map((o) => o.id) } },
      select: { orderId: true },
    });
    const tradeLinkedIds = new Set(tradeLinked.map((t) => t.orderId));
    const safeToDelete = toDelete.filter((o) => !tradeLinkedIds.has(o.id));
    const skipped = toDelete.length - safeToDelete.length;
    if (skipped > 0) {
      console.log(`  ! Skipping ${skipped} order(s) that have linked trades.`);
    }
    const deleted = await tx.order.deleteMany({
      where: { id: { in: safeToDelete.map((o) => o.id) } },
    });
    return deleted.count;
  });

  console.log(`\nDeleted ${result} order(s).`);
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
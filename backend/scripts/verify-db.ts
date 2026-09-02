// Verify Supabase connection and list tables
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  console.log('TABLES (' + (tables as { tablename: string }[]).length + '):');
  (tables as { tablename: string }[]).forEach((t) => console.log(' - ' + t.tablename));
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
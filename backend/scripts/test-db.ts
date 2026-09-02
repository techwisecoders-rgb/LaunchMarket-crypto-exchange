// Diagnose which Supabase connection string works
import { PrismaClient } from '@prisma/client';

const candidates: { name: string; url: string }[] = [
  {
    name: 'E: direct-postgres-user-encoded (BEST for migrations)',
    url: 'postgresql://postgres:C82LJbxbTXQ*Q%26v@db.psgkfgwtbekptckcfdil.supabase.co:5432/postgres',
  },
  {
    name: 'F: direct-postgres-user-raw',
    url: 'postgresql://postgres:C82LJbxbTXQ*Q&v@db.psgkfgwtbekptckcfdil.supabase.co:5432/postgres',
  },
  {
    name: 'A: pooler-raw (known working)',
    url: 'postgresql://postgres.psgkfgwtbekptckcfdil:C82LJbxbTXQ*Q&v@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres',
  },
  {
    name: 'B: direct-amp-encoded',
    url: 'postgresql://postgres.psgkfgwtbekptckcfdil:C82LJbxbTXQ*Q%26v@db.psgkfgwtbekptckcfdil.supabase.co:5432/postgres',
  },
  {
    name: 'C: direct-raw',
    url: 'postgresql://postgres.psgkfgwtbekptckcfdil:C82LJbxbTXQ*Q&v@db.psgkfgwtbekptckcfdil.supabase.co:5432/postgres',
  },
  {
    name: 'D: pooler-amp-encoded+pgbouncer',
    url: 'postgresql://postgres.psgkfgwtbekptckcfdil:C82LJbxbTXQ*Q%26v@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1',
  },
];

async function test(name: string, url: string): Promise<string> {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const result = (await prisma.$queryRawUnsafe('SELECT version()')) as { version: string }[];
    await prisma.$disconnect();
    return '✅ OK — ' + result[0].version.split('(')[0].trim();
  } catch (e) {
    await prisma.$disconnect().catch(() => undefined);
    return '❌ FAIL — ' + (e as Error).message.split('\n')[0];
  }
}

async function main() {
  for (const c of candidates) {
    const r = await test(c.name, c.url);
    console.log(c.name + ' → ' + r);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
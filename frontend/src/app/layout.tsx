import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: 'SIDRA EXCHANGE - Hybrid P2P Cryptocurrency Exchange',
    template: '%s | SIDRA EXCHANGE',
  },
  description:
    'Trade ETH, USDT and USDC on Ethereum and Base. A hybrid P2P marketplace cryptocurrency exchange.',
  keywords: ['crypto', 'exchange', 'p2p', 'ethereum', 'base', 'usdt', 'usdc', 'defi'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Shield,
  Zap,
  Globe2,
  Lock,
  RefreshCw,
  BarChart3,
  Wallet,
} from 'lucide-react';

const supportedAssets = [
  { symbol: 'ETH', name: 'Ethereum', chain: 'Ethereum + Base', color: 'text-[#627EEA]' },
  { symbol: 'USDT', name: 'Tether', chain: 'Ethereum + Base', color: 'text-[#26A17B]' },
  { symbol: 'USDC', name: 'USD Coin', chain: 'Ethereum + Base', color: 'text-[#2775CA]' },
  { symbol: 'SIDRA', name: 'Coming Soon', chain: 'Native Token', color: 'text-sidra-gold' },
];

const features = [
  {
    icon: Zap,
    title: 'P2P Marketplace Trading',
    description:
      'Create an order at your own price. Buyers accept or counter-offer. Trade executes automatically when both parties agree.',
  },
  {
    icon: Shield,
    title: 'Self-Custody Wallets',
    description:
      'Every user gets unique Ethereum and Base wallets. Private keys are encrypted before storage. Your funds stay yours.',
  },
  {
    icon: Globe2,
    title: 'Multi-Chain by Design',
    description:
      'Ethereum and Base supported at launch. New chains and tokens (including SIDRA) are added through configuration — no code changes.',
  },
  {
    icon: RefreshCw,
    title: 'Automatic On-Chain Detection',
    description:
      'Deposits are detected automatically via blockchain polling with confirmation tracking. Balances always stay synchronized.',
  },
  {
    icon: Lock,
    title: 'Enterprise-Grade Security',
    description:
      'Encrypted secrets, JWT + refresh tokens, email OTP for withdrawals, rate limiting, and full audit logs.',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Updates',
    description:
      'Balances, orders, trades and notifications update instantly over WebSockets, just like a top-tier exchange.',
  },
];

export default function LandingPage() {
  return (
    <div className="crypto-grid-bg min-h-screen">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="exchange-container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sidra-blue to-sidra-gold font-bold text-white">
              S
            </div>
            <span className="text-xl font-bold tracking-tight">
              SIDRA<span className="text-sidra-gold"> EXCHANGE</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link href="/markets" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Markets
            </Link>
            <Link href="/trade" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Trade
            </Link>
            <Link href="/#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Features
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="gap-1">
                Get Started <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="exchange-container flex flex-col items-center py-20 text-center lg:py-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sidra-gold/30 bg-sidra-gold/10 px-4 py-1.5 text-sm font-medium text-sidra-gold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sidra-gold opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sidra-gold" />
            </span>
            Live on Ethereum Sepolia & Base Sepolia <span className="ml-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Testnet</span>
          </div>
          <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            The <span className="text-gradient-blue">Hybrid P2P</span> Exchange Built for Real Traders
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Create orders, negotiate prices, and trade seamlessly on Ethereum Sepolia &amp; Base Sepolia (testnet).
            Full blockchain custody with automatic deposit detection — no compromises.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/register">
              <Button size="lg" className="gap-2 text-base">
                <Wallet className="h-5 w-5" /> Create Free Account
              </Button>
            </Link>
            <Link href="/trade">
              <Button size="lg" variant="outline" className="gap-2 text-base">
                <BarChart3 className="h-5 w-5" /> Explore Markets
              </Button>
            </Link>
          </div>

          {/* Asset ticker strip */}
          <div className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {supportedAssets.map((asset) => (
              <div
                key={asset.symbol}
                className="glass-panel rounded-xl p-4 text-left transition-transform hover:-translate-y-0.5"
              >
                <div className={`text-xl font-bold ${asset.color}`}>{asset.symbol}</div>
                <div className="mt-1 text-xs text-muted-foreground">{asset.name}</div>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {asset.chain}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border/50 bg-background/50">
        <div className="exchange-container grid grid-cols-2 gap-8 py-12 text-center md:grid-cols-4">
          {[
            { value: '2', label: 'Blockchains' },
            { value: '4+', label: 'Supported Tokens' },
            { value: '100%', label: 'On-Chain Custody' },
            { value: '24/7', label: 'Automatic Deposit Detection' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-extrabold text-gradient-gold">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="exchange-container">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Built Like a Top-Tier Exchange
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
            Everything you expect from a professional trading platform, with the control of a P2P marketplace.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-panel group rounded-xl p-6 transition-all hover:border-primary/40 hover:shadow-lg"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 bg-background/50 py-20">
        <div className="exchange-container">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">How P2P Trading Works</h2>
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { step: '01', title: 'Seller Creates Order', desc: 'Choose asset, quantity and set your own price.' },
              { step: '02', title: 'Buyer Negotiates', desc: 'Accept the price or submit a counter offer.' },
              { step: '03', title: 'Trade Executes', desc: 'When both agree, the trade settles automatically and atomically.' },
            ].map((item) => (
              <div key={item.step} className="relative rounded-xl border border-border/60 p-6">
                <div className="text-4xl font-extrabold text-primary/20">{item.step}</div>
                <h3 className="mt-3 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="exchange-container">
          <div className="rounded-2xl border border-sidra-gold/30 bg-gradient-to-br from-primary/20 via-background to-sidra-gold/10 p-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to Trade?</h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Join the next-generation hybrid exchange. Your keys, your coins, your price.
            </p>
            <Link href="/register" className="mt-8 inline-block">
              <Button size="lg" className="gap-2 text-base">
                Start Trading Now <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="exchange-container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <div>
            © {new Date().getFullYear()} SIDRA EXCHANGE. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <Link href="/markets" className="hover:text-foreground">Markets</Link>
            <Link href="/register" className="hover:text-foreground">Sign Up</Link>
            <Link href="/login" className="hover:text-foreground">Log In</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
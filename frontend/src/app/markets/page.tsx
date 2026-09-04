'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function MarketsPage() {
  const { data: markets, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: publicApi.getMarkets,
  });

  const { data: pairs } = useQuery({
    queryKey: ['trading-pairs'],
    queryFn: () => publicApi.getTradingPairs(true),
  });

  return (
    <div className="crypto-grid-bg min-h-screen">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="exchange-container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sidra-blue to-sidra-gold text-xs font-bold text-white">
              S
            </div>
            <span className="font-bold">LAUNCHMARKET<span className="text-sidra-gold"> CRYPTO EXCHANGE</span></span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/markets" className="font-medium text-primary">Markets</Link>
            <Link href="/trade" className="text-muted-foreground hover:text-foreground">Trade</Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">Log In</Link>
            <Link href="/register" className="text-muted-foreground hover:text-foreground">Sign Up</Link>
          </nav>
        </div>
      </header>

      <main className="exchange-container py-8">
        <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trade P2P on Ethereum and Base. Set your own price or negotiate.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>All Markets</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pairs && pairs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-3 font-medium">Pair</th>
                      <th className="pb-3 font-medium">Chain</th>
                      <th className="pb-3 font-medium">Last Price</th>
                      <th className="pb-3 font-medium">24h Change</th>
                      <th className="pb-3 font-medium">24h Volume</th>
                      <th className="pb-3 text-right font-medium">Trade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((pair) => {
                      const market = markets?.find((m) => m.symbol === pair.symbol);
                      const change = market?.priceChangePercent
                        ? parseFloat(market.priceChangePercent)
                        : 0;
                      return (
                        <tr
                          key={pair.symbol}
                          className="border-b border-border/30 transition-colors hover:bg-accent/30"
                        >
                          <td className="py-3 font-semibold">{pair.symbol}</td>
                          <td className="py-3 text-muted-foreground">{pair.chain}</td>
                          <td className="py-3">
                            {market?.lastPrice ? `$${parseFloat(market.lastPrice).toFixed(2)}` : '—'}
                          </td>
                          <td
                            className={`py-3 ${change >= 0 ? 'text-bid-green' : 'text-ask-red'}`}
                          >
                            {market?.priceChangePercent
                              ? `${change.toFixed(2)}%`
                              : '—'}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {market?.quoteVolume
                              ? `$${parseFloat(market.quoteVolume).toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="py-3 text-right">
                            <Link
                              href={`/trade?symbol=${pair.symbol}`}
                              className="rounded-md bg-primary/10 px-3 py-1.5 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                            >
                              Trade
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-12 text-center text-muted-foreground">
                Markets not yet configured. Run the seed script to enable trading pairs.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
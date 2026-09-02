'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface AnalyticsData {
  deposits24h: string;
  withdrawals24h: string;
  volume24h: string;
  feesCollected: string;
  activeUsers24h: string;
  newUsers24h: string;
  avgTradeSize: string;
  trades24h: string;
  topPairs: { symbol: string; volume: string; trades: string }[];
  chainSplit: { chain: string; deposits: string; withdrawals: string; volume: string }[];
}

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: adminApi.analytics,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const a = (data ?? {}) as AnalyticsData;

  const metrics = [
    { label: '24h Volume', value: a.volume24h ?? '0', suffix: 'USDT' },
    { label: '24h Trades', value: a.trades24h ?? '0' },
    { label: '24h Active Users', value: a.activeUsers24h ?? '0' },
    { label: 'New Users (24h)', value: a.newUsers24h ?? '0' },
    { label: 'Avg Trade Size', value: a.avgTradeSize ?? '0', suffix: 'USDT' },
    { label: '24h Deposits', value: a.deposits24h ?? '0', suffix: 'USDT' },
    { label: '24h Withdrawals', value: a.withdrawals24h ?? '0', suffix: 'USDT' },
    { label: 'Fees Collected', value: a.feesCollected ?? '0', suffix: 'USDT' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Analytics</h1>
        <p className="text-muted-foreground">24-hour performance metrics</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-bold">
                {parseFloat(m.value).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                {m.suffix ? ` ${m.suffix}` : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Trading Pairs (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {a.topPairs && a.topPairs.length > 0 ? (
              <div className="space-y-2">
                {a.topPairs.map((p) => (
                  <div key={p.symbol} className="flex items-center justify-between rounded-lg border border-border/40 p-3 text-sm">
                    <span className="font-medium">{p.symbol}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{p.trades} trades</span>
                      <Badge variant="green">{parseFloat(p.volume).toFixed(2)} USDT</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No trade data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chain Activity (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {a.chainSplit && a.chainSplit.length > 0 ? (
              <div className="space-y-2">
                {a.chainSplit.map((c) => (
                  <div key={c.chain} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.chain}</span>
                      <Badge variant="outline">{parseFloat(c.volume).toFixed(2)} USDT volume</Badge>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span>Deposits: {parseFloat(c.deposits).toFixed(2)}</span>
                      <span>Withdrawals: {parseFloat(c.withdrawals).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No chain activity yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
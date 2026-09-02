'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { walletsApi, ordersApi, tradesApi, notificationsApi, publicApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowDownToLine, ArrowUpFromLine, PlusCircle, Bell } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: balances, isLoading: balLoading } = useQuery({
    queryKey: ['balances'],
    queryFn: walletsApi.getBalances,
  });

  const { data: openOrders } = useQuery({
    queryKey: ['my-open-orders'],
    queryFn: () => ordersApi.getMyOpenOrders(),
  });

  const { data: recentTrades } = useQuery({
    queryKey: ['recent-trades'],
    queryFn: () => tradesApi.getMyTrades(1, 5),
  });

  const { data: unreadCountRaw } = useQuery({
    queryKey: ['unread-count'],
    queryFn: notificationsApi.getUnreadCount,
  });
  // Defensive: backend may return a bare number OR an object like { count: N }
  // depending on the endpoint. Always coerce to a number before rendering.
  const unreadCount =
    typeof unreadCountRaw === 'number'
      ? unreadCountRaw
      : (unreadCountRaw as any)?.count ?? 0;

  const { data: markets } = useQuery({
    queryKey: ['markets'],
    queryFn: publicApi.getMarkets,
  });

  const totalUsd = balances
    ? Object.values(
        balances as Record<string, { internalBalance?: string; available?: string; onchainBalance?: string }>,
      ).reduce((sum, b) => {
        const raw =
          parseFloat(b?.internalBalance ?? '0') ||
          parseFloat(b?.available ?? '0') ||
          parseFloat(b?.onchainBalance ?? '0') ||
          0;
        return sum + (Number.isFinite(raw) ? raw : 0);
      }, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">Welcome back, {user?.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/deposit">
            <Button className="gap-2">
              <ArrowDownToLine className="h-4 w-4" /> Deposit
            </Button>
          </Link>
          <Link href="/withdraw">
            <Button variant="outline" className="gap-2">
              <ArrowUpFromLine className="h-4 w-4" /> Withdraw
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
          </CardHeader>
          <CardContent>
            {balLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <div className="text-2xl font-bold">${totalUsd.toFixed(2)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Array.isArray(openOrders) ? openOrders.length : 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentTrades?.total ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">{unreadCount ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Asset balances + Open orders */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Asset Balances</CardTitle>
          </CardHeader>
          <CardContent>
            {balLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : balances && Object.keys(balances).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(balances as Record<string, { onchainBalance: string; internalBalance: string }>).map(
                  ([symbol, bal]) => (
                    <div
                      key={symbol}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3"
                    >
                      <div>
                        <div className="font-semibold">{symbol}</div>
                        <div className="text-xs text-muted-foreground">
                          On-chain: {parseFloat(bal.onchainBalance || '0').toFixed(6)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {parseFloat(bal.internalBalance || '0').toFixed(6)}
                        </div>
                        <Link href="/wallet" className="text-xs text-primary hover:underline">
                          View Wallet
                        </Link>
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">No balances yet</p>
                <Link href="/deposit">
                  <Button size="sm" className="gap-2">
                    <ArrowDownToLine className="h-4 w-4" /> Make a Deposit
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTrades && recentTrades.data && recentTrades.data.length > 0 ? (
              <div className="space-y-2">
                {recentTrades.data.map((trade) => (
                  <div
                    key={trade.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-sm"
                  >
                    <div>
                      <span className="font-medium">
                        {parseFloat(trade.quantity).toFixed(6)} {trade.baseToken}
                      </span>
                      <span className="ml-2 text-muted-foreground">@{trade.price}</span>
                    </div>
                    <Badge variant="green">{trade.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <PlusCircle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No trades yet</p>
                <Link href="/trade">
                  <Button size="sm">Start Trading</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Markets */}
      <Card>
        <CardHeader>
          <CardTitle>Markets</CardTitle>
        </CardHeader>
        <CardContent>
          {markets && markets.length > 0 ? (
            <div className="space-y-2">
              {markets.map((m) => (
                <div
                  key={m.symbol}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-sm"
                >
                  <span className="font-medium">{m.symbol}</span>
                  <span>{m.lastPrice ? `$${parseFloat(m.lastPrice).toFixed(2)}` : '—'}</span>
                  <span
                    className={
                      m.priceChangePercent && parseFloat(m.priceChangePercent) >= 0
                        ? 'text-bid-green'
                        : 'text-ask-red'
                    }
                  >
                    {m.priceChangePercent ? `${parseFloat(m.priceChangePercent).toFixed(2)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Markets loading or not yet configured...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
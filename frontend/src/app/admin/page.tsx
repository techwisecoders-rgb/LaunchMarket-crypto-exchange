'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Wallet, ArrowDownToLine, ArrowUpFromLine, Activity } from 'lucide-react';

interface ChainStatusItem {
  chain: string;
  lastPolledBlock: number | null;
  status: string;
}

interface TokenBalanceItem {
  token: string;
  chain: string;
  totalOnchain: string;
  totalInternal: string;
}

interface RecentDepositItem {
  id: string;
  amount: string;
  token: string;
  status: string;
  txHash: string;
}

interface RecentWithdrawalItem {
  id: string;
  amount: string;
  token: string;
  status: string;
  address: string;
}

interface RecentTradeItem {
  id: string;
  quantity: string;
  price: string;
  baseToken: string;
  quoteToken: string;
  chain: string;
  status: string;
}

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalTrades: number;
  totalVolume: string;
  totalFees: string;
  recentDeposits: RecentDepositItem[];
  recentWithdrawals: RecentWithdrawalItem[];
  recentTrades: RecentTradeItem[];
  chainStatus: ChainStatusItem[];
  tokenBalances: TokenBalanceItem[];
}

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminApi.dashboard,
  });

  const stats = [
    { label: 'Total Users', value: data?.totalUsers ?? 0, icon: Users },
    { label: 'Deposits', value: data?.totalDeposits ?? 0, icon: ArrowDownToLine },
    { label: 'Withdrawals', value: data?.totalWithdrawals ?? 0, icon: ArrowUpFromLine },
    { label: 'Trades Executed', value: data?.totalTrades ?? 0, icon: Activity },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-muted-foreground">Platform health and activity at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Trade Volume</p>
            <p className="text-2xl font-bold text-success">
              {parseFloat(data?.totalVolume ?? '0').toFixed(2)} USDT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Fees Collected</p>
            <p className="text-2xl font-bold text-sidra-gold">
              {parseFloat(data?.totalFees ?? '0').toFixed(6)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chain status */}
      <Card>
        <CardHeader>
          <CardTitle>Blockchain Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data?.chainStatus?.map((c: ChainStatusItem) => (
              <div key={c.chain} className="flex items-center justify-between rounded-lg border border-border/40 p-3 text-sm">
                <span className="font-medium">{c.chain}</span>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    Last block: {c.lastPolledBlock ?? '—'}
                  </span>
                  <Badge variant={c.status === 'SYNCED' ? 'green' : c.status === 'POLLING' ? 'outline' : 'destructive'}>
                    {c.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Token reserves */}
      <Card>
        <CardHeader>
          <CardTitle>Token Reserves (All Wallets)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 font-medium">Token</th>
                  <th className="pb-3 font-medium">Chain</th>
                  <th className="pb-3 font-medium">On-chain Balance</th>
                  <th className="pb-3 font-medium">Internal Balance</th>
                </tr>
              </thead>
              <tbody>
                {data?.tokenBalances?.map((t: TokenBalanceItem, i: number) => (
                  <tr key={`${t.token}-${t.chain}-${i}`} className="border-b border-border/30">
                    <td className="py-3 font-medium">{t.token}</td>
                    <td className="py-3 text-muted-foreground">{t.chain}</td>
                    <td className="py-3">{parseFloat(t.totalOnchain).toFixed(6)}</td>
                    <td className="py-3">{parseFloat(t.totalInternal).toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recent Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentDeposits?.length ? (
              <div className="space-y-2">
                {data.recentDeposits.map((d: RecentDepositItem, i: number) => (
                  <div key={i} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{parseFloat(d.amount).toFixed(6)} {d.token}</span>
                      <Badge variant={d.status === 'CONFIRMED' ? 'green' : 'outline'}>{d.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{d.txHash}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No recent deposits</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Withdrawals</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentWithdrawals?.length ? (
              <div className="space-y-2">
                {data.recentWithdrawals.map((w: RecentWithdrawalItem, i: number) => (
                  <div key={i} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{parseFloat(w.amount).toFixed(6)} {w.token}</span>
                      <Badge variant={w.status === 'COMPLETED' ? 'green' : 'outline'}>{w.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{w.address}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No recent withdrawals</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Trades</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentTrades?.length ? (
              <div className="space-y-2">
                {data.recentTrades.map((t: RecentTradeItem, i: number) => (
                  <div key={i} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">
                        {parseFloat(t.quantity).toFixed(6)} {t.baseToken}
                      </span>
                      <Badge variant="green">COMPLETED</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      @ {parseFloat(t.price).toFixed(2)} {t.quoteToken} · {t.chain}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No recent trades</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
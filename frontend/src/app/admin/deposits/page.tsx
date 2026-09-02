'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface AdminDepositItem {
  id: string;
  userEmail?: string;
  txHash: string;
  chain: string;
  token: string;
  amount: string;
  status: string;
  confirmations: number;
  createdAt: string;
}

export default function AdminDepositsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-deposits'],
    queryFn: () => adminApi.listDeposits(1, 50),
  });

  const badgeVariant = (status: string) =>
    status === 'CONFIRMED' ? 'green' : status === 'PENDING' ? 'outline' : status === 'FAILED' ? 'destructive' : 'warning';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Deposits</h1>
        <p className="text-muted-foreground">Blockchain deposits across all users</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : data && data.data && data.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">User</th>
                    <th className="pb-3 font-medium">Token</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Confirmations</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Tx Hash</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((d: AdminDepositItem) => (
                    <tr key={d.id} className="border-b border-border/30">
                      <td className="py-3">{d.userEmail ?? '—'}</td>
                      <td className="py-3 font-medium">{d.token}</td>
                      <td className="py-3">{parseFloat(d.amount).toFixed(6)}</td>
                      <td className="py-3 text-muted-foreground">{d.chain}</td>
                      <td className="py-3 text-muted-foreground">{d.confirmations}</td>
                      <td className="py-3">
                        <Badge variant={badgeVariant(d.status)}>{d.status}</Badge>
                      </td>
                      <td className="max-w-[140px] truncate py-3 font-mono text-xs text-muted-foreground">
                        {d.txHash}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No deposits yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
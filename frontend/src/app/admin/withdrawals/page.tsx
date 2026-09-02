'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface AdminWithdrawalItem {
  id: string;
  userEmail?: string;
  chain: string;
  token: string;
  address: string;
  amount: string;
  fee: string;
  status: string;
  txHash: string | null;
  createdAt: string;
}

export default function AdminWithdrawalsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawals'],
    queryFn: () => adminApi.listWithdrawals(1, 50),
  });

  const badgeVariant = (status: string) =>
    status === 'COMPLETED' ? 'green' : status === 'PENDING' || status === 'APPROVED' ? 'outline' : status === 'REJECTED' || status === 'FAILED' ? 'destructive' : 'warning';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Withdrawals</h1>
        <p className="text-muted-foreground">Withdrawal requests from all users</p>
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
                    <th className="pb-3 font-medium">Fee</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Address</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((w: AdminWithdrawalItem) => (
                    <tr key={w.id} className="border-b border-border/30">
                      <td className="py-3">{w.userEmail ?? '—'}</td>
                      <td className="py-3 font-medium">{w.token}</td>
                      <td className="py-3">{parseFloat(w.amount).toFixed(6)}</td>
                      <td className="py-3 text-muted-foreground">{parseFloat(w.fee).toFixed(6)}</td>
                      <td className="py-3 text-muted-foreground">{w.chain}</td>
                      <td className="py-3">
                        <Badge variant={badgeVariant(w.status)}>{w.status}</Badge>
                      </td>
                      <td className="max-w-[140px] truncate py-3 font-mono text-xs text-muted-foreground">
                        {w.address}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(w.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No withdrawals yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
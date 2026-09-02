'use client';

import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface AdminTradeItem {
  id: string;
  buyerEmail?: string;
  sellerEmail?: string;
  baseToken: string;
  quoteToken: string;
  chain: string;
  quantity: string;
  price: string;
  total: string;
  fee: string;
  status: string;
  executedAt: string;
}

export default function AdminTradesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-trades'],
    queryFn: () => adminApi.listTrades(1, 50),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Trades</h1>
        <p className="text-muted-foreground">Every executed trade on the exchange</p>
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
                    <th className="pb-3 font-medium">Buyer</th>
                    <th className="pb-3 font-medium">Seller</th>
                    <th className="pb-3 font-medium">Pair</th>
                    <th className="pb-3 font-medium">Qty</th>
                    <th className="pb-3 font-medium">Price</th>
                    <th className="pb-3 font-medium">Total</th>
                    <th className="pb-3 font-medium">Fee</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((t: AdminTradeItem) => (
                    <tr key={t.id} className="border-b border-border/30">
                      <td className="py-3">{t.buyerEmail ?? '—'}</td>
                      <td className="py-3">{t.sellerEmail ?? '—'}</td>
                      <td className="py-3 font-medium">
                        {t.baseToken}/{t.quoteToken}
                      </td>
                      <td className="py-3">{parseFloat(t.quantity).toFixed(6)}</td>
                      <td className="py-3">
                        {parseFloat(t.price).toFixed(2)} {t.quoteToken}
                      </td>
                      <td className="py-3">
                        {parseFloat(t.total).toFixed(2)} {t.quoteToken}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {parseFloat(t.fee).toFixed(6)} {t.baseToken}
                      </td>
                      <td className="py-3">
                        <Badge variant="green">{t.status}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(t.executedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No trades yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
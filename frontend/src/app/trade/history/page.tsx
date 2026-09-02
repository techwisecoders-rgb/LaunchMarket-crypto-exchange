'use client';

import { useQuery } from '@tanstack/react-query';
import { tradesApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function TradeHistoryPage() {
  const { data: trades, isLoading } = useQuery({
    queryKey: ['trade-history'],
    queryFn: () => tradesApi.getMyTrades(1, 100),
  });

  const badgeVariant = (status: string) =>
    status === 'COMPLETED' ? 'green' : status === 'FAILED' ? 'destructive' : 'outline';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trade History</h1>
        <p className="text-muted-foreground">All executed trades involving your account</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : trades && trades.data && trades.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Pair</th>
                    <th className="pb-3 font-medium">Side</th>
                    <th className="pb-3 font-medium">Quantity</th>
                    <th className="pb-3 font-medium">Price</th>
                    <th className="pb-3 font-medium">Total</th>
                    <th className="pb-3 font-medium">Fee</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.data.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/30">
                      <td className="py-3 font-medium">
                        {trade.baseToken}/{trade.quoteToken}
                      </td>
                      <td className="py-3">
                        <Badge variant={trade.buyerId === trade.sellerId ? 'outline' : 'green'}>
                          {trade.buyerId ? 'BUY' : 'SELL'}
                        </Badge>
                      </td>
                      <td className="py-3">{parseFloat(trade.quantity).toFixed(6)}</td>
                      <td className="py-3">
                        {parseFloat(trade.price).toFixed(2)} {trade.quoteToken}
                      </td>
                      <td className="py-3">
                        {parseFloat(trade.total).toFixed(2)} {trade.quoteToken}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {parseFloat(trade.fee).toFixed(6)} {trade.baseToken}
                      </td>
                      <td className="py-3 text-muted-foreground">{trade.chain}</td>
                      <td className="py-3">
                        <Badge variant={badgeVariant(trade.status)}>{trade.status}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(trade.executedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">
              No trades yet. Head to the Trade page to get started.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
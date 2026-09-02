'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const statusTabs = ['ALL', 'OPEN', 'PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const;

export default function OrdersPage() {
  const [tab, setTab] = useState<(typeof statusTabs)[number]>('ALL');
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders', tab],
    queryFn: () => ordersApi.getMyOrders(tab === 'ALL' ? undefined : tab, 1, 50),
  });

  const cancelOrder = useMutation({
    mutationFn: (orderId: string) => ordersApi.cancelOrder(orderId),
    onSuccess: () => {
      toast.success('Order cancelled');
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel order');
    },
  });

  const respondCounter = useMutation({
    mutationFn: ({ orderId, accept, price }: { orderId: string; accept: boolean; price?: string }) =>
      ordersApi.respondCounterOffer(orderId, accept, price),
    onSuccess: (_, vars) => {
      toast.success(vars.accept ? 'Counter offer accepted — trade executed' : 'Counter offer rejected');
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to respond');
    },
  });

  const badgeVariant = (status: string) =>
    status === 'COMPLETED'
      ? 'green'
      : status === 'CANCELLED' || status === 'REJECTED'
        ? 'destructive'
        : status === 'OPEN'
          ? 'default'
          : 'outline';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Manage your marketplace orders</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['my-orders'] })}
        >
          <RotateCcw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {statusTabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : orders && orders.data && orders.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Pair</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Quantity</th>
                    <th className="pb-3 font-medium">Price</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.map((order) => (
                    <tr key={order.id} className="border-b border-border/30">
                      <td className="py-3">
                        <Badge variant={order.type === 'SELL' ? 'red' : 'green'}>{order.type}</Badge>
                      </td>
                      <td className="py-3 font-medium">
                        {order.baseToken}/{order.quoteToken}
                      </td>
                      <td className="py-3 text-muted-foreground">{order.chain}</td>
                      <td className="py-3">{parseFloat(order.quantity).toFixed(6)}</td>
                      <td className="py-3">
                        {parseFloat(order.price).toFixed(2)} {order.quoteToken}
                      </td>
                      <td className="py-3">
                        <Badge variant={badgeVariant(order.status)}>{order.status}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        {order.status === 'OPEN' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => cancelOrder.mutate(order.id)}
                            disabled={cancelOrder.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                        {order.status === 'PENDING' && order.counterPartyId && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => respondCounter.mutate({ orderId: order.id, accept: true })}
                              disabled={respondCounter.isPending}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => respondCounter.mutate({ orderId: order.id, accept: false })}
                              disabled={respondCounter.isPending}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No orders found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
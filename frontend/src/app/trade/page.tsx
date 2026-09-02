'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ordersApi, publicApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Plus, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

const sellSchema = z.object({
  quantity: z.string().min(1, 'Quantity is required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
  price: z.string().min(1, 'Price is required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
});

const counterSchema = z.object({
  price: z.string().min(1, 'Price is required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
});

type SellForm = z.infer<typeof sellSchema>;
type CounterForm = z.infer<typeof counterSchema>;

function TradeContent() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const symbol = params.get('symbol') || 'ETH/USDT';
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState('');
  const [viewingOrder, setViewingOrder] = useState<string | null>(null);
  const [counterTarget, setCounterTarget] = useState<string | null>(null);

  const { data: pairs } = useQuery({
    queryKey: ['trading-pairs'],
    queryFn: () => publicApi.getTradingPairs(true),
  });

  const { data: openOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['open-orders', symbol],
    queryFn: () => ordersApi.getOpenOrders(symbol),
  });

  const createOrder = useMutation({
    mutationFn: (data: { type: string; baseToken: string; quoteToken: string; chain: string; quantity: string; price: string }) =>
      ordersApi.createOrder(data),
    onSuccess: () => {
      toast.success('Sell order created');
      queryClient.invalidateQueries({ queryKey: ['open-orders'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to create order';
      toast.error(message);
    },
  });

  const acceptOrder = useMutation({
    mutationFn: (orderId: string) => ordersApi.acceptOrder(orderId),
    onSuccess: () => {
      toast.success('Order accepted — trade executed');
      queryClient.invalidateQueries({ queryKey: ['open-orders'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to accept order';
      toast.error(message);
    },
  });

  const counterOffer = useMutation({
    mutationFn: ({ orderId, price }: { orderId: string; price: string }) =>
      ordersApi.counterOffer(orderId, price),
    onSuccess: () => {
      toast.success('Counter offer sent');
      setCounterTarget(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to send counter offer';
      toast.error(message);
    },
  });

  const sellForm = useForm<SellForm>({ resolver: zodResolver(sellSchema) });
  const counterForm = useForm<CounterForm>({ resolver: zodResolver(counterSchema) });

  const filteredPairs = pairs?.filter((p) =>
    p.symbol.toLowerCase().includes(search.toLowerCase()),
  );

  const base = symbol.split('/')[0];

  const onSellSubmit = (data: SellForm) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const pair = pairs?.find((p) => p.symbol === symbol);
    if (!pair) return;
    createOrder.mutate({
      type: 'SELL',
      baseToken: pair.baseToken,
      quoteToken: pair.quoteToken,
      chain: pair.chain,
      quantity: data.quantity,
      price: data.price,
    });
    sellForm.reset();
  };

  const onCounterSubmit = (data: CounterForm) => {
    if (counterTarget) {
      counterOffer.mutate({ orderId: counterTarget, price: data.price });
    }
  };

  return (
    <div className="crypto-grid-bg min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="exchange-container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sidra-blue to-sidra-gold text-xs font-bold text-white">S</div>
            <span className="font-bold">SIDRA<span className="text-sidra-gold"> EXCHANGE</span></span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/markets" className="text-muted-foreground hover:text-foreground">Markets</Link>
            <Link href="/trade" className="font-medium text-primary">Trade</Link>
            {isAuthenticated ? (
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="text-muted-foreground hover:text-foreground">Log In</Link>
                <Link href="/register" className="text-muted-foreground hover:text-foreground">Sign Up</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="exchange-container py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr_320px]">
          {/* Left: Pair selector */}
          <Card className="lg:self-start">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Trading Pairs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search pairs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-[500px] space-y-1 overflow-y-auto">
                {filteredPairs?.map((pair) => (
                  <button
                    key={pair.symbol}
                    onClick={() => router.push(`/trade?symbol=${pair.symbol}`)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                      pair.symbol === symbol
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <span>{pair.symbol}</span>
                    <span className="text-xs text-muted-foreground">{pair.chain}</span>
                  </button>
                ))}
                {!filteredPairs?.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No pairs match</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Center: Open orders */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Open Orders — {symbol}</CardTitle>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : openOrders && Array.isArray(openOrders) && openOrders.length > 0 ? (
                  <div className="space-y-2">
                    {openOrders.map((order: any) => (
                      <div
                        key={order.id}
                        className="rounded-lg border border-border/60 p-4 transition-colors hover:border-primary/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {parseFloat(order.quantity).toFixed(6)} {order.baseToken}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              @ {parseFloat(order.price).toFixed(2)} {order.quoteToken}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                if (!isAuthenticated) { router.push('/login'); return; }
                                acceptOrder.mutate(order.id);
                              }}
                              disabled={acceptOrder.isPending}
                            >
                              {acceptOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buy'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => {
                                if (!isAuthenticated) { router.push('/login'); return; }
                                setCounterTarget(order.id);
                                setViewingOrder(order.id);
                              }}
                            >
                              <MessageSquare className="h-3 w-3" /> Counter
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Chain: {order.chain}</span>
                          <span>Total: {(parseFloat(order.quantity) * parseFloat(order.price)).toFixed(2)} {order.quoteToken}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">No open orders for {symbol}</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      Be the first to create a sell order!
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Create order + counter */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Sell {base}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={sellForm.handleSubmit(onSellSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Quantity ({base})</Label>
                    <Input
                      placeholder="0.0"
                      disabled={createOrder.isPending}
                      {...sellForm.register('quantity')}
                    />
                    {sellForm.formState.errors.quantity && (
                      <p className="text-sm text-destructive">
                        {sellForm.formState.errors.quantity.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Price (USDT)</Label>
                    <Input
                      placeholder="0.0"
                      disabled={createOrder.isPending}
                      {...sellForm.register('price')}
                    />
                    {sellForm.formState.errors.price && (
                      <p className="text-sm text-destructive">
                        {sellForm.formState.errors.price.message}
                      </p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={createOrder.isPending}>
                    {createOrder.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create Sell Order
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    You set the price. Buyers accept or counter.
                  </p>
                </form>
              </CardContent>
            </Card>

            {counterTarget && (
              <Card className="border-sidra-gold/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Counter Offer</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={counterForm.handleSubmit(onCounterSubmit)} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Your Price (USDT)</Label>
                      <Input
                        placeholder="0.0"
                        disabled={counterOffer.isPending}
                        {...counterForm.register('price')}
                      />
                      {counterForm.formState.errors.price && (
                        <p className="text-sm text-destructive">
                          {counterForm.formState.errors.price.message}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={counterOffer.isPending}
                      >
                        {counterOffer.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Send Counter'
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setCounterTarget(null);
                          setViewingOrder(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  return (
    <Suspense>
      <TradeContent />
    </Suspense>
  );
}
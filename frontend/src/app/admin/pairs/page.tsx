'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type TradingPair } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';

const defaultPair = {
  symbol: '',
  baseToken: 'SIDRA',
  quoteToken: 'USDT',
  chain: 'BASE',
  enabled: true,
  minOrderSize: '0.000001',
  maxOrderSize: '1000000',
  priceDecimals: 6,
  quantityDecimals: 6,
  makerFee: 0,
  takerFee: 0,
};

export default function AdminPairsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultPair);

  const { data: pairs, isLoading } = useQuery({
    queryKey: ['admin-pairs'],
    queryFn: () => settingsApi.getTradingPairs(false),
  });

  const toggle = useMutation({
    mutationFn: ({ symbol, enabled }: { symbol: string; enabled: boolean }) =>
      settingsApi.setTradingPairStatus(symbol, enabled),
    onSuccess: () => {
      toast.success('Trading pair updated');
      queryClient.invalidateQueries({ queryKey: ['admin-pairs'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update pair'),
  });

  const create = useMutation({
    mutationFn: () => settingsApi.upsertTradingPair(form),
    onSuccess: () => {
      toast.success('Trading pair created');
      setShowForm(false);
      setForm(defaultPair);
      queryClient.invalidateQueries({ queryKey: ['admin-pairs'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to create pair'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Pairs</h1>
          <p className="text-muted-foreground">Enable, disable, and add new trading pairs</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" /> New Pair
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Symbol</Label>
                <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="SIDRA-USDT" />
              </div>
              <div className="space-y-1.5">
                <Label>Base Token</Label>
                <Input value={form.baseToken} onChange={(e) => setForm({ ...form, baseToken: e.target.value })} placeholder="SIDRA" />
              </div>
              <div className="space-y-1.5">
                <Label>Quote Token</Label>
                <Input value={form.quoteToken} onChange={(e) => setForm({ ...form, quoteToken: e.target.value })} placeholder="USDT" />
              </div>
              <div className="space-y-1.5">
                <Label>Chain</Label>
                <Input value={form.chain} onChange={(e) => setForm({ ...form, chain: e.target.value })} placeholder="BASE" />
              </div>
              <div className="space-y-1.5">
                <Label>Min Order Size</Label>
                <Input value={form.minOrderSize} onChange={(e) => setForm({ ...form, minOrderSize: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Order Size</Label>
                <Input value={form.maxOrderSize} onChange={(e) => setForm({ ...form, maxOrderSize: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Price Decimals</Label>
                <Input type="number" value={form.priceDecimals} onChange={(e) => setForm({ ...form, priceDecimals: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Quantity Decimals</Label>
                <Input type="number" value={form.quantityDecimals} onChange={(e) => setForm({ ...form, quantityDecimals: Number(e.target.value) })} />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.symbol} className="gap-2">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Create Pair
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : pairs && pairs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Symbol</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Min</th>
                    <th className="pb-3 font-medium">Max</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p: TradingPair) => (
                    <tr key={p.id} className="border-b border-border/30">
                      <td className="py-3 font-medium">
                        {p.baseToken}/{p.quoteToken}
                      </td>
                      <td className="py-3 text-muted-foreground">{p.chain}</td>
                      <td className="py-3">{parseFloat(p.minOrderSize).toFixed(6)}</td>
                      <td className="py-3">{parseFloat(p.maxOrderSize).toFixed(2)}</td>
                      <td className="py-3">
                        <Badge variant={p.enabled ? 'green' : 'outline'}>{p.enabled ? 'ENABLED' : 'DISABLED'}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant={p.enabled ? 'destructive' : 'default'}
                          onClick={() => toggle.mutate({ symbol: p.symbol, enabled: !p.enabled })}
                          disabled={toggle.isPending}
                        >
                          {p.enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No trading pairs found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
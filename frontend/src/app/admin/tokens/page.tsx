'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type TokenConfig } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';

interface TokenForm {
  symbol: string;
  name: string;
  chains: string[];
  contractAddress: string;
  decimals: number;
  minDeposit: string;
  minWithdrawal: string;
  withdrawalFeePercentage: number;
  isNative: boolean;
  enabled: boolean;
}

const defaultToken: TokenForm = {
  symbol: 'SIDRA',
  name: 'SIDRA Token',
  chains: ['BASE'],
  contractAddress: '',
  decimals: 18,
  minDeposit: '0.000001',
  minWithdrawal: '0.000001',
  withdrawalFeePercentage: 0,
  isNative: false,
  enabled: true,
};

export default function AdminTokensPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultToken);

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['admin-tokens'],
    queryFn: settingsApi.getTokens,
  });

  const toggle = useMutation({
    mutationFn: ({ symbol, enabled }: { symbol: string; enabled: boolean }) =>
      settingsApi.setTokenStatus(symbol, enabled),
    onSuccess: () => {
      toast.success('Token updated');
      queryClient.invalidateQueries({ queryKey: ['admin-tokens'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to update token'),
  });

  const create = useMutation({
    mutationFn: () => settingsApi.upsertToken(form),
    onSuccess: () => {
      toast.success('Token added');
      setShowForm(false);
      setForm(defaultToken);
      queryClient.invalidateQueries({ queryKey: ['admin-tokens'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Failed to add token'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Token Configuration</h1>
          <p className="text-muted-foreground">Add SIDRA or any new token without code changes</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          <Plus className="h-4 w-4" /> New Token
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Symbol</Label>
                <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} placeholder="SIDRA" />
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SIDRA Token" />
              </div>
              <div className="space-y-1.5">
                <Label>Decimals</Label>
                <Input type="number" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Withdrawal Fee %</Label>
                <Input type="number" step="0.01" min="0" value={form.withdrawalFeePercentage} onChange={(e) => setForm({ ...form, withdrawalFeePercentage: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Contract Address</Label>
                <Input value={form.contractAddress} onChange={(e) => setForm({ ...form, contractAddress: e.target.value })} placeholder="0x... (leave empty for native)" />
              </div>
              <div className="space-y-1.5">
                <Label>Min Deposit</Label>
                <Input value={form.minDeposit} onChange={(e) => setForm({ ...form, minDeposit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Min Withdrawal</Label>
                <Input value={form.minWithdrawal} onChange={(e) => setForm({ ...form, minWithdrawal: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Chains</Label>
                <div className="flex gap-4 pt-1">
                  {['ETHEREUM', 'BASE'].map((c) => (
                    <Label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={form.chains.includes(c)}
                        onChange={() =>
                          setForm((prev) => ({
                            ...prev,
                            chains: prev.chains.includes(c)
                              ? prev.chains.filter((x) => x !== c)
                              : [...prev.chains, c],
                          }))
                        }
                      />
                      {c}
                    </Label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-4">
              <Label className="flex items-center gap-2 text-sm">
                <Input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.isNative}
                  onChange={(e) => setForm({ ...form, isNative: e.target.checked })}
                />
                Native Coin
              </Label>
            </div>
            <div className="mt-4">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.symbol} className="gap-2">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Add Token
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
          ) : tokens && tokens.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">Token</th>
                    <th className="pb-3 font-medium">Chains</th>
                    <th className="pb-3 font-medium">Contract</th>
                    <th className="pb-3 font-medium">Min Deposit</th>
                    <th className="pb-3 font-medium">Min Withdrawal</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t: TokenConfig) => (
                    <tr key={t.symbol} className="border-b border-border/30">
                      <td className="py-3">
                        <div className="font-medium">{t.symbol}</div>
                        <div className="text-xs text-muted-foreground">{t.name}</div>
                      </td>
                      <td className="py-3 text-muted-foreground">{t.chains.join(', ')}</td>
                      <td className="max-w-[160px] truncate py-3 font-mono text-xs text-muted-foreground">
                        {t.isNative ? 'Native' : t.contractAddress ?? '—'}
                      </td>
                      <td className="py-3 text-muted-foreground">{t.minDeposit ?? '—'}</td>
                      <td className="py-3 text-muted-foreground">{t.minWithdrawal ?? '—'}</td>
                      <td className="py-3">
                        <Badge variant={t.enabled ? 'green' : 'outline'}>{t.enabled ? 'ACTIVE' : 'DISABLED'}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant={t.enabled ? 'destructive' : 'default'}
                          onClick={() => toggle.mutate({ symbol: t.symbol, enabled: !t.enabled })}
                          disabled={toggle.isPending}
                        >
                          {t.enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No tokens configured</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
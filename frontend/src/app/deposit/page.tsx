'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { walletsApi, depositsApi, publicApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DepositPage() {
  const { data: wallets, isLoading } = useQuery({ queryKey: ['wallets'], queryFn: walletsApi.getMyWallets });
  const { data: deposits } = useQuery({ queryKey: ['deposits'], queryFn: () => depositsApi.getMyDeposits(1, 20) });
  const { data: tokens } = useQuery({ queryKey: ['tokens'], queryFn: publicApi.getTokens });

  const [chain, setChain] = useState<'ETHEREUM' | 'BASE'>('ETHEREUM');
  const [copied, setCopied] = useState<string | null>(null);

  const wallet = wallets?.find((w) => w.chain === chain || w.chain === chain.toLowerCase());

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Address copied');
  };

  const activeTokens = tokens?.filter((t) => t.enabled && t.chains.includes(chain.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deposit</h1>
        <p className="text-muted-foreground">Send funds to your unique deposit address</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deposit Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(['ETHEREUM', 'BASE'] as const).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={chain === c ? 'default' : 'outline'}
                  onClick={() => setChain(c)}
                >
                  {c}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : wallet ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Your {wallet.chain} deposit address
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">
                      {wallet.address}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copy(wallet.address, wallet.id)}>
                      {copied === wallet.id ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Minimum deposits</p>
                  {activeTokens?.map((t) => (
                    <div key={t.symbol} className="mt-1 flex justify-between">
                      <span>{t.symbol}</span>
                      <span>{t.minDeposit}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-xs">
                    Deposits below the minimum will be ignored. Confirmations are tracked
                    automatically before crediting.
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Wallet not ready yet. Please refresh shortly.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deposit History</CardTitle>
          </CardHeader>
          <CardContent>
            {deposits && deposits.data && deposits.data.length > 0 ? (
              <div className="space-y-2">
                {deposits.data.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {parseFloat(d.amount).toFixed(6)} {d.token}
                      </span>
                      <Badge
                        variant={
                          d.status === 'CONFIRMED'
                            ? 'green'
                            : d.status === 'PENDING'
                              ? 'outline'
                              : 'destructive'
                        }
                      >
                        {d.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span className="truncate">{d.txHash}</span>
                      <span>{d.confirmations} confs</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No deposits yet. Your first deposit will appear here automatically.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
'use client';

import { useQuery } from '@tanstack/react-query';
import { walletsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function WalletPage() {
  const { data: wallets, isLoading } = useQuery({
    queryKey: ['wallets'],
    queryFn: walletsApi.getMyWallets,
  });
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Address copied');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallets</h1>
        <p className="text-muted-foreground">Your deposit addresses on each chain</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : wallets && wallets.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {wallets.map((wallet) => (
            <Card key={wallet.id} className="border-border/60">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{wallet.chain}</CardTitle>
                <Badge variant={wallet.status === 'ACTIVE' ? 'green' : 'outline'}>
                  {wallet.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Deposit Address
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

                {wallet.tokenBalances && wallet.tokenBalances.length > 0 && (
                  <div className="space-y-2">
                    {wallet.tokenBalances.map((tb) => (
                      <div
                        key={tb.token}
                        className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">
                          {tb.token}{' '}
                          <span className="text-xs text-muted-foreground">({tb.chain})</span>
                        </span>
                        <div className="text-right">
                          <div>{parseFloat(tb.onchainBalance).toFixed(6)}</div>
                          <div className="text-xs text-muted-foreground">
                            Available: {parseFloat(tb.available).toFixed(6)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => (window.location.href = '/deposit')}
                  >
                    Deposit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => (window.location.href = '/withdraw')}
                  >
                    Withdraw
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Wallets are being provisioned for your account. Please refresh in a moment.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
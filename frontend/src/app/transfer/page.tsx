'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transfersApi, walletsApi, type Transfer } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

const OTHER_EMAIL = 'perumallasuryakowshik11@gmail.com';

export default function TransferPage() {
  const queryClient = useQueryClient();
  const [recipientEmail, setRecipientEmail] = useState(OTHER_EMAIL);
  const [chain, setChain] = useState<'ETHEREUM' | 'BASE'>('ETHEREUM');
  const [token, setToken] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const { data: balancesData } = useQuery({
    queryKey: ['balances'],
    queryFn: walletsApi.getBalances,
  });
  const available = balancesData?.[token]?.available ?? '0';

  const { data: history, isLoading } = useQuery({
    queryKey: ['my-transfers'],
    queryFn: () => transfersApi.history(1, 50),
  });

  const transfer = useMutation({
    mutationFn: () =>
      transfersApi.create({
        recipientEmail,
        chain,
        token,
        amount,
        note: note || undefined,
      }),
    onSuccess: (res) => {
      toast.success(
        `Sent ${res.amount} ${res.token} to ${res.recipient.email}. New balance: ${res.senderBalanceAfter}`,
      );
      setAmount('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['my-transfers'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Transfer failed'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!recipientEmail) {
      toast.error('Enter recipient email');
      return;
    }
    transfer.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Internal Transfer</h1>
          <p className="text-muted-foreground">
            Send funds to another LaunchMarket user instantly (no on-chain tx).
          </p>
        </div>
        <ArrowLeftRight className="h-8 w-8 text-primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Send</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="recipient">Recipient email</Label>
                <Input
                  id="recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Chain</Label>
                  <Select value={chain} onChange={(e) => setChain(e.target.value as 'ETHEREUM' | 'BASE')}>
                    <option value="ETHEREUM">Ethereum Sepolia</option>
                    <option value="BASE">Base Sepolia</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Token</Label>
                  <Select value={token} onChange={(e) => setToken(e.target.value)}>
                    <option value="ETH">ETH</option>
                    <option value="USDT">USDT</option>
                    <option value="USDC">USDC</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.0000001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Available on {chain}: <strong>{parseFloat(available).toFixed(6)} {token}</strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Lunch, rent, etc."
                  maxLength={500}
                />
              </div>

              <Button type="submit" disabled={transfer.isPending} className="w-full">
                {transfer.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Send {amount || '0'} {token} → {recipientEmail}</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent transfers</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : history?.data && history.data.length > 0 ? (
              <div className="space-y-2">
                {history.data.slice(0, 10).map((t: Transfer) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-border/40 p-3 text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.direction === 'OUT' ? 'destructive' : 'green'}>
                          {t.direction === 'OUT' ? 'Sent' : 'Received'}
                        </Badge>
                        <span className="font-medium">
                          {parseFloat(t.amount).toFixed(6)} {t.token}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.direction === 'OUT' ? 'to' : 'from'} {t.counterparty} · {t.chain}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transfers yet. Make your first one →
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        <Link href="/dashboard" className="hover:underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
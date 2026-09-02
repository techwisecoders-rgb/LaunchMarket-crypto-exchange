'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface WalletRow {
  userId: string;
  userEmail: string;
  chain: string;
  address: string;
  status: string;
  balances: { token: string; balance: string }[];
}

export default function AdminWalletsPage() {
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [chain, setChain] = useState('ETHEREUM');
  const [token, setToken] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-wallets', search],
    queryFn: () => adminApi.walletMonitoring(),
  });

  const credit = useMutation({
    mutationFn: () =>
      adminApi.adjustBalance({
        userId,
        chain,
        token,
        amount,
        type: 'CREDIT',
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('Balance credited');
      setUserId('');
      setAmount('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-wallets'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Credit failed'),
  });

  const debit = useMutation({
    mutationFn: () =>
      adminApi.adjustBalance({
        userId,
        chain,
        token,
        amount,
        type: 'DEBIT',
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('Balance debited');
      setUserId('');
      setAmount('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-wallets'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : 'Debit failed'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet Monitoring</h1>
        <p className="text-muted-foreground">View all wallets and adjust balances manually</p>
      </div>

      {/* Manual credit/debit */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Credit / Debit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>User ID</Label>
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" />
            </div>
            <div className="space-y-1.5">
              <Label>Chain</Label>
              <Select value={chain} onChange={(e) => setChain(e.target.value)}>
                <option value="ETHEREUM">Ethereum Sepolia (Testnet)</option>
                <option value="BASE">Base Sepolia (Testnet)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Token</Label>
              <Select value={token} onChange={(e) => setToken(e.target.value)}>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="SIDRA">SIDRA</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" type="number" step="any" min="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => credit.mutate()}
              disabled={credit.isPending || !userId || !amount || Number(amount) <= 0}
            >
              {credit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Credit'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => debit.mutate()}
              disabled={debit.isPending || !userId || !amount || Number(amount) <= 0}
            >
              {debit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Debit'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Wallet list */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : data && data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-3 font-medium">User</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Address</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Balances</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((w: WalletRow, idx: number) => (
                    <tr key={`${w.userId}-${w.chain}-${idx}`} className="border-b border-border/30">
                      <td className="py-3">{w.userEmail}</td>
                      <td className="py-3 text-muted-foreground">{w.chain}</td>
                      <td className="max-w-[160px] truncate py-3 font-mono text-xs text-muted-foreground">
                        {w.address}
                      </td>
                      <td className="py-3">
                        <Badge variant={w.status === 'ACTIVE' ? 'green' : 'outline'}>{w.status}</Badge>
                      </td>
                      <td className="py-3 text-xs">
                        {w.balances?.map((b) => (
                          <span key={b.token} className="mr-2">
                            {parseFloat(b.balance).toFixed(4)} {b.token}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">
              {search ? 'No wallets match your search' : 'No wallets found'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
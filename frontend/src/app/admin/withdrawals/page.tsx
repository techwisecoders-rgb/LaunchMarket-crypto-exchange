'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface PendingWithdrawal {
  id: string;
  userId: string;
  userEmail: string;
  chain: string;
  token: string;
  amount: string;
  address: string;
  status: string;
  createdAt: string;
}

export default function AdminWithdrawalsPage() {
  const queryClient = useQueryClient();
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-pending-withdrawals'],
    queryFn: () => adminApi.listPendingWithdrawals(1, 100),
    refetchInterval: 10000,
  });

  const completeMutation = useMutation({
    mutationFn: ({
      requestId,
      txHash,
      note,
    }: {
      requestId: string;
      txHash: string;
      note?: string;
    }) => adminApi.completeWithdrawal(requestId, txHash, note),
    onSuccess: () => {
      toast.success('Withdrawal marked as completed');
      setCompletingId(null);
      setTxHash('');
      setAdminNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-pending-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to complete withdrawal';
      toast.error(message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      adminApi.rejectWithdrawal(requestId, reason),
    onSuccess: () => {
      toast.success('Withdrawal rejected and funds refunded');
      setRejectingId(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-pending-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to reject withdrawal';
      toast.error(message);
    },
  });

  const handleComplete = (requestId: string) => {
    const trimmed = txHash.trim();
    if (!/^0x([A-Fa-f0-9]{64})$/.test(trimmed)) {
      toast.error('txHash must be a 0x-prefixed 66-character Ethereum transaction hash');
      return;
    }
    completeMutation.mutate({
      requestId,
      txHash: trimmed,
      note: adminNote.trim() || undefined,
    });
  };

  const handleReject = (requestId: string) => {
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error('Please provide a rejection reason');
      return;
    }
    rejectMutation.mutate({ requestId, reason });
  };

  const badgeVariant = (status: string) => {
    if (status === 'COMPLETED') return 'green';
    if (status === 'PROCESSING' || status === 'OTP_VERIFIED' || status === 'PENDING')
      return 'warning';
    if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED')
      return 'destructive';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manual Withdrawals</h1>
        <p className="text-muted-foreground">
          OTP-verified withdrawals waiting for an admin to broadcast the on-chain transaction
        </p>
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
                    <th className="pb-3 font-medium">User</th>
                    <th className="pb-3 font-medium">Chain</th>
                    <th className="pb-3 font-medium">Token</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Destination</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Requested</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((w: PendingWithdrawal) => (
                    <tr key={w.id} className="border-b border-border/30 align-top">
                      <td className="py-3">
                        <div className="font-medium">{w.userEmail}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {w.userId}
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">{w.chain}</td>
                      <td className="py-3 font-medium">{w.token}</td>
                      <td className="py-3">{parseFloat(w.amount).toFixed(6)}</td>
                      <td className="max-w-[200px] truncate py-3 font-mono text-xs text-muted-foreground">
                        {w.address}
                      </td>
                      <td className="py-3">
                        <Badge variant={badgeVariant(w.status)}>{w.status}</Badge>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(w.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-2">
                          {completingId === w.id ? (
                            <div className="space-y-2 rounded-md border border-border/60 p-3">
                              <div className="space-y-1">
                                <Label htmlFor={`tx-${w.id}`} className="text-xs">
                                  On-chain tx hash
                                </Label>
                                <Input
                                  id={`tx-${w.id}`}
                                  placeholder="0x..."
                                  value={txHash}
                                  onChange={(e) => setTxHash(e.target.value)}
                                  className="h-8 font-mono text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`note-${w.id}`} className="text-xs">
                                  Note (optional)
                                </Label>
                                <Input
                                  id={`note-${w.id}`}
                                  placeholder="Internal note"
                                  value={adminNote}
                                  onChange={(e) => setAdminNote(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="success"
                                  disabled={completeMutation.isPending}
                                  onClick={() => handleComplete(w.id)}
                                >
                                  {completeMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                  )}
                                  <span className="ml-1">Confirm</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={completeMutation.isPending}
                                  onClick={() => {
                                    setCompletingId(null);
                                    setTxHash('');
                                    setAdminNote('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : rejectingId === w.id ? (
                            <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                              <div className="space-y-1">
                                <Label htmlFor={`reason-${w.id}`} className="text-xs">
                                  Rejection reason
                                </Label>
                                <Input
                                  id={`reason-${w.id}`}
                                  placeholder="Why is this being rejected?"
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={rejectMutation.isPending}
                                  onClick={() => handleReject(w.id)}
                                >
                                  {rejectMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <XCircle className="h-3 w-3" />
                                  )}
                                  <span className="ml-1">Confirm reject</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={rejectMutation.isPending}
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => {
                                  setCompletingId(w.id);
                                  setRejectingId(null);
                                  setTxHash('');
                                  setAdminNote('');
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span className="ml-1">Complete</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setRejectingId(w.id);
                                  setCompletingId(null);
                                  setRejectReason('');
                                }}
                              >
                                <XCircle className="h-3 w-3" />
                                <span className="ml-1">Reject</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">
              No pending manual withdrawals
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

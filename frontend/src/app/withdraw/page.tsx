'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { withdrawalsApi, publicApi, walletsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';

const withdrawSchema = z.object({
  token: z.string().min(1, 'Select a token'),
  chain: z.string().min(1, 'Select a chain'),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Enter a valid wallet address'),
  amount: z.string().min(1, 'Amount is required').refine((v) => parseFloat(v) > 0, 'Must be positive'),
});

const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

type WithdrawForm = z.infer<typeof withdrawSchema>;
type OtpForm = z.infer<typeof otpSchema>;

export default function WithdrawPage() {
  const queryClient = useQueryClient();
  const { data: tokens } = useQuery({ queryKey: ['tokens'], queryFn: publicApi.getTokens });
  const { data: wallets } = useQuery({ queryKey: ['wallets'], queryFn: walletsApi.getMyWallets });
  const { data: withdrawals } = useQuery({
    queryKey: ['withdrawals'],
    queryFn: () => withdrawalsApi.getMyWithdrawals(1, 20),
  });

  const [requestId, setRequestId] = useState<string | null>(null);
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const withdrawForm = useForm<WithdrawForm>({ resolver: zodResolver(withdrawSchema) });
  const otpForm = useForm<OtpForm>({ resolver: zodResolver(otpSchema) });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startResendTimer = () => {
    setResendTimer(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1 && timerRef.current) clearInterval(timerRef.current);
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
  };

  const requestWithdrawal = useMutation({
    mutationFn: (data: WithdrawForm) => withdrawalsApi.createWithdrawal(data),
    onSuccess: (res) => {
      setRequestId(res.id);
      setAwaitingOtp(true);
      startResendTimer();
      toast.success('Verification code sent to your email');
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to request withdrawal';
      toast.error(message);
    },
  });

  const confirmWithdrawal = useMutation({
    mutationFn: ({ requestId, otp }: { requestId: string; otp: string }) =>
      withdrawalsApi.confirmWithdrawal(requestId, otp),
    onSuccess: () => {
      toast.success('Withdrawal submitted — awaiting admin processing');
      setAwaitingOtp(false);
      setRequestId(null);
      otpForm.reset();
      withdrawForm.reset();
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to confirm withdrawal';
      toast.error(message);
    },
  });

  const resendOtp = useMutation({
    mutationFn: (id: string) => withdrawalsApi.resendOtp(id),
    onSuccess: () => {
      toast.success('OTP resent');
      startResendTimer();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to resend OTP';
      toast.error(message);
    },
  });

  const onRequest = (data: WithdrawForm) => {
    requestWithdrawal.mutate(data);
  };

  const onConfirmOtp = (data: OtpForm) => {
    if (requestId) confirmWithdrawal.mutate({ requestId, otp: data.otp });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Withdraw</h1>
        <p className="text-muted-foreground">Send funds to an external wallet</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{awaitingOtp ? 'Enter Verification Code' : 'Withdrawal Details'}</CardTitle>
          </CardHeader>
          <CardContent>
            {!awaitingOtp ? (
              <form onSubmit={withdrawForm.handleSubmit(onRequest)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Token</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={requestWithdrawal.isPending}
                      {...withdrawForm.register('token')}
                    >
                      <option value="">Select token</option>
                      {tokens?.map((t) => (
                        <option key={t.symbol} value={t.symbol}>
                          {t.symbol}
                        </option>
                      ))}
                    </select>
                    {withdrawForm.formState.errors.token && (
                      <p className="text-sm text-destructive">
                        {withdrawForm.formState.errors.token.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Network</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={requestWithdrawal.isPending}
                      {...withdrawForm.register('chain')}
                    >
                      <option value="">Select network</option>
                      <option value="ETHEREUM">Ethereum Sepolia (Testnet)</option>
                      <option value="BASE">Base Sepolia (Testnet)</option>
                    </select>
                    {withdrawForm.formState.errors.chain && (
                      <p className="text-sm text-destructive">
                        {withdrawForm.formState.errors.chain.message}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Destination Address</Label>
                  <Input
                    placeholder="0x..."
                    disabled={requestWithdrawal.isPending}
                    {...withdrawForm.register('address')}
                  />
                  {withdrawForm.formState.errors.address && (
                    <p className="text-sm text-destructive">
                      {withdrawForm.formState.errors.address.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    placeholder="0.0"
                    disabled={requestWithdrawal.isPending}
                    {...withdrawForm.register('amount')}
                  />
                  {withdrawForm.formState.errors.amount && (
                    <p className="text-sm text-destructive">
                      {withdrawForm.formState.errors.amount.message}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={requestWithdrawal.isPending}>
                  {requestWithdrawal.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Request Withdrawal
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  A 6-digit code will be emailed to you to confirm this withdrawal.
                </p>
              </form>
            ) : (
              <form onSubmit={otpForm.handleSubmit(onConfirmOtp)} className="space-y-4">
                <div className="rounded-lg border border-border/40 p-3 text-sm text-muted-foreground">
                  <p>
                    A 6-digit code was sent to your email. It expires in{' '}
                    <span className="font-medium text-foreground">5 minutes</span>.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Verification Code</Label>
                  <Input
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    className="text-center text-lg tracking-[0.5em]"
                    disabled={confirmWithdrawal.isPending}
                    {...otpForm.register('otp')}
                  />
                  {otpForm.formState.errors.otp && (
                    <p className="text-sm text-destructive">
                      {otpForm.formState.errors.otp.message}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={confirmWithdrawal.isPending}>
                  {confirmWithdrawal.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Confirm Withdrawal'
                  )}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setAwaitingOtp(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={resendTimer > 0 || resendOtp.isPending}
                    onClick={() => requestId && resendOtp.mutate(requestId)}
                    className="text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resendTimer > 0
                      ? `Resend in ${resendTimer}s`
                      : resendOtp.isPending
                        ? 'Sending...'
                        : 'Resend code'}
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Withdrawal History</CardTitle>
          </CardHeader>
          <CardContent>
            {withdrawals && withdrawals.data && withdrawals.data.length > 0 ? (
              <div className="space-y-2">
                {withdrawals.data.map((w) => (
                  <div key={w.id} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {parseFloat(w.amount).toFixed(6)} {w.token}
                      </span>
                      <Badge
                        variant={
                          w.status === 'COMPLETED'
                            ? 'green'
                            : w.status === 'PENDING' || w.status === 'PROCESSING'
                              ? 'outline'
                              : 'destructive'
                        }
                      >
                        {w.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span className="truncate">{w.address}</span>
                      <span>Fee: {parseFloat(w.fee).toFixed(6)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No withdrawals yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
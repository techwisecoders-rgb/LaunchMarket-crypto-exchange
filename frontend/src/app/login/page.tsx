'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const otpSchema = z.object({
  code: z
    .string()
    .min(6, 'Code must be 6 digits')
    .max(6, 'Code must be 6 digits')
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

type LoginForm = z.infer<typeof loginSchema>;
type OtpForm = z.infer<typeof otpSchema>;

export default function LoginPage() {
  const { loginWithOtp } = useAuth();
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [logoutBanner, setLogoutBanner] = useState<string | null>(null);
  const credentialsRef = useRef<LoginForm | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Show a one-shot banner if the user was logged out by the inactivity or
  // absolute-expiry timer. The reason is stashed in sessionStorage by the
  // AuthProvider just before redirecting.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reason = window.sessionStorage.getItem('sidra_logout_reason');
    if (reason) {
      setLogoutBanner(reason);
      window.sessionStorage.removeItem('sidra_logout_reason');
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerOtp,
    handleSubmit: handleOtpSubmit,
    setValue: setOtpValue,
    formState: { errors: otpErrors },
  } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: '' },
  });

  const startResendCountdown = (seconds: number) => {
    setResendSeconds(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const onSubmitCredentials = async (data: LoginForm) => {
    setSubmitting(true);
    try {
      credentialsRef.current = data;
      const result = await loginWithOtp(data);
      if (result.status === 'OTP_REQUIRED') {
        setStep('otp');
        startResendCountdown(result.resendAfterSec);
        toast.success('Verification code sent to your email');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitOtp = async (data: OtpForm) => {
    if (!credentialsRef.current) return;
    setSubmitting(true);
    try {
      const result = await loginWithOtp(credentialsRef.current, data.code);
      if (result.status === 'SUCCESS') {
        toast.success('Welcome back to LAUNCHMARKET CRYPTO EXCHANGE');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired code';
      toast.error(message);
      setOtpValue('code', '');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!credentialsRef.current || resendSeconds > 0) return;
    try {
      const result = await loginWithOtp(credentialsRef.current);
      if (result.status === 'OTP_REQUIRED') {
        startResendCountdown(result.resendAfterSec);
        toast.success('A new verification code has been sent');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not resend code';
      toast.error(message);
    }
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    if (timerRef.current) clearInterval(timerRef.current);
    setResendSeconds(0);
    setOtpValue('code', '');
  };

  if (step === 'otp') {
    return (
      <AuthLayout
        title="Verify It's You"
        subtitle="Enter the 6-digit code we just emailed you"
      >
        {logoutBanner && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {logoutBanner}
          </div>
        )}
        <div className="mb-4 flex items-center justify-center text-primary">
          <MailCheck className="h-10 w-10" />
        </div>
        <form onSubmit={handleOtpSubmit(onSubmitOtp)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              autoComplete="one-time-code"
              disabled={submitting}
              className="text-center text-lg tracking-[0.4em]"
              {...registerOtp('code')}
            />
            {otpErrors.code && (
              <p className="text-sm text-destructive">{otpErrors.code.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Log In'}
          </Button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          {resendSeconds > 0 ? (
            <span className="text-muted-foreground">
              Resend code in <span className="font-medium text-foreground">{resendSeconds}s</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting}
              className="font-medium text-primary hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          )}
          <button
            type="button"
            onClick={handleBackToCredentials}
            className="text-muted-foreground hover:text-foreground hover:underline"
          >
            Back to login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Log In" subtitle="Access your LAUNCHMARKET CRYPTO EXCHANGE account">
      {logoutBanner && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {logoutBanner}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmitCredentials)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            disabled={submitting}
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={submitting}
              className="pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
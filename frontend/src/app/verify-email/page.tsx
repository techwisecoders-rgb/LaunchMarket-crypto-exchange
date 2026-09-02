'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { AuthLayout } from '@/components/auth/auth-layout';
import { Loader2, MailCheck, Send } from 'lucide-react';

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (token) {
      authApi
        .verifyEmail(token)
        .then(() => {
          setVerified(true);
          toast.success('Email verified successfully!');
        })
        .catch(() => {
          toast.error('Verification failed. Please try again.');
        })
        .finally(() => setVerifying(false));
    } else {
      setVerifying(false);
    }
  }, [token]);

  const resend = async () => {
    setSending(true);
    try {
      await authApi.resendVerification();
      toast.success('Verification email sent. Check your inbox.');
    } catch {
      toast.error('Failed to resend. Wait a moment and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout title="Email Verification" subtitle="Verify your email to secure your account">
      {verifying ? (
        <div className="flex flex-col items-center py-8 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Verifying your email...</p>
        </div>
      ) : verified ? (
        <div className="flex flex-col items-center py-8 text-center">
          <MailCheck className="h-12 w-12 text-success" />
          <h2 className="mt-4 text-lg font-semibold">You're all set!</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your email has been verified. You can now log in and start trading.
          </p>
          <Link href="/login" className="mt-6 inline-block w-full">
            <Button className="w-full">Go to Log In</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <Send className="h-12 w-12 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">Verify your email</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a verification link to your inbox. Click it to activate your account,
            or resend the email below.
          </p>
          <Button className="mt-6 w-full" variant="outline" onClick={resend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resend Verification Email'}
          </Button>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Back to Log In
          </button>
        </div>
      )}
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
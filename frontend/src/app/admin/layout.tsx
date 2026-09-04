'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN'))) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading || !user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xs uppercase tracking-widest text-sidra-gold">Admin Console</h1>
          <p className="text-sm text-muted-foreground">LAUNCHMARKET CRYPTO EXCHANGE · {user.role.replace('_', ' ')}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
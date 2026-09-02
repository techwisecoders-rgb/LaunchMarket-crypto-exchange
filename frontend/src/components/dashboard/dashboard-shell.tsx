'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  ListOrdered,
  History,
  Settings,
  Shield,
  Bell,
  LogOut,
  BarChart3,
  Users,
  Globe2,
  Activity,
  Coins,
  PiggyBank,
  Gem,
  ScrollText,
  TrendingUp,
  User,
  Menu,
  X,
  FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const userNav: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/wallet', label: 'Wallets', icon: Wallet },
  { href: '/deposit', label: 'Deposit', icon: ArrowDownToLine },
  { href: '/withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { href: '/orders', label: 'Orders', icon: ListOrdered },
  { href: '/trade/history', label: 'History', icon: History },
  { href: '/settings', label: 'Profile & Settings', icon: Settings },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/security', label: 'Security', icon: Shield },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

const adminNav: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { href: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
  { href: '/admin/trades', label: 'Trades', icon: BarChart3, adminOnly: true },
  { href: '/admin/deposits', label: 'Deposits', icon: ArrowDownToLine, adminOnly: true },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine, adminOnly: true },
  { href: '/admin/wallets', label: 'Wallets', icon: Wallet, adminOnly: true },
  { href: '/admin/fees', label: 'Fees', icon: PiggyBank, adminOnly: true },
  { href: '/admin/pairs', label: 'Trading Pairs', icon: Coins, adminOnly: true },
  { href: '/admin/blockchain', label: 'Blockchain', icon: Globe2, adminOnly: true },
  { href: '/admin/tokens', label: 'Tokens', icon: Gem, adminOnly: true },
  { href: '/admin/logs', label: 'Logs', icon: Activity, adminOnly: true },
  { href: '/admin/audit', label: 'Audit', icon: ScrollText, adminOnly: true },
  { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp, adminOnly: true },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-card/50 backdrop-blur-md lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sidra-blue to-sidra-gold text-sm font-bold text-white">
              S
            </div>
            <span className="text-lg font-bold tracking-tight">
              SIDRA<span className="text-sidra-gold"> EXCHANGE</span>
            </span>
          </Link>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400"
            title="This deployment runs on Sepolia & Base Sepolia testnets. No real funds."
          >
            <FlaskConical className="h-3 w-3" /> Testnet
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          {userNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </p>
              {adminNav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidra-gold/10 text-sidra-gold'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="border-t border-border/60 p-3">
          <div className="mb-2 rounded-lg bg-accent/50 p-3">
            <p className="truncate text-sm font-medium">{user?.email}</p>
            <p className="text-xs text-muted-foreground">
              {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin' : 'User'}
            </p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={async () => {
              await logout();
              router.push('/login');
            }}
          >
            <LogOut className="h-4 w-4" /> Log Out
          </Button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sidra-blue to-sidra-gold text-xs font-bold text-white">
              S
            </div>
            <span className="font-bold">SIDRA</span>
          </Link>
          <span
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400"
            title="This deployment runs on Sepolia & Base Sepolia testnets."
          >
            <FlaskConical className="h-3 w-3" /> Testnet
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={async () => logout()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside
            className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-border/60 bg-background p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="space-y-1">
              <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Account
              </p>
              {userNav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <>
                  <p className="px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Admin
                  </p>
                  {adminNav.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-sidra-gold/10 text-sidra-gold'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 pt-14 lg:pl-60 lg:pt-0">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
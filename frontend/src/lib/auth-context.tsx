'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, authApi, type UserProfile } from './api';
import { useRealtime } from './use-realtime';
import { socketManager } from './socket';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  /**
   * Two-step login flow with email OTP verification.
   * Returns `{ status: 'OTP_REQUIRED' }` after a successful step 1 so the
   * caller can switch to the OTP entry screen, or completes login when
   * called with a 6-digit code.
   */
  loginWithOtp: (
    credentials: { email: string; password: string },
    code?: string,
  ) => Promise<
    | { status: 'OTP_REQUIRED'; expiresAt: string; resendAfterSec: number }
    | { status: 'SUCCESS' }
  >;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Live-update dashboard balances, deposit history, orders, etc. the
  // moment the backend credits a new testnet deposit. Mounted here so
  // every authenticated route is reactive without each page opting in.
  useRealtime(!!user);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await authApi.getProfile();
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = api.getAccessToken();

    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({
        email,
        password,
      });

      setUser(res.user);
      router.push('/dashboard');
    },
    [router],
  );

  /**
   * Step 1: no `code` provided → request an OTP and return its cooldown info.
   * Step 2: `code` provided → verify it, mint tokens, route to /dashboard.
   */
  const loginWithOtp = useCallback(
    async (
      credentials: { email: string; password: string },
      code?: string,
    ) => {
      if (!code) {
        const otpInfo = await authApi.requestLoginOtp(credentials);
        return {
          status: 'OTP_REQUIRED' as const,
          expiresAt: otpInfo.expiresAt,
          resendAfterSec: otpInfo.resendAfterSec,
        };
      }

      const res = await authApi.verifyLoginOtp({
        email: credentials.email,
        code,
      });
      setUser(res.user);
      router.push('/dashboard');
      return { status: 'SUCCESS' as const };
    },
    [router],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await authApi.register({
        email,
        password,
      });

      router.push('/verify-email');
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      const refreshToken =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('sidra_refresh_token')
          : null;

      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Ignore logout errors
    } finally {
      // Drop the realtime connection so the next user doesn't inherit our
      // socket identity / room subscriptions.
      socketManager.disconnect();

      api.setTokens(null);

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('sidra_refresh_token');
      }

      setUser(null);
      router.push('/login');
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        loginWithOtp,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
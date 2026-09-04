'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
   */
  loginWithOtp: (
    credentials: { email: string; password: string },
    code?: string,
  ) => Promise<
    | { status: 'OTP_REQUIRED'; expiresAt: string; resendAfterSec: number }
    | { status: 'SUCCESS' }
  >;
  register: (email: string, password: string) => Promise<void>;
  logout: (reason?: 'manual' | 'idle' | 'expired') => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Idle session timeout: if no mouse / keyboard / touch / scroll activity
 * for this many ms, force a logout. Default: 15 minutes.
 */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Absolute session lifetime: regardless of activity, force logout after
 * this many ms from the moment the user *successfully* authenticated.
 * Default: 8 hours.
 */
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

const ACTIVITY_EVENTS: string[] = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'visibilitychange',
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const absoluteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggingOutRef = useRef(false);

  // Live-update dashboard balances / deposits / orders via WebSocket.
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

  const logout = useCallback(
    async (reason: 'manual' | 'idle' | 'expired' = 'manual') => {
      // Guard against double-logout (idle timer + manual click same tick).
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;

      try {
        const refreshToken =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('sidra_refresh_token')
            : null;

        if (refreshToken) {
          // Best-effort server-side revocation. Fail silently on network errors.
          await authApi.logout(refreshToken).catch(() => undefined);
        }
      } catch {
        // ignore
      } finally {
        socketManager.disconnect();
        api.setTokens(null);

        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('sidra_refresh_token');
        }

        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        if (absoluteTimerRef.current) {
          clearTimeout(absoluteTimerRef.current);
          absoluteTimerRef.current = null;
        }

        setUser(null);

        if (typeof window !== 'undefined') {
          if (reason === 'idle') {
            window.sessionStorage.setItem(
              'sidra_logout_reason',
              'You were logged out due to inactivity.',
            );
          } else if (reason === 'expired') {
            window.sessionStorage.setItem(
              'sidra_logout_reason',
              'Your session has expired. Please sign in again.',
            );
          } else {
            window.sessionStorage.removeItem('sidra_logout_reason');
          }
        }

        // Hard redirect so cached state, refs, listeners are torn down cleanly.
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        } else {
          router.push('/login');
        }

        isLoggingOutRef.current = false;
      }
    },
    [router],
  );

  // Reset the idle-expiry timer. Called on every user activity.
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (isLoggingOutRef.current) return;
      logout('idle');
    }, IDLE_TIMEOUT_MS);
  }, [logout]);

  // Bind window-level activity listeners to keep session alive.
  useEffect(() => {
    if (!user) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (absoluteTimerRef.current) {
        clearTimeout(absoluteTimerRef.current);
        absoluteTimerRef.current = null;
      }
      return;
    }

    const handler = () => resetIdleTimer();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handler, { passive: true }),
    );
    resetIdleTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [user, resetIdleTimer]);

  useEffect(() => {
    const token = api.getAccessToken();

    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  /**
    Start (or restart) the absolute-expiry timer. Called after every successful
    login / refresh. After ABSOLUTE_TIMEOUT_MS the user is force-logged out
    regardless of activity.
    */
  const startAbsoluteTimer = useCallback(() => {
    if (absoluteTimerRef.current) clearTimeout(absoluteTimerRef.current);
    absoluteTimerRef.current = setTimeout(() => {
      if (isLoggingOutRef.current) return;
      logout('expired');
    }, ABSOLUTE_TIMEOUT_MS);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({ email, password });
      setUser(res.user);
      startAbsoluteTimer();
      router.push('/dashboard');
    },
    [router, startAbsoluteTimer],
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
      startAbsoluteTimer();
      router.push('/dashboard');
      return { status: 'SUCCESS' as const };
    },
    [router, startAbsoluteTimer],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await authApi.register({ email, password });
      router.push('/verify-email');
    },
    [router],
  );

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
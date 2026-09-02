import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getErrorMessage } from './utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_VERSION = '/api/v1';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}${API_VERSION}`,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Attach access token to every request
    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      if (this.accessToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Handle 401 by attempting refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/login') && !original.url?.includes('/auth/register') && !original.url?.includes('/auth/refresh')) {
          original._retry = true;
          try {
            const newToken = await this.refreshAccessToken();
            if (newToken) {
              original.headers.Authorization = `Bearer ${newToken}`;
              return this.client(original);
            }
          } catch {
            // Refresh failed - redirect to login
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
          }
        }
        return Promise.reject(error);
      },
    );
  }

  setTokens(pair: TokenPair | null) {
    this.accessToken = pair?.accessToken ?? null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<string | null> {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : null;
      const refreshToken = storage?.getItem('sidra_refresh_token');
      if (!refreshToken) return null;
      const res = await this.client.post('/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = res.data.data;
      this.accessToken = accessToken;
      storage?.setItem('sidra_refresh_token', newRefresh);
      return accessToken;
    } catch {
      return null;
    }
  }

  async get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
    const res = await this.client.get(url, { params });
    return res.data.data ?? res.data;
  }

  async post<T = any>(url: string, data?: Record<string, any>): Promise<T> {
    const res = await this.client.post(url, data);
    return res.data.data ?? res.data;
  }

  async patch<T = any>(url: string, data?: Record<string, any>): Promise<T> {
    const res = await this.client.patch(url, data);
    return res.data.data ?? res.data;
  }

  async put<T = any>(url: string, data?: Record<string, any>): Promise<T> {
    const res = await this.client.put(url, data);
    return res.data.data ?? res.data;
  }

  async delete<T = any>(url: string): Promise<T> {
    const res = await this.client.delete(url);
    return res.data.data ?? res.data;
  }

  getErrorMessage(error: unknown): string {
    return getErrorMessage(error);
  }
}

export const api = new ApiClient();

// ============================================================
// Type definitions
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  country: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface WalletInfo {
  id: string;
  chain: 'ETHEREUM' | 'BASE';
  address: string;
  walletType: string;
  status: string;
  createdAt: string;
  tokenBalances?: {
    token: string;
    chain: string;
    onchainBalance: string;
    internalBalance: string;
    available: string;
  }[];
}

/**
 * Aggregated per-token balance returned by `GET /wallets/me/balances`.
 * The key in the response object is the token symbol (e.g. "ETH", "USDT").
 */
export interface TokenBalance {
  token: string;
  chain: string;
  onchainBalance: string;
  internalBalance: string;
  available: string;
  locked: string;
  total: string;
}

export type TokenBalances = Record<string, TokenBalance>;

export interface MarketData {
  symbol: string;
  lastPrice: string | null;
  priceChangePercent: string | null;
  high24h: string | null;
  low24h: string | null;
  quoteVolume: string | null;
  baseVolume: string | null;
}

export interface Order {
  id: string;
  type: 'SELL' | 'BUY';
  status: string;
  baseToken: string;
  quoteToken: string;
  chain: string;
  quantity: string;
  price: string;
  counterPartyId?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deposit {
  id: string;
  txHash: string;
  chain: string;
  token: string;
  amount: string;
  status: string;
  confirmations: number;
  createdAt: string;
}

export interface Withdrawal {
  id: string;
  chain: string;
  token: string;
  address: string;
  amount: string;
  fee: string;
  status: string;
  txHash: string | null;
  createdAt: string;
}

export interface Trade {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  baseToken: string;
  quoteToken: string;
  chain: string;
  quantity: string;
  price: string;
  total: string;
  fee: string;
  status: string;
  executedAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface FeeConfig {
  id: string;
  type: string;
  chain: string;
  token: string;
  percentage: number;
  status: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface TokenConfig {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  chains: string[];
  contractAddress: string | null;
  minDeposit: string | null;
  minWithdrawal: string | null;
  withdrawalFeePercentage: number;
  isNative: boolean;
  enabled: boolean;
  icon: string | null;
}

export interface ChainConfig {
  id: string;
  chain: string;
  name: string;
  rpcUrl: string;
  chainId: number;
  blockConfirmations: number;
  pollingIntervalMs: number;
  explorerUrl: string;
  enabled: boolean;
  lastPolledBlock: number | null;
}

export interface TradingPair {
  id: string;
  baseToken: string;
  quoteToken: string;
  chain: string;
  symbol: string;
  enabled: boolean;
  minOrderSize: string;
  maxOrderSize: string;
  priceDecimals: number;
  quantityDecimals: number;
  makerFee: number;
  takerFee: number;
}

// ============================================================
// Public API endpoints
// ============================================================

export const publicApi = {
  getMarkets: () => api.get<MarketData[]>('/settings/trading-pairs'),
  getMarket: (symbol: string) => api.get<MarketData>(`/settings/trading-pairs/${symbol}`),
  getTradingPairs: (enabledOnly = true) =>
    api.get<TradingPair[]>('/settings/trading-pairs', { enabledOnly }),
  getTokens: () => api.get<TokenConfig[]>('/settings/tokens'),
  getPublicSettings: () => api.get<Record<string, string>>('/settings/public'),
  getHealth: () => api.get('/health'),
};

// ============================================================
// Auth API endpoints
// ============================================================

export const authApi = {
  register: (data: { email: string; password: string }) =>
  api.post('/auth/register', data),
  login: async (data: { email: string; password: string }) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: UserProfile }>(
      '/auth/login',
      data,
    );
    api.setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sidra_refresh_token', res.refreshToken);
    }
    return res;
  },
  // Step 1 of the OTP login flow: validate email/password and have the
  // backend email a 6-digit code. Returns the expiry + resend cooldown so
  // the UI can show a countdown / "resend code" timer.
  requestLoginOtp: (data: { email: string; password: string }) =>
    api.post<{ message: string; expiresAt: string; resendAfterSec: number }>(
      '/auth/login/request-otp',
      data,
    ),
  // Step 2 of the OTP login flow: trade the email + 6-digit code for
  // access + refresh tokens. Side-effects mirror `login()` above.
  verifyLoginOtp: async (data: { email: string; code: string }) => {
    const res = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: UserProfile;
    }>('/auth/login/verify-otp', data);
    api.setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sidra_refresh_token', res.refreshToken);
    }
    return res;
  },
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  verifyEmail: (token: string) => api.post('/auth/verify-email', { token }),
  resendVerification: () => api.post('/auth/resend-verification'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  getProfile: () => api.get<UserProfile>('/auth/profile'),
  getSessions: () => api.get('/auth/sessions'),
  revokeSession: (sessionId: string) => api.post(`/auth/sessions/${sessionId}/revoke`),
  revokeAllSessions: () => api.post('/auth/sessions/revoke-all'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// ============================================================
// User API endpoints
// ============================================================

export const usersApi = {
  getMe: () => api.get<UserProfile>('/users/profile'),
  updateProfile: (data: { fullName?: string; phone?: string; country?: string; avatarUrl?: string }) =>
    api.patch('/users/profile', data),
};

// ============================================================
// Wallet API endpoints
// ============================================================

export const walletsApi = {
  getMyWallets: () => api.get<WalletInfo[]>('/wallets/me'),
  getWalletByChain: (chain: string) => api.get<WalletInfo>(`/wallets/me/${chain}`),
  getBalances: () => api.get<TokenBalances>('/wallets/me/balances'),
};

// ============================================================
// Deposit API endpoints
// ============================================================

export const depositsApi = {
  getMyDeposits: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Deposit>>('/deposits/history', { page, limit }),
  getDepositAddress: (chain: string, token: string) =>
    api.get(`/deposits/address/${chain}/${token}`),
};

// ============================================================
// Withdrawal API endpoints
// ============================================================

export const withdrawalsApi = {
  getMyWithdrawals: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Withdrawal>>('/withdrawals/history', { page, limit }),
  createWithdrawal: (data: {
    chain: string;
    token: string;
    address: string;
    amount: string;
  }) => api.post<Withdrawal>('/withdrawals/request', data),
  confirmWithdrawal: (requestId: string, otp: string) =>
    api.post(`/withdrawals/verify`, { requestId, otp }),
  resendOtp: (requestId: string) =>
    api.post(`/withdrawals/${requestId}/resend-otp`),
};

// ============================================================
// Order API endpoints
// ============================================================

export const ordersApi = {
  createOrder: (data: { type: string; baseToken: string; quoteToken: string; chain: string; quantity: string; price: string }) =>
    api.post('/orders/sell', data),
  cancelOrder: (orderId: string) => api.post(`/orders/${orderId}/cancel`),
  getOrder: (orderId: string) => api.get<Order>(`/orders/${orderId}`),
  getMyOrders: (status?: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<Order>>('/orders/my', { status, page, limit }),
  getOpenOrders: (symbol?: string) =>
    api.get<Order[]>('/orders/marketplace', { symbol }),
  getMyOpenOrders: () => api.get<Order[]>('/orders/my', { status: 'OPEN' }),
  acceptOrder: (orderId: string) => api.post(`/orders/${orderId}/accept`),
  counterOffer: (orderId: string, price: string) =>
    api.post(`/orders/${orderId}/counter`, { price }),
  respondCounterOffer: (counterOfferId: string, accept: boolean, price?: string) =>
    api.post(`/orders/counter/${counterOfferId}/respond`, { accept, price }),
  counterAgain: (counterOfferId: string, price: string) =>
    api.post(`/orders/counter/${counterOfferId}/counter`, { price }),
};

// ============================================================
// Trade API endpoints
// ============================================================

export const tradesApi = {
  getMyTrades: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Trade>>('/trades/my', { page, limit }),
  getTradeHistory: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Trade>>('/trades/all', { page, limit }),
  getRecentTrades: () => api.get<Trade[]>('/trades/recent'),
};

// ============================================================
// OTP API endpoints
// ============================================================

export const otpApi = {
  sendEmailOtp: (purpose: string) => api.post('/otp/request', { purpose }),
  verifyOtp: (purpose: string, otp: string) => api.post('/otp/verify', { purpose, otp }),
};

// ============================================================
// Notification API endpoints
// ============================================================

export const notificationsApi = {
  getMyNotifications: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Notification>>('/notifications', { page, limit }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get<number>('/notifications/unread-count'),
};

// ============================================================
// Fees API endpoints (admin)
// ============================================================

export const feesApi = {
  getAll: () => api.get<FeeConfig[]>('/fees'),
  getFee: (type: string, chain: string, token: string) =>
    api.get<FeeConfig>(`/fees/${type}/${chain}/${token}`),
  update: (data: { type: string; chain: string; token: string; percentage: number }) =>
    api.post('/fees/admin/upsert', data),
};

// ============================================================
// Admin API endpoints
// ============================================================

export const adminApi = {
  dashboard: () => api.get('/admin/dashboard'),
  listUsers: (page = 1, limit = 20, search?: string, status?: string) =>
    api.get<PaginatedResponse<UserProfile>>('/admin/users', { page, limit, search, status }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  updateUserStatus: (userId: string, status: string) =>
    api.post(`/admin/users/${userId}/status`, { status }),
  adjustBalance: (data: {
    userId: string;
    chain: string;
    token: string;
    amount: string;
    type: 'CREDIT' | 'DEBIT';
    note?: string;
  }) => api.post('/admin/balance/adjust', data),
  listTrades: (page = 1, limit = 20) => api.get('/admin/trades', { page, limit }),
  listDeposits: (page = 1, limit = 20) => api.get('/admin/deposits', { page, limit }),
  listWithdrawals: (page = 1, limit = 20) => api.get('/admin/withdrawals', { page, limit }),
  systemLogs: (page = 1, limit = 20) => api.get('/admin/audit', { page, limit }),
  walletMonitoring: () => api.get('/admin/wallets'),
  blockchainStatus: () => api.get('/admin/blockchain/status'),
  blockchainTransactions: () => api.get('/admin/blockchain/transactions'),
  analytics: () => api.get('/admin/analytics'),
  auditLogs: (page = 1, limit = 20) => api.get<PaginatedResponse<any>>('/admin/audit', { page, limit }),
};

// ============================================================
// Settings API endpoints (admin)
// ============================================================

export const settingsApi = {
  getTokens: () => api.get<TokenConfig[]>('/settings/tokens'),
  upsertToken: (data: Partial<TokenConfig> & { symbol: string }) => api.post('/settings/tokens', data),
  setTokenStatus: (symbol: string, enabled: boolean) =>
    api.post(`/settings/tokens/${symbol}/status`, { enabled }),
  getChains: () => api.get<ChainConfig[]>('/settings/chains'),
  upsertChain: (data: Partial<ChainConfig> & { chain: string }) => api.post('/settings/chains', data),
  setChainStatus: (chain: string, enabled: boolean) =>
    api.post(`/settings/chains/${chain}/status`, { enabled }),
  getTradingPairs: (enabledOnly = false) =>
    api.get<TradingPair[]>('/settings/trading-pairs', { enabledOnly }),
  upsertTradingPair: (data: Partial<TradingPair> & { symbol: string }) =>
    api.post('/settings/trading-pairs', data),
  setTradingPairStatus: (symbol: string, enabled: boolean) =>
    api.post(`/settings/trading-pairs/${symbol}/status`, { enabled }),
  getSystemSettings: (publicOnly = false) =>
    api.get(publicOnly ? '/settings/public' : '/settings/all'),
  setSetting: (data: { key: string; value: string; category: string; isPublic?: boolean }) =>
    api.post('/settings/system', data),
};
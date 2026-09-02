// ============================================================
// SIDRA EXCHANGE - Shared Types
// Single source of truth for enums, interfaces, and DTOs
// used across backend and frontend
// ============================================================

// ------------------------------------------------------------
// Enums
// ------------------------------------------------------------

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  FROZEN = 'FROZEN',
  BLOCKED = 'BLOCKED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

export enum ChainType {
  ETHEREUM = 'ETHEREUM',
  BASE = 'BASE',
}

export enum TokenSymbol {
  ETH = 'ETH',
  USDT = 'USDT',
  USDC = 'USDC',
  SIDRA = 'SIDRA',
}

export enum WalletType {
  SPOT = 'SPOT',
  FUNDING = 'FUNDING',
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRADE = 'TRADE',
  FEE = 'FEE',
  MANUAL_CREDIT = 'MANUAL_CREDIT',
  MANUAL_DEBIT = 'MANUAL_DEBIT',
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  CONFIRMED = 'CONFIRMED',
}

export enum OrderType {
  SELL = 'SELL',
  BUY = 'BUY',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  COUNTER_OFFERED = 'COUNTER_OFFERED',
}

export enum TradeStatus {
  PENDING = 'PENDING',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum OtpPurpose {
  WITHDRAWAL = 'WITHDRAWAL',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  LOGIN = 'LOGIN',
}

export enum OtpStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  EXPIRED = 'EXPIRED',
  USED = 'USED',
  MAX_ATTEMPTS = 'MAX_ATTEMPTS',
}

export enum NotificationType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRADE = 'TRADE',
  ORDER = 'ORDER',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM',
  ADMIN = 'ADMIN',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP',
  BOTH = 'BOTH',
}

export enum FeeType {
  WITHDRAWAL = 'WITHDRAWAL',
  TRADING = 'TRADING',
  DEPOSIT = 'DEPOSIT',
}

export enum FeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REGISTER = 'REGISTER',
  EMAIL_VERIFY = 'EMAIL_VERIFY',
  PASSWORD_RESET = 'PASSWORD_RESET',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  WITHDRAWAL_OTP = 'WITHDRAWAL_OTP',
  ORDER_CREATE = 'ORDER_CREATE',
  ORDER_CANCEL = 'ORDER_CANCEL',
  ORDER_ACCEPT = 'ORDER_ACCEPT',
  ORDER_COUNTER = 'ORDER_COUNTER',
  TRADE_EXECUTE = 'TRADE_EXECUTE',
  USER_UPDATE = 'USER_UPDATE',
  USER_FREEZE = 'USER_FREEZE',
  USER_BLOCK = 'USER_BLOCK',
  USER_ENABLE = 'USER_ENABLE',
  USER_DISABLE = 'USER_DISABLE',
  MANUAL_CREDIT = 'MANUAL_CREDIT',
  MANUAL_DEBIT = 'MANUAL_DEBIT',
  FEE_UPDATE = 'FEE_UPDATE',
  PAIR_UPDATE = 'PAIR_UPDATE',
  TOKEN_UPDATE = 'TOKEN_UPDATE',
  SETTINGS_UPDATE = 'SETTINGS_UPDATE',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  SESSION_REVOKE = 'SESSION_REVOKE',
  DEVICE_REMOVE = 'DEVICE_REMOVE',
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export enum CounterOfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COUNTERED = 'COUNTERED',
  EXPIRED = 'EXPIRED',
}

export enum BlockchainTxStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REPLACED = 'REPLACED',
}

export enum WalletStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  FROZEN = 'FROZEN',
}

// ============================================================
// WebSocket Event Types
// ============================================================

export enum WsEvent {
  BALANCE_UPDATE = 'balance.update',
  ORDER_UPDATE = 'order.update',
  TRADE_UPDATE = 'trade.update',
  NOTIFICATION = 'notification',
  DEPOSIT_UPDATE = 'deposit.update',
  WITHDRAWAL_UPDATE = 'withdrawal.update',
  MARKET_UPDATE = 'market.update',
  ADMIN_UPDATE = 'admin.update',
  USER_STATUS = 'user.status',
}

export interface WsMessage<T = unknown> {
  event: WsEvent;
  data: T;
  timestamp: number;
}

// ============================================================
// Auth DTOs
// ============================================================

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceName?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface UserDto {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// ============================================================
// Wallet DTOs
// ============================================================

export interface WalletDto {
  id: string;
  userId: string;
  chain: ChainType;
  address: string;
  type: WalletType;
  status: WalletStatus;
  createdAt: string;
}

export interface BalanceDto {
  token: TokenSymbol;
  chain: ChainType;
  available: string;
  locked: string;
  total: string;
  onChain: string;
}

// ============================================================
// Order DTOs
// ============================================================

export interface CreateOrderRequest {
  chain: ChainType;
  token: TokenSymbol;
  quantity: string;
  price: string;
  quoteToken: TokenSymbol;
  expiresInHours?: number;
}

export interface CounterOfferRequest {
  orderId: string;
  price: string;
  quantity: string;
}

export interface OrderDto {
  id: string;
  sellerId: string;
  chain: ChainType;
  token: TokenSymbol;
  quantity: string;
  price: string;
  quoteToken: TokenSymbol;
  status: OrderStatus;
  type: OrderType;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeDto {
  id: string;
  orderId: string;
  sellerId: string;
  buyerId: string;
  chain: ChainType;
  token: TokenSymbol;
  quantity: string;
  price: string;
  total: string;
  fee: string;
  status: TradeStatus;
  executedAt: string;
}

// ============================================================
// Deposit / Withdrawal DTOs
// ============================================================

export interface DepositDto {
  id: string;
  userId: string;
  chain: ChainType;
  token: TokenSymbol;
  amount: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  confirmations: number;
  status: TransactionStatus;
  createdAt: string;
}

export interface WithdrawalRequest {
  chain: ChainType;
  token: TokenSymbol;
  amount: string;
  address: string;
  otp: string;
}

export interface WithdrawalDto {
  id: string;
  userId: string;
  chain: ChainType;
  token: TokenSymbol;
  amount: string;
  fee: string;
  netAmount: string;
  address: string;
  txHash?: string;
  status: TransactionStatus;
  createdAt: string;
}

// ============================================================
// Fee DTOs
// ============================================================

export interface FeeDto {
  id: string;
  type: FeeType;
  chain: ChainType;
  token: TokenSymbol;
  percentage: number;
  fixedAmount?: string;
  minAmount?: string;
  status: FeeStatus;
  updatedAt: string;
}

// ============================================================
// Notification DTOs
// ============================================================

export interface NotificationDto {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ============================================================
// Admin DTOs
// ============================================================

export interface AdminUserDto extends UserDto {
  wallets: WalletDto[];
  totalDeposits: string;
  totalWithdrawals: string;
  totalTrades: number;
}

export interface SystemStatsDto {
  totalUsers: number;
  activeUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalTrades: number;
  totalVolume: string;
  openOrders: number;
  pendingWithdrawals: number;
}

// ============================================================
// Market DTOs
// ============================================================

export interface MarketDto {
  chain: ChainType;
  token: TokenSymbol;
  quoteToken: TokenSymbol;
  lastPrice: string;
  change24h: string;
  volume24h: string;
  high24h: string;
  low24h: string;
  openOrders: number;
}

// ============================================================
// Pagination
// ============================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================
// API Response Wrapper
// ============================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

// ============================================================
// WebSocket Client Events
// ============================================================

export interface WsClientEvents {
  [WsEvent.BALANCE_UPDATE]: (data: BalanceUpdatePayload) => void;
  [WsEvent.ORDER_UPDATE]: (data: OrderUpdatePayload) => void;
  [WsEvent.TRADE_UPDATE]: (data: TradeUpdatePayload) => void;
  [WsEvent.NOTIFICATION]: (data: NotificationDto) => void;
  [WsEvent.DEPOSIT_UPDATE]: (data: DepositDto) => void;
  [WsEvent.WITHDRAWAL_UPDATE]: (data: WithdrawalDto) => void;
  [WsEvent.MARKET_UPDATE]: (data: MarketUpdatePayload) => void;
  [WsEvent.ADMIN_UPDATE]: (data: AdminUpdatePayload) => void;
  [WsEvent.USER_STATUS]: (data: UserStatusPayload) => void;
}

export interface BalanceUpdatePayload {
  userId: string;
  chain: ChainType;
  token: TokenSymbol;
  available: string;
  locked: string;
  total: string;
}

export interface OrderUpdatePayload {
  orderId: string;
  status: OrderStatus;
  userId: string;
}

export interface TradeUpdatePayload {
  tradeId: string;
  orderId: string;
  status: TradeStatus;
  userIds: string[];
}

export interface MarketUpdatePayload {
  pair: string;
  lastPrice: string;
  change24h: string;
  volume24h: string;
}

export interface AdminUpdatePayload {
  type: string;
  message: string;
  data?: unknown;
}

export interface UserStatusPayload {
  userId: string;
  status: UserStatus;
}

// ============================================================
// Error Codes
// ============================================================

export enum ErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  USER_BLOCKED = 'USER_BLOCKED',
  USER_FROZEN = 'USER_FROZEN',
  USER_DISABLED = 'USER_DISABLED',
  INVALID_OTP = 'INVALID_OTP',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS = 'OTP_MAX_ATTEMPTS',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  BELOW_MINIMUM = 'BELOW_MINIMUM',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_NOT_AVAILABLE = 'ORDER_NOT_AVAILABLE',
  CANNOT_ACCEPT_OWN_ORDER = 'CANNOT_ACCEPT_OWN_ORDER',
  RATE_LIMITED = 'RATE_LIMITED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  WITHDRAWAL_DISABLED = 'WITHDRAWAL_DISABLED',
  DEPOSIT_DISABLED = 'DEPOSIT_DISABLED',
  TRADING_DISABLED = 'TRADING_DISABLED',
  DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',
  REPLAY_ATTACK = 'REPLAY_ATTACK',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  NONCE_MISMATCH = 'NONCE_MISMATCH',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
}

// ============================================================
// Configuration Types
// ============================================================

export interface TokenConfig {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  chains: ChainType[];
  contractAddresses: Partial<Record<ChainType, string>>;
  minDeposit: Partial<Record<ChainType, string>>;
  minWithdrawal: Partial<Record<ChainType, string>>;
  withdrawalFee: Partial<Record<ChainType, string>>;
  enabled: boolean;
  isNative: boolean;
}

export interface ChainConfig {
  chain: ChainType;
  name: string;
  rpcUrl: string;
  chainId: number;
  blockConfirmations: number;
  pollingIntervalMs: number;
  explorerUrl: string;
  enabled: boolean;
}

export interface TradingPairConfig {
  id: string;
  baseToken: TokenSymbol;
  quoteToken: TokenSymbol;
  chain: ChainType;
  enabled: boolean;
  minOrderSize: string;
  maxOrderSize: string;
  priceDecimals: number;
  quantityDecimals: number;
}
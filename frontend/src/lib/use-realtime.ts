'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { socketManager } from './socket';
import { api } from './api';

/**
 * Real-time bridge for the current authenticated user.
 *
 * On mount:
 *  - Connects the global SocketManager using the current access token.
 *  - Emits the `subscribe` message for each user channel
 *    (`wallets`, `orders`, `trades`, `notifications`).
 *  - On every server-pushed event, invalidates the matching React Query
 *    keys so any open dashboard/wallet/deposit page refetches and shows
 *    the new data within a second — no manual reload required.
 *
 * On unmount the socket is kept alive (the SocketManager is a singleton
 * used by other parts of the app), but all subscriptions are cleaned up
 * so we don't leak listeners across user sessions.
 */
export function useRealtime(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const token = api.getAccessToken();
    if (!token) return;

    // Open (or reuse) the socket connection and pass the JWT so the
    // server can join our `user:<id>` room.
    socketManager.connect(token);

    const channels = ['wallets', 'orders', 'trades', 'notifications', 'market'];
    for (const channel of channels) {
      socketManager.emit('subscribe', { channel });
    }

    // -------- Event handlers --------
    const onBalanceUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    };

    const onDepositReceived = (data: {
      chain?: string;
      token?: string;
      amount?: string;
      status?: string;
    }) => {
      queryClient.invalidateQueries({ queryKey: ['deposits'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });

      // Only toast on the moment the deposit is actually credited, not on
      // the initial PENDING notification (otherwise the user gets two
      // toasts for the same deposit).
      if (data?.status === 'COMPLETED' && data.amount && data.token) {
        const chainLabel =
          data.chain === 'BASE' ? 'Base Sepolia' : 'Ethereum Sepolia';
        toast.success(
          `${data.amount} ${data.token} credited to your ${chainLabel} wallet`,
        );
      }
    };

    const onWithdrawalUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    };

    const onOrderEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['my-open-orders'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      queryClient.invalidateQueries({ queryKey: ['open-orders'] });
    };

    const onTradeEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['recent-trades'] });
      queryClient.invalidateQueries({ queryKey: ['my-trades'] });
      queryClient.invalidateQueries({ queryKey: ['trade-history'] });
    };

    const onNotification = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    };

    const unsubBalance = socketManager.subscribe('balance:update', onBalanceUpdate);
    const unsubDepositReceived = socketManager.subscribe('deposit:received', onDepositReceived);
    const unsubWithdrawalUpdate = socketManager.subscribe('withdrawal:update', onWithdrawalUpdate);
    const unsubOrderCreated = socketManager.subscribe('order:created', onOrderEvent);
    const unsubOrderUpdated = socketManager.subscribe('order:updated', onOrderEvent);
    const unsubOrderCancelled = socketManager.subscribe('order:cancelled', onOrderEvent);
    const unsubTradeExecuted = socketManager.subscribe('trade:executed', onTradeEvent);
    const unsubNotification = socketManager.subscribe('notification:new', onNotification);

    return () => {
      unsubBalance();
      unsubDepositReceived();
      unsubWithdrawalUpdate();
      unsubOrderCreated();
      unsubOrderUpdated();
      unsubOrderCancelled();
      unsubTradeExecuted();
      unsubNotification();

      // Unsubscribe from server-side channels so the next user (or a
      // logout/login cycle) doesn't share our stale subscriptions.
      for (const channel of channels) {
        socketManager.emit('unsubscribe', { channel });
      }
    };
  }, [enabled, queryClient]);
}
import { httpsCallable } from 'firebase/functions';
import { firebaseEnabled, functions } from './firebase';

export interface CircleWalletSummary {
  walletReady: boolean;
  walletId?: string;
  walletAddress?: string;
  blockchain?: string;
  accountType?: 'SCA' | 'EOA';
  usdcBalance?: string;
  lockedBalance?: string;
  availableBalance?: string;
  balanceUpdatedAt?: unknown;
  tokenBalances?: unknown[];
  created?: boolean;
}

export interface PaidLikeResult {
  liked: boolean;
  charged: boolean;
  amount: string;
  status: string;
  likes?: number;
  lockedBalance?: string;
  availableBalance?: string;
  sessionId?: string;
}

export interface TestUsdcTransferResult {
  transferId: string;
  transactionId?: string;
  status: string;
}

function requireFunctions() {
  if (!firebaseEnabled || !functions) {
    throw new Error('Firebase Functions are not configured.');
  }

  return functions;
}

export const walletApi = {
  async ensureCircleWallet(): Promise<CircleWalletSummary> {
    const callable = httpsCallable<void, CircleWalletSummary>(requireFunctions(), 'ensureCircleWallet');
    const result = await callable();
    return result.data;
  },

  async getCircleWalletStatus(): Promise<CircleWalletSummary> {
    const callable = httpsCallable<void, CircleWalletSummary>(requireFunctions(), 'getCircleWalletStatus');
    const result = await callable();
    return result.data;
  },

  async refreshCircleWalletBalance(): Promise<CircleWalletSummary> {
    const callable = httpsCallable<void, CircleWalletSummary>(requireFunctions(), 'refreshCircleWalletBalance');
    const result = await callable();
    return result.data;
  },

  async recordPaidLike(input: {
    kind: 'prompt' | 'workflow';
    contentId: string;
    sessionId?: string;
  }): Promise<PaidLikeResult> {
    const callable = httpsCallable<typeof input, PaidLikeResult>(requireFunctions(), 'recordPaidLike');
    const result = await callable(input);
    return result.data;
  },

  async settlePendingPayments(): Promise<{
    processed: number;
    batches: Array<Record<string, unknown>>;
  }> {
    const callable = httpsCallable<void, { processed: number; batches: Array<Record<string, unknown>> }>(
      requireFunctions(),
      'settlePendingPayments',
    );
    const result = await callable();
    return result.data;
  },

  async createTestUsdcTransfer(input: {
    destinationUserId: string;
    amount: string;
    confirmText: 'SEND_TEST_USDC';
  }): Promise<TestUsdcTransferResult> {
    const callable = httpsCallable<typeof input, TestUsdcTransferResult>(requireFunctions(), 'createTestUsdcTransfer');
    const result = await callable(input);
    return result.data;
  },
};

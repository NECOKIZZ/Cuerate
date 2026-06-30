import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { getCircleClient } from './circle.js';
import { getCircleConfig } from './config.js';

export const USDC_MICROS = 1_000_000;

export type CuerateCircleWallet = {
  walletId: string;
  walletAddress: string;
  blockchain: string;
  accountType: 'SCA' | 'EOA';
  usdcBalance: string;
  lockedBalance: string;
  balanceUpdatedAt?: unknown;
};

/**
 * Lazy Firestore accessor. `initializeApp()` runs at module load in index.ts,
 * so by the time any function body calls this the default app exists.
 */
function db() {
  return getFirestore();
}

export function parseUsdcMicros(value: unknown) {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '0';
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    return 0;
  }

  const [whole, fraction = ''] = raw.split('.');
  return Number(whole) * USDC_MICROS + Number(fraction.padEnd(6, '0').slice(0, 6));
}

export function formatUsdcMicros(micros: number) {
  const safeMicros = Math.max(0, Math.round(micros));
  const whole = Math.floor(safeMicros / USDC_MICROS);
  const fraction = String(safeMicros % USDC_MICROS).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function computeAvailableBalance(input: { usdcBalance: string; lockedBalance: string }) {
  return formatUsdcMicros(parseUsdcMicros(input.usdcBalance) - parseUsdcMicros(input.lockedBalance));
}

export async function readCircleWallet(uid: string): Promise<CuerateCircleWallet | null> {
  const snapshot = await db().collection('usersPrivate').doc(uid).get();
  const circle = snapshot.data()?.circle as Partial<CuerateCircleWallet> | undefined;

  if (!circle?.walletId || !circle.walletAddress) {
    return null;
  }

  return {
    walletId: circle.walletId,
    walletAddress: circle.walletAddress,
    blockchain: circle.blockchain || getCircleConfig().blockchain,
    accountType: circle.accountType || getCircleConfig().accountType,
    usdcBalance: typeof circle.usdcBalance === 'string' ? circle.usdcBalance : '0',
    lockedBalance: typeof circle.lockedBalance === 'string' ? circle.lockedBalance : '0',
    balanceUpdatedAt: circle.balanceUpdatedAt,
  };
}

export async function readCircleUsdcBalance(walletId: string) {
  const circle = getCircleClient();
  const balanceResponse = await circle.getWalletTokenBalance({ id: walletId });
  const tokenBalances = (balanceResponse.data?.tokenBalances ?? []) as any[];
  const usdcBalance = tokenBalances.find((entry: any) => {
    const symbol = String(entry.token?.symbol ?? entry.symbol ?? '').toUpperCase();
    return symbol === 'USDC';
  });

  return {
    usdcBalance: String(usdcBalance?.amount ?? usdcBalance?.balance ?? '0'),
    tokenBalances,
  };
}

export async function resolveUsdcTokenAddress(walletId: string, configuredAddress?: string) {
  if (configuredAddress) {
    return configuredAddress;
  }

  const { tokenBalances } = await readCircleUsdcBalance(walletId);
  const usdcBalance = tokenBalances.find((entry: any) => {
    const symbol = String(entry.token?.symbol ?? entry.symbol ?? '').toUpperCase();
    return symbol === 'USDC';
  });

  const tokenAddress = usdcBalance?.token?.tokenAddress ?? usdcBalance?.tokenAddress;
  if (!tokenAddress) {
    throw new HttpsError('failed-precondition', 'Could not find USDC token address for this wallet.');
  }

  return String(tokenAddress);
}

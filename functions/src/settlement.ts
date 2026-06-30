import { FieldValue, getFirestore, type DocumentData, type DocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getCircleClient } from './circle.js';
import { getCircleConfig } from './config.js';
import { formatUsdcMicros, readCircleWallet, resolveUsdcTokenAddress } from './wallet.js';

/** Stop halving once the next slice would fall below this (10 micros = $0.00001). */
export const DUST_MICROS = 10;
/** Fixed platform fee applied ONLY to original posts (500 bps = 5%). */
export const ORIGINAL_FEE_BPS = 500;
/** Gas/loop safety backstop; dust terminates first in practice. */
export const MAX_DEPTH = 32;

function db() {
  return getFirestore();
}

export type SettlementPayer = {
  walletId: string;
  walletAddress: string;
  blockchain: string;
};

export type LineagePayout = {
  uid: string | 'platform';
  handle?: string;
  address: string;
  amountMicros: number;
  amount: string;
  generation: number; // 1-indexed within lineage; 0 = platform
  txId: string | null;
  status: 'initiated' | 'failed' | 'skipped';
  error?: string;
};

export type SettlementResult = {
  batchId: string;
  promptId: string;
  grossMicros: number;
  platformMicros: number;
  netMicros: number;
  payouts: LineagePayout[];
  txIds: string[];
};

export type PayoutPlan = {
  /** shares[i] (micros) corresponds to lineage[i] (most-recent-first; shares[0] = queried post). */
  shares: number[];
  /** Platform's cut: 5% fee for originals, or the geometric remainder for forks. */
  platformMicros: number;
};

/**
 * Walk a prompt's fork lineage backward via `forkedFromId`, returning author uids
 * most-recent-first: [postCreator, parent, grandparent, ...]. Bounded to MAX_DEPTH hops
 * and guarded against cycles. Works on existing posts with no migration.
 */
export async function buildLineage(promptId: string): Promise<string[]> {
  const lineage: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = promptId;

  for (let hop = 0; hop < MAX_DEPTH; hop++) {
    const id: string | null = currentId;
    if (!id || seen.has(id)) {
      break; // end of chain or cycle guard
    }
    seen.add(id);

    const snapshot: DocumentSnapshot = await db().collection('prompts').doc(id).get();
    if (!snapshot.exists) {
      break;
    }

    const data: DocumentData = snapshot.data() ?? {};
    const authorUid = String(data.authorUid ?? '');
    if (authorUid) {
      lineage.push(authorUid);
    }

    currentId = data.forkedFromId ? String(data.forkedFromId) : null;
  }

  return lineage;
}

/**
 * Compute the payout plan in integer micros (no float drift).
 *
 * - **Original post** (lineage length <= 1, i.e. no parent): the creator keeps everything except a
 *   fixed 5% platform fee.
 * - **Forked post**: halve down the lineage — queried post 50%, parent 25%, grandparent 12.5%, ...
 *   Stop at the original creator OR once the next slice would fall below the dust floor. Each creator
 *   gets only their geometric slot; the platform absorbs the leftover remainder. No fee off the top.
 *
 * shares[i] corresponds to lineage[i] (most-recent-first; shares[0] = the queried post's creator).
 */
export function computePayout(lineageLen: number, grossMicros: number): PayoutPlan {
  // No lineage at all (defensive) — nothing to pay a creator, all to platform.
  if (lineageLen <= 0) {
    return { shares: [], platformMicros: grossMicros };
  }

  // Original post: protect the creator, small fixed fee only.
  if (lineageLen === 1) {
    const fee = Math.floor((grossMicros * ORIGINAL_FEE_BPS) / 10_000);
    return { shares: [grossMicros - fee], platformMicros: fee };
  }

  // Forked post: geometric decay, platform absorbs the remainder.
  const shares: number[] = [];
  let allocated = 0;
  const depth = Math.min(lineageLen, MAX_DEPTH);
  for (let gen = 1; gen <= depth; gen++) {
    const share = Math.floor(grossMicros / Math.pow(2, gen)); // gross / 2^gen
    if (share < DUST_MICROS) {
      break;
    }
    shares.push(share);
    allocated += share;
  }

  return { shares, platformMicros: grossMicros - allocated };
}

async function resolvePlatform(): Promise<{ address: string } | null> {
  const address = process.env.PLATFORM_CIRCLE_WALLET_ADDRESS?.trim();
  if (address) {
    return { address };
  }
  const uid = process.env.PLATFORM_CIRCLE_WALLET_UID?.trim();
  if (uid) {
    const wallet = await readCircleWallet(uid);
    if (wallet) {
      return { address: wallet.walletAddress };
    }
  }
  return null;
}

/**
 * Settle a payment of `grossMicros` USDC on `promptId`, sourced from `payer`'s Circle wallet:
 * take the platform fee off the top, then fan the remainder out across the post's fork lineage
 * via one Circle `createTransaction` per recipient (loop batching). Records a `settlementBatches`
 * doc that the existing `circleWebhook` will flip to settled/failed on confirmation.
 *
 * Shares whose recipient has no wallet (or equals the payer) fold into the platform cut, so the
 * geometric meaning is preserved and 100% is always allocated.
 */
export async function settlePayment(
  promptId: string,
  grossMicros: number,
  payer: SettlementPayer,
  source = 'inspire',
): Promise<SettlementResult> {
  const lineage = await buildLineage(promptId);
  const plan = computePayout(lineage.length, grossMicros);
  const shares = plan.shares;
  const basePlatformMicros = plan.platformMicros;
  const netMicros = grossMicros - basePlatformMicros;

  const config = getCircleConfig();
  const tokenAddress = await resolveUsdcTokenAddress(payer.walletId, config.usdcTokenAddress);
  const circle = getCircleClient();

  const payouts: LineagePayout[] = [];
  let platformExtraMicros = 0;

  // Resolve recipients first; fold unresolvable / self shares into the platform cut.
  const resolved: Array<{ uid: string; address: string; amountMicros: number; generation: number }> = [];
  for (let i = 0; i < shares.length; i++) {
    const uid = lineage[i];
    const amountMicros = shares[i];
    if (amountMicros <= 0) {
      continue;
    }
    const wallet = await readCircleWallet(uid);
    const sameChain = wallet?.blockchain === payer.blockchain;
    const isSelf = wallet?.walletAddress?.toLowerCase() === payer.walletAddress.toLowerCase();
    if (!wallet || !sameChain || isSelf) {
      platformExtraMicros += amountMicros;
      payouts.push({
        uid,
        address: wallet?.walletAddress ?? '',
        amountMicros,
        amount: formatUsdcMicros(amountMicros),
        generation: i + 1,
        txId: null,
        status: 'skipped',
        error: !wallet ? 'no_wallet' : isSelf ? 'self' : 'blockchain_mismatch',
      });
      continue;
    }
    resolved.push({ uid, address: wallet.walletAddress, amountMicros, generation: i + 1 });
  }

  const platform = await resolvePlatform();
  const platformTotalMicros = basePlatformMicros + platformExtraMicros;

  const batchRef = db().collection('settlementBatches').doc();
  const now = FieldValue.serverTimestamp();

  // Build the full transfer list: lineage recipients first, then the platform cut.
  type Transfer = { uid: string | 'platform'; address: string; amountMicros: number; generation: number };
  const transfers: Transfer[] = resolved.map((r) => ({
    uid: r.uid,
    address: r.address,
    amountMicros: r.amountMicros,
    generation: r.generation,
  }));
  if (platform && platformTotalMicros > 0) {
    transfers.push({ uid: 'platform', address: platform.address, amountMicros: platformTotalMicros, generation: 0 });
  } else if (platformTotalMicros > 0) {
    logger.warn('No platform wallet configured; platform cut not transferred', { promptId, platformTotalMicros });
  }

  const txIds: string[] = [];
  for (const transfer of transfers) {
    const amount = formatUsdcMicros(transfer.amountMicros);
    try {
      const response = await circle.createTransaction({
        blockchain: payer.blockchain,
        walletAddress: payer.walletAddress,
        tokenAddress,
        destinationAddress: transfer.address,
        amount: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      } as any);

      const data = response?.data ?? (response as any)?.data;
      const txId = data?.id ?? data?.transaction?.id ?? null;
      if (txId) {
        txIds.push(String(txId));
      }
      payouts.push({
        uid: transfer.uid,
        address: transfer.address,
        amountMicros: transfer.amountMicros,
        amount,
        generation: transfer.generation,
        txId: txId ? String(txId) : null,
        status: txId ? 'initiated' : 'failed',
      });
    } catch (error: any) {
      const circleError = error?.response?.data?.message ?? error?.message ?? String(error);
      logger.error('settlePayment transfer failed', { promptId, to: transfer.address, amount, error: circleError });
      payouts.push({
        uid: transfer.uid,
        address: transfer.address,
        amountMicros: transfer.amountMicros,
        amount,
        generation: transfer.generation,
        txId: null,
        status: 'failed',
        error: 'circle_api_error',
      });
    }
  }

  await batchRef.set({
    source,
    promptId,
    payerWalletId: payer.walletId,
    payerWalletAddress: payer.walletAddress,
    blockchain: payer.blockchain,
    grossMicros,
    platformMicros: platformTotalMicros,
    netMicros,
    payouts,
    circleTransactionIds: txIds,
    status: txIds.length > 0 ? 'initiated' : 'failed',
    createdAt: now,
    updatedAt: now,
  });

  return {
    batchId: batchRef.id,
    promptId,
    grossMicros,
    platformMicros: platformTotalMicros,
    netMicros,
    payouts,
    txIds,
  };
}

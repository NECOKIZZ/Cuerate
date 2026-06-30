import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { keccak256, toHex } from 'viem';
import { getCircleClient } from './circle.js';
import { getOnchainConfig } from './config.js';
import { formatUsdcMicros, readCircleWallet, type CuerateCircleWallet } from './wallet.js';
import { buildLineage, computePayout } from './settlement.js';

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

function db() {
  return getFirestore();
}

/** Deterministic bytes32 post id = keccak256(utf8(promptId)). Used identically on register + settle. */
export function postIdToBytes32(promptId: string): string {
  return keccak256(toHex(promptId));
}

const FEE_CONFIG = { type: 'level', config: { feeLevel: 'MEDIUM' } } as const;

async function execContract(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: (string | string[])[];
}): Promise<string | null> {
  const circle = getCircleClient();
  const response = await circle.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters: params.abiParameters,
    fee: FEE_CONFIG,
  } as any);
  const data = response?.data ?? (response as any)?.data;
  const id = data?.id ?? null;
  return id ? String(id) : null;
}

/**
 * Poll a Circle transaction until it reaches a state where dependent calls are safe to submit.
 * We wait for CONFIRMED/COMPLETE (so an approve is on-chain before settle's transferFrom runs).
 */
async function waitForConfirmed(transactionId: string, timeoutMs = 90_000): Promise<string> {
  const circle = getCircleClient();
  const deadline = Date.now() + timeoutMs;
  const terminalOk = new Set(['CONFIRMED', 'COMPLETE']);
  const terminalBad = new Set(['FAILED', 'DENIED', 'CANCELLED']);

  while (Date.now() < deadline) {
    const res = await circle.getTransaction({ id: transactionId });
    const state = String(res?.data?.transaction?.state ?? '');
    if (terminalOk.has(state)) {
      return state;
    }
    if (terminalBad.has(state)) {
      throw new Error(`Transaction ${transactionId} ${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Transaction ${transactionId} timed out before confirmation`);
}

/**
 * Register a post (and its parent) in the on-chain fork registry, from the registrar wallet.
 * No-op (returns null) if the on-chain path isn't configured. Idempotent on-chain (registerPost
 * reverts on duplicates) — callers should treat a revert here as "already registered".
 */
export async function registerPostOnchain(
  promptId: string,
  creatorAddress: string,
  parentPromptId: string | null,
): Promise<string | null> {
  const cfg = getOnchainConfig();
  if (!cfg.enabled || !cfg.royaltyAddress || !cfg.registrarWalletId) {
    return null;
  }

  const postId = postIdToBytes32(promptId);
  const parent = parentPromptId ? postIdToBytes32(parentPromptId) : ZERO_BYTES32;

  const txId = await execContract({
    walletId: cfg.registrarWalletId,
    contractAddress: cfg.royaltyAddress,
    abiFunctionSignature: 'registerPost(bytes32,address,bytes32)',
    abiParameters: [postId, creatorAddress, parent],
  });

  logger.info('registerPostOnchain submitted', { promptId, postId, parentPromptId, txId });
  return txId;
}

export type OnchainSettlement = {
  batchId: string;
  approveTxId: string | null;
  settleTxId: string | null;
  payouts: Array<{ uid: string; handle?: string; generation: number; amount: string }>;
  txIds: string[];
};

/**
 * Settle on-chain: the agent wallet `approve`s the royalty contract for `amountMicros` USDC, then
 * calls `settle(postId, amount)` which walks the lineage and distributes atomically on Arc. The
 * actual split happens in Solidity; we recompute the expected breakdown off-chain (reusing the
 * verified buildLineage/computeShares) purely for the API response + audit record.
 */
export async function settleOnchain(
  promptId: string,
  amountMicros: number,
  agent: Pick<CuerateCircleWallet, 'walletId' | 'walletAddress' | 'blockchain'>,
): Promise<OnchainSettlement> {
  const cfg = getOnchainConfig();
  if (!cfg.enabled || !cfg.royaltyAddress) {
    throw new Error('On-chain settlement is not configured (ROYALTY_CONTRACT_ADDRESS / INSPIRE_ONCHAIN).');
  }

  const postId = postIdToBytes32(promptId);
  const amount = String(amountMicros); // 6-dec ERC-20 base units == micros

  // Expected breakdown (display/audit only) — money actually moves in the contract.
  const lineage = await buildLineage(promptId);
  const plan = computePayout(lineage.length, amountMicros);
  const platformMicros = plan.platformMicros;
  const netMicros = amountMicros - platformMicros;
  const payouts = await Promise.all(
    plan.shares.map(async (micros, i) => {
      const uid = lineage[i];
      const wallet = await readCircleWallet(uid);
      return {
        uid,
        handle: wallet?.walletAddress,
        generation: i + 1,
        amount: formatUsdcMicros(micros),
      };
    }),
  );

  const batchRef = db().collection('settlementBatches').doc();
  const now = FieldValue.serverTimestamp();
  await batchRef.set({
    source: 'inspire-onchain',
    promptId,
    postId,
    payerWalletId: agent.walletId,
    payerWalletAddress: agent.walletAddress,
    blockchain: agent.blockchain,
    contractAddress: cfg.royaltyAddress,
    grossMicros: amountMicros,
    platformMicros,
    netMicros,
    status: 'initiating',
    createdAt: now,
    updatedAt: now,
  });

  // 1) approve(royalty, amount) on the USDC contract.
  const approveTxId = await execContract({
    walletId: agent.walletId,
    contractAddress: cfg.usdcAddress,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [cfg.royaltyAddress, amount],
  });
  if (!approveTxId) {
    await batchRef.set({ status: 'failed', failureReason: 'approve_submit', updatedAt: now }, { merge: true });
    throw new Error('Failed to submit USDC approve transaction.');
  }
  await waitForConfirmed(approveTxId);

  // 2) settle(postId, amount) on the royalty contract.
  let settleTxId: string | null = null;
  try {
    settleTxId = await execContract({
      walletId: agent.walletId,
      contractAddress: cfg.royaltyAddress,
      abiFunctionSignature: 'settle(bytes32,uint256)',
      abiParameters: [postId, amount],
    });
  } catch (error: any) {
    const message = error?.response?.data?.message ?? error?.message ?? String(error);
    await batchRef.set({ status: 'failed', failureReason: 'settle_submit', error: message, updatedAt: now }, { merge: true });
    throw new Error(`On-chain settle failed: ${message}`);
  }

  const txIds = [approveTxId, settleTxId].filter((id): id is string => Boolean(id));
  await batchRef.set(
    {
      approveTxId,
      settleTxId,
      circleTransactionIds: txIds,
      circleTransactionId: settleTxId, // matched by circleWebhook
      payouts,
      status: settleTxId ? 'initiated' : 'failed',
      updatedAt: now,
    },
    { merge: true },
  );

  return { batchId: batchRef.id, approveTxId, settleTxId, payouts, txIds };
}

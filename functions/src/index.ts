import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getCircleClient } from './circle.js';
import {
  assertTestnetTransfersOnly,
  getCircleConfig,
  getInspirePriceUsdc,
  getOnchainConfig,
  type CircleRuntimeConfig,
} from './config.js';
import {
  parseUsdcMicros,
  formatUsdcMicros,
  computeAvailableBalance,
  readCircleWallet,
  readCircleUsdcBalance,
  resolveUsdcTokenAddress,
  type CuerateCircleWallet,
} from './wallet.js';
import { settlePayment } from './settlement.js';
import { searchPrompts } from './search.js';
import { registerPostOnchain, settleOnchain } from './onchain.js';

initializeApp();

const db = getFirestore();

type PaidLikeKind = 'prompt' | 'workflow';

const TIER_ONE_LIKE_MICROS = 1_000;
const TIER_TWO_LIKE_MICROS = 10_000;

function requireAuth(request: { auth?: { uid: string } | null }) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to use Cuerate wallet features.');
  }
  return uid;
}

function assertValidAmount(value: unknown) {
  const amount = typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) {
    throw new HttpsError('invalid-argument', 'Amount must be a USDC decimal string with up to 6 decimals.');
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new HttpsError('invalid-argument', 'Amount must be greater than 0 and no more than 100 USDC.');
  }
  return amount;
}

function getLikePriceMicros(tier: unknown) {
  const normalizedTier = Number(tier ?? 1);
  if (normalizedTier >= 2) {
    return TIER_TWO_LIKE_MICROS;
  }
  if (normalizedTier >= 1) {
    return TIER_ONE_LIKE_MICROS;
  }

  throw new HttpsError('failed-precondition', 'Deposit USDC to unlock paid likes.');
}

function getPaidLikeTarget(kind: unknown, contentId: unknown) {
  const normalizedKind = kind === 'workflow' ? 'workflow' : kind === 'prompt' ? 'prompt' : null;
  const normalizedContentId = typeof contentId === 'string' ? contentId.trim() : '';

  if (!normalizedKind || !normalizedContentId) {
    throw new HttpsError('invalid-argument', 'Choose a prompt or workflow to like.');
  }

  return {
    kind: normalizedKind as PaidLikeKind,
    contentId: normalizedContentId,
    contentCollection: normalizedKind === 'prompt' ? 'prompts' : 'workflows',
    likeCollection: normalizedKind === 'prompt' ? 'promptLikes' : 'workflowLikes',
    contentIdField: normalizedKind === 'prompt' ? 'promptId' : 'workflowId',
  };
}

function getSessionId(userId: string, providedSessionId: unknown) {
  if (typeof providedSessionId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(providedSessionId.trim())) {
    return providedSessionId.trim();
  }

  const tenMinuteBucket = Math.floor(Date.now() / 600_000);
  return `${userId}_${tenMinuteBucket}`;
}

export const ensureCircleWallet = onCall(async (request) => {
  const uid = requireAuth(request);
  const existing = await readCircleWallet(uid);

  if (existing) {
    return {
      walletId: existing.walletId,
      walletAddress: existing.walletAddress,
      blockchain: existing.blockchain,
      accountType: existing.accountType,
      usdcBalance: existing.usdcBalance,
      lockedBalance: existing.lockedBalance,
      availableBalance: computeAvailableBalance(existing),
      balanceUpdatedAt: existing.balanceUpdatedAt ?? null,
      created: false,
    };
  }

  const config = getCircleConfig();
  const circle = getCircleClient();
  const walletsResponse = await circle.createWallets({
    idempotencyKey: crypto.randomUUID(),
    accountType: config.accountType,
    blockchains: [config.blockchain],
    count: 1,
    walletSetId: config.walletSetId,
    metadata: [{ name: `cuerate_${uid}`, refId: uid }],
  } as any);

  const wallet = walletsResponse.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    logger.error('Circle wallet creation returned no wallet', { uid, walletsResponse });
    throw new HttpsError('internal', 'Circle wallet creation did not return a wallet.');
  }

  const circleRecord = {
    walletId: wallet.id,
    walletAddress: wallet.address,
    blockchain: config.blockchain,
    accountType: config.accountType,
    usdcBalance: '0',
    lockedBalance: '0',
    balanceUpdatedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection('usersPrivate').doc(uid).set(
    {
      circle: circleRecord,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await db.collection('users').doc(uid).set(
    {
      walletReady: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    walletId: wallet.id,
    walletAddress: wallet.address,
    blockchain: config.blockchain,
    accountType: config.accountType,
    usdcBalance: '0',
    lockedBalance: '0',
    availableBalance: '0',
    balanceUpdatedAt: null,
    created: true,
  };
});

export const getCircleWalletStatus = onCall(async (request) => {
  const uid = requireAuth(request);
  const wallet = await readCircleWallet(uid);

  if (!wallet) {
    return {
      walletReady: false,
      usdcBalance: '0',
      tokenBalances: [],
    };
  }

  return {
    walletReady: true,
    walletId: wallet.walletId,
    walletAddress: wallet.walletAddress,
    blockchain: wallet.blockchain,
    accountType: wallet.accountType,
    usdcBalance: wallet.usdcBalance,
    lockedBalance: wallet.lockedBalance,
    availableBalance: computeAvailableBalance(wallet),
    balanceUpdatedAt: wallet.balanceUpdatedAt ?? null,
    tokenBalances: [],
  };
});

export const refreshCircleWalletBalance = onCall(async (request) => {
  const uid = requireAuth(request);
  const wallet = await readCircleWallet(uid);

  if (!wallet) {
    return {
      walletReady: false,
      usdcBalance: '0',
      tokenBalances: [],
    };
  }

  const { usdcBalance, tokenBalances } = await readCircleUsdcBalance(wallet.walletId);

  await db.collection('usersPrivate').doc(uid).set(
    {
      circle: {
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
        blockchain: wallet.blockchain,
        accountType: wallet.accountType,
        usdcBalance,
        lockedBalance: wallet.lockedBalance,
        balanceUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    walletReady: true,
    walletId: wallet.walletId,
    walletAddress: wallet.walletAddress,
    blockchain: wallet.blockchain,
    accountType: wallet.accountType,
    usdcBalance,
    lockedBalance: wallet.lockedBalance,
    availableBalance: computeAvailableBalance({ usdcBalance, lockedBalance: wallet.lockedBalance }),
    tokenBalances,
  };
});

export const recordPaidLike = onCall(async (request) => {
  const uid = requireAuth(request);
  const target = getPaidLikeTarget(request.data?.kind, request.data?.contentId);
  const sessionId = getSessionId(uid, request.data?.sessionId);
  const userPrivateRef = db.collection('usersPrivate').doc(uid);
  const contentRef = db.collection(target.contentCollection).doc(target.contentId);
  const likeRef = db.collection(target.likeCollection).doc(`${target.contentId}_${uid}`);
  const paymentRef = db.collection('likePayments').doc(`${target.kind}_${target.contentId}_${uid}`);
  const sessionRef = db.collection('paymentSessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const [userPrivateSnapshot, contentSnapshot, likeSnapshot, paymentSnapshot, sessionSnapshot] = await Promise.all([
      transaction.get(userPrivateRef),
      transaction.get(contentRef),
      transaction.get(likeRef),
      transaction.get(paymentRef),
      transaction.get(sessionRef),
    ]);

    if (!userPrivateSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'User wallet profile is missing.');
    }

    if (!contentSnapshot.exists) {
      throw new HttpsError('not-found', 'Content not found.');
    }

    const contentData = contentSnapshot.data() ?? {};
    const creatorId = String(contentData.authorUid ?? '');
    if (!creatorId) {
      throw new HttpsError('failed-precondition', 'Content creator is missing.');
    }

    if (creatorId === uid) {
      throw new HttpsError('failed-precondition', 'You cannot paid-like your own post.');
    }

    if (likeSnapshot.exists) {
      const currentLikes = Number(contentData.likes ?? 0);
      transaction.delete(likeRef);
      transaction.update(contentRef, { likes: Math.max(0, currentLikes - 1) });

      return {
        liked: false,
        charged: false,
        amount: paymentSnapshot.exists ? String(paymentSnapshot.data()?.amount ?? '0') : '0',
        status: paymentSnapshot.exists ? String(paymentSnapshot.data()?.status ?? 'already_paid') : 'social_unliked',
        likes: Math.max(0, currentLikes - 1),
      };
    }

    const now = FieldValue.serverTimestamp();
    const currentLikes = Number(contentData.likes ?? 0);
    const priorPayment = paymentSnapshot.exists ? paymentSnapshot.data() : null;

    transaction.set(likeRef, {
      [target.contentIdField]: target.contentId,
      userId: uid,
      authorUid: creatorId,
      paymentId: paymentRef.id,
      createdAt: now,
    });
    transaction.update(contentRef, { likes: currentLikes + 1 });

    if (priorPayment) {
      return {
        liked: true,
        charged: false,
        amount: String(priorPayment.amount ?? '0'),
        status: String(priorPayment.status ?? 'already_paid'),
        likes: currentLikes + 1,
      };
    }

    const privateData = userPrivateSnapshot.data() ?? {};
    const circle = (privateData.circle ?? {}) as Partial<CuerateCircleWallet>;
    if (!circle.walletId || !circle.walletAddress) {
      throw new HttpsError('failed-precondition', 'Create your Cuerate wallet before liking.');
    }

    const priceMicros = getLikePriceMicros(privateData.tier);
    const usdcMicros = parseUsdcMicros(circle.usdcBalance);
    const lockedMicros = parseUsdcMicros(circle.lockedBalance);
    const availableMicros = usdcMicros - lockedMicros;

    if (availableMicros < priceMicros) {
      throw new HttpsError('failed-precondition', 'Insufficient available USDC. Deposit to keep liking.');
    }

    const amount = formatUsdcMicros(priceMicros);
    const nextLockedBalance = formatUsdcMicros(lockedMicros + priceMicros);

    transaction.set(
      userPrivateRef,
      {
        circle: {
          ...circle,
          lockedBalance: nextLockedBalance,
          updatedAt: now,
        },
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      sessionRef,
      {
        userId: uid,
        status: sessionSnapshot.exists ? String(sessionSnapshot.data()?.status ?? 'active') : 'active',
        pendingAmountMicros: Number(sessionSnapshot.data()?.pendingAmountMicros ?? 0) + priceMicros,
        paymentCount: Number(sessionSnapshot.data()?.paymentCount ?? 0) + 1,
        createdAt: sessionSnapshot.exists ? sessionSnapshot.data()?.createdAt ?? now : now,
        lastActivityAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(paymentRef, {
      userId: uid,
      creatorId,
      kind: target.kind,
      contentId: target.contentId,
      sessionId,
      amount,
      amountMicros: priceMicros,
      currency: 'USDC',
      status: 'pending_settlement',
      createdAt: now,
      updatedAt: now,
    });

    return {
      liked: true,
      charged: true,
      amount,
      status: 'pending_settlement',
      lockedBalance: nextLockedBalance,
      availableBalance: formatUsdcMicros(availableMicros - priceMicros),
      sessionId,
      likes: currentLikes + 1,
    };
  });
});

export const testSettle = onCall(async (request) => {
  try {
    const uid = requireAuth(request);
    return { ok: true, uid, message: 'Function works. Auth passed.' };
  } catch (err) {
    logger.error('testSettle error', { error: err instanceof Error ? err.message : String(err) });
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Test failed.');
  }
});

async function executeSettlements(config: CircleRuntimeConfig) {
  const pendingSnapshot = await db
    .collection('likePayments')
    .where('status', '==', 'pending_settlement')
    .limit(100)
    .get();

  if (pendingSnapshot.empty) {
    return { processed: 0, batches: [] };
  }

  const groups = new Map<
    string,
    { likerId: string; creatorId: string; paymentIds: string[]; totalMicros: number }
  >();

  for (const doc of pendingSnapshot.docs) {
    const data = doc.data();
    const key = `${data.userId}_${data.creatorId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        likerId: data.userId,
        creatorId: data.creatorId,
        paymentIds: [],
        totalMicros: 0,
      });
    }
    const group = groups.get(key)!;
    group.paymentIds.push(doc.id);
    group.totalMicros += Number(data.amountMicros ?? 0);
  }

  const results: Array<Record<string, unknown>> = [];
  const circle = getCircleClient();

  for (const [key, group] of groups) {
    if (group.totalMicros <= 0) {
      results.push({ key, status: 'skipped', reason: 'zero_amount' });
      continue;
    }

    const [likerWallet, creatorWallet] = await Promise.all([
      readCircleWallet(group.likerId),
      readCircleWallet(group.creatorId),
    ]);

    if (!likerWallet || !creatorWallet) {
      results.push({ key, status: 'skipped', reason: 'missing_wallet' });
      continue;
    }

    if (likerWallet.blockchain !== creatorWallet.blockchain) {
      results.push({ key, status: 'skipped', reason: 'blockchain_mismatch' });
      continue;
    }

    let actualBalance: string;
    try {
      const balanceResult = await readCircleUsdcBalance(likerWallet.walletId);
      actualBalance = balanceResult.usdcBalance;
    } catch (error) {
      logger.error('Failed to read Circle USDC balance', { likerId: group.likerId, error });
      results.push({ key, status: 'failed', reason: 'balance_read_error' });
      continue;
    }

    const actualMicros = parseUsdcMicros(actualBalance);
    const currentLocked = parseUsdcMicros(likerWallet.lockedBalance);
    const availableMicros = actualMicros - currentLocked;

    if (availableMicros < group.totalMicros) {
      logger.warn('Insufficient available balance for settlement', {
        likerId: group.likerId,
        actualMicros,
        currentLocked,
        neededMicros: group.totalMicros,
      });
      results.push({ key, status: 'skipped', reason: 'insufficient_funds' });
      continue;
    }

    const batchRef = db.collection('settlementBatches').doc();
    const amount = formatUsdcMicros(group.totalMicros);
    const now = FieldValue.serverTimestamp();

    await batchRef.set({
      likerId: group.likerId,
      creatorId: group.creatorId,
      paymentIds: group.paymentIds,
      amount,
      amountMicros: group.totalMicros,
      status: 'initiating',
      createdAt: now,
      updatedAt: now,
    });

    let tokenAddress: string;
    try {
      tokenAddress = await resolveUsdcTokenAddress(likerWallet.walletId, config.usdcTokenAddress);
    } catch (error) {
      logger.error('Could not resolve USDC token address', { likerId: group.likerId, error });
      await batchRef.set({ status: 'failed', failureReason: 'token_address', updatedAt: now }, { merge: true });
      results.push({ key, status: 'failed', reason: 'token_address' });
      continue;
    }

    let transferResponse;
    try {
      logger.info('Creating Circle transaction', {
        blockchain: likerWallet.blockchain,
        walletAddress: likerWallet.walletAddress,
        tokenAddress,
        destinationAddress: creatorWallet.walletAddress,
        amount: [amount],
      });
      transferResponse = await circle.createTransaction({
        blockchain: likerWallet.blockchain,
        walletAddress: likerWallet.walletAddress,
        tokenAddress,
        destinationAddress: creatorWallet.walletAddress,
        amount: [amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      } as any);
    } catch (error: any) {
      const circleError = error?.response?.data?.message ?? error?.message ?? String(error);
      logger.error('Circle transfer failed', { likerId: group.likerId, creatorId: group.creatorId, error: circleError });
      await batchRef.set({ status: 'failed', failureReason: 'circle_api_error', circleError, updatedAt: now }, { merge: true });
      results.push({ key, status: 'failed', reason: 'circle_api_error', circleError, params: { walletAddress: likerWallet.walletAddress, blockchain: likerWallet.blockchain, tokenAddress, amount: [amount], destinationAddress: creatorWallet.walletAddress } });
      continue;
    }

    const responseData = transferResponse?.data ?? (transferResponse as any)?.data;
    logger.info('Circle transfer response', { responseData: JSON.stringify(responseData) });

    const transactionId = responseData?.id ?? (responseData as any)?.transaction?.id ?? null;

    await batchRef.set(
      {
        circleTransactionId: transactionId,
        status: transactionId ? 'initiated' : 'failed',
        updatedAt: now,
      },
      { merge: true },
    );

    for (const paymentId of group.paymentIds) {
      await db.collection('likePayments').doc(paymentId).set(
        {
          status: transactionId ? 'initiated' : 'failed',
          settlementBatchId: batchRef.id,
          circleTransactionId: transactionId,
          updatedAt: now,
        },
        { merge: true },
      );
    }

    if (transactionId) {
      const newLocked = formatUsdcMicros(Math.max(0, currentLocked - group.totalMicros));
      await db.collection('usersPrivate').doc(group.likerId).set(
        {
          circle: {
            ...likerWallet,
            lockedBalance: newLocked,
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true },
      );
    }

    results.push({
      key,
      status: transactionId ? 'initiated' : 'failed',
      transactionId,
      amount,
      paymentCount: group.paymentIds.length,
    });
  }

  return { processed: pendingSnapshot.size, batches: results };
}

export const settlePendingPayments = onCall(async (request) => {
  try {
    const uid = requireAuth(request);

    const callerWallet = await readCircleWallet(uid);
    if (!callerWallet) {
      throw new HttpsError('failed-precondition', 'Create your wallet first.');
    }

    let config: CircleRuntimeConfig;
    try {
      config = getCircleConfig();
      assertTestnetTransfersOnly(config);
    } catch (configErr) {
      logger.error('getCircleConfig failed — deployed env vars may be missing. Using defaults.', { error: configErr instanceof Error ? configErr.message : String(configErr) });
      config = {
        apiKey: '',
        entitySecret: '',
        walletSetId: '',
        blockchain: 'ARC-TESTNET',
        accountType: 'SCA',
        allowLiveTransfers: false,
      };
    }

    const result = await executeSettlements(config);
    return result;
  } catch (err) {
    logger.error('settlePendingPayments fatal error', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Settlement failed.');
  }
});

export const triggerSettlement = onRequest(async (req, res) => {
  const secret = req.headers['x-cuerate-cron-secret'];
  const expected = process.env.CUERATE_CRON_SECRET ?? 'dev-secret-change-me';

  if (secret !== expected) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  try {
    let config: CircleRuntimeConfig;
    try {
      config = getCircleConfig();
      assertTestnetTransfersOnly(config);
    } catch (configErr) {
      logger.error('getCircleConfig failed in triggerSettlement — deployed env vars may be missing. Using defaults.', { error: configErr instanceof Error ? configErr.message : String(configErr) });
      config = {
        apiKey: '',
        entitySecret: '',
        walletSetId: '',
        blockchain: 'ARC-TESTNET',
        accountType: 'SCA',
        allowLiveTransfers: false,
      };
    }

    const result = await executeSettlements(config);
    logger.info('Settlement triggered via cron', { processed: result.processed, batchCount: result.batches.length });
    res.status(200).json({ ok: true, processed: result.processed, batches: result.batches.length });
  } catch (err) {
    logger.error('triggerSettlement fatal error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Settlement failed' });
  }
});

export const createTestUsdcTransfer = onCall(async (request) => {
  const uid = requireAuth(request);
  const destinationUserId = typeof request.data?.destinationUserId === 'string' ? request.data.destinationUserId.trim() : '';
  const amount = assertValidAmount(request.data?.amount);
  const confirmText = typeof request.data?.confirmText === 'string' ? request.data.confirmText.trim() : '';

  if (!destinationUserId || destinationUserId === uid) {
    throw new HttpsError('invalid-argument', 'Choose a different destination Cuerate user.');
  }

  if (confirmText !== 'SEND_TEST_USDC') {
    throw new HttpsError('failed-precondition', 'Confirm this test transfer with SEND_TEST_USDC.');
  }

  const config = getCircleConfig();
  assertTestnetTransfersOnly(config);

  const [sourceWallet, destinationWallet] = await Promise.all([
    readCircleWallet(uid),
    readCircleWallet(destinationUserId),
  ]);

  if (!sourceWallet) {
    throw new HttpsError('failed-precondition', 'Create your Circle wallet before sending USDC.');
  }

  if (!destinationWallet) {
    throw new HttpsError('failed-precondition', 'Destination user does not have a Circle wallet yet.');
  }

  if (sourceWallet.blockchain !== destinationWallet.blockchain) {
    throw new HttpsError('failed-precondition', 'Source and destination wallets must be on the same blockchain.');
  }

  const paymentRef = db.collection('walletTransfers').doc();
  await paymentRef.set({
    sourceUserId: uid,
    destinationUserId,
    amount,
    currency: 'USDC',
    sourceWalletId: sourceWallet.walletId,
    destinationWalletAddress: destinationWallet.walletAddress,
    blockchain: sourceWallet.blockchain,
    status: 'CREATED',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const circle = getCircleClient();
  const tokenAddress = await resolveUsdcTokenAddress(sourceWallet.walletId, config.usdcTokenAddress);
  const transferResponse = await circle.createTransaction({
    idempotencyKey: paymentRef.id,
    blockchain: sourceWallet.blockchain,
    walletAddress: sourceWallet.walletAddress,
    tokenAddress,
    destinationAddress: destinationWallet.walletAddress,
    amount: [amount],
    fee: {
      type: 'level',
      config: { feeLevel: 'MEDIUM' },
    },
  } as any);

  const transactionId = transferResponse.data?.id;
  await paymentRef.set(
    {
      circleTransactionId: transactionId ?? null,
      tokenAddress,
      status: transactionId ? 'INITIATED' : 'UNKNOWN',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    transferId: paymentRef.id,
    transactionId,
    status: transactionId ? 'INITIATED' : 'UNKNOWN',
  };
});

export const circleWebhook = onRequest(async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).send('Method Not Allowed');
    return;
  }

  const body = request.body;
  const eventType = String(body?.type ?? '');
  const transactionId = String(body?.data?.id ?? '');

  await db.collection('circleWebhookEvents').add({
    headers: {
      circleKeyId: request.header('X-Circle-Key-Id') ?? null,
      hasSignature: Boolean(request.header('X-Circle-Signature')),
    },
    body: request.body,
    receivedAt: FieldValue.serverTimestamp(),
  });

  if (!transactionId) {
    response.status(204).send();
    return;
  }

  const batchSnapshot = await db
    .collection('settlementBatches')
    .where('circleTransactionId', '==', transactionId)
    .limit(1)
    .get();

  if (batchSnapshot.empty) {
    response.status(204).send();
    return;
  }

  const batchDoc = batchSnapshot.docs[0];
  const batchData = batchDoc.data();
  const now = FieldValue.serverTimestamp();

  if (eventType === 'transaction.complete' || eventType === 'transaction.confirmed') {
    await batchDoc.ref.set(
      { status: 'settled', settledAt: now, updatedAt: now },
      { merge: true },
    );

    for (const paymentId of batchData.paymentIds ?? []) {
      await db.collection('likePayments').doc(paymentId).set(
        { status: 'settled', settledAt: now, updatedAt: now },
        { merge: true },
      );
    }

    response.status(204).send();
    return;
  }

  if (eventType === 'transaction.failed' || eventType === 'transaction.cancelled') {
    await batchDoc.ref.set(
      { status: 'failed', failureReason: eventType, updatedAt: now },
      { merge: true },
    );

    for (const paymentId of batchData.paymentIds ?? []) {
      await db.collection('likePayments').doc(paymentId).set(
        { status: 'failed', updatedAt: now },
        { merge: true },
      );
    }

    const likerId = batchData.likerId;
    const totalMicros = Number(batchData.amountMicros ?? 0);
    if (likerId && totalMicros > 0) {
      const userPrivateSnap = await db.collection('usersPrivate').doc(likerId).get();
      const circle = userPrivateSnap.data()?.circle ?? {};
      const currentLocked = parseUsdcMicros(circle.lockedBalance ?? '0');
      const newLocked = formatUsdcMicros(currentLocked + totalMicros);
      await db.collection('usersPrivate').doc(likerId).set(
        {
          circle: {
            ...circle,
            lockedBalance: newLocked,
            updatedAt: now,
          },
          updatedAt: now,
        },
        { merge: true },
      );
    }

    response.status(204).send();
    return;
  }

  response.status(204).send();
});

/**
 * Resolve an Inspiration API agent key to the Cuerate uid whose funded Circle wallet
 * pays for the query. Env map (INSPIRE_AGENT_KEYS="key:uid,key2:uid2") takes precedence;
 * falls back to an admin-only `agentKeys/{key}` doc. Returns null if the key is unknown.
 */
async function resolveAgentUid(agentKey: string): Promise<string | null> {
  const envMap = process.env.INSPIRE_AGENT_KEYS?.trim();
  if (envMap) {
    for (const pair of envMap.split(',')) {
      const [key, uid] = pair.split(':').map((part) => part.trim());
      if (key && uid && key === agentKey) {
        return uid;
      }
    }
  }

  const snapshot = await db.collection('agentKeys').doc(agentKey).get();
  if (snapshot.exists) {
    const uid = String(snapshot.data()?.uid ?? '');
    return uid || null;
  }

  return null;
}

/**
 * Resolve an agent key to the paying wallet. For the demo, a single env-defined agent wallet
 * (INSPIRE_AGENT_KEY + INSPIRE_AGENT_WALLET_ID/ADDRESS) lets you test with no Firestore user.
 * Otherwise the key maps to a Cuerate uid whose Circle wallet pays.
 */
async function resolveAgentWallet(agentKey: string): Promise<CuerateCircleWallet | null> {
  const demoKey = process.env.INSPIRE_AGENT_KEY?.trim();
  const demoWalletId = process.env.INSPIRE_AGENT_WALLET_ID?.trim();
  const demoWalletAddress = process.env.INSPIRE_AGENT_WALLET_ADDRESS?.trim();
  if (demoKey && agentKey === demoKey && demoWalletId && demoWalletAddress) {
    const config = getCircleConfig();
    return {
      walletId: demoWalletId,
      walletAddress: demoWalletAddress,
      blockchain: config.blockchain,
      accountType: config.accountType,
      usdcBalance: '0',
      lockedBalance: '0',
    };
  }

  const uid = await resolveAgentUid(agentKey);
  if (!uid) {
    return null;
  }
  return readCircleWallet(uid);
}

/**
 * Inspiration API — "Pinterest for Agents". An external agent pays per query (Circle-settled
 * HTTP 402) to search Cuerate's prompt library; the matched creator AND their fork lineage get
 * paid automatically via settlePayment. Sourcing the payment from the agent's own Circle wallet
 * keeps the whole flow on the working dev-controlled-wallet rail (Arc testnet).
 */
export const inspire = onRequest({ cors: true, timeoutSeconds: 300 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. POST a JSON body { query }.' });
    return;
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query) {
    res.status(400).json({ error: 'Provide a "query" string, e.g. "cinematic neon city night".' });
    return;
  }

  const priceUsdc = getInspirePriceUsdc();
  const priceMicros = parseUsdcMicros(priceUsdc);
  const agentKey = req.header('x-agent-key')?.trim() ?? '';

  // x402-style challenge: no payment authorization yet → 402 with the payment requirements.
  if (!agentKey) {
    const config = getCircleConfig();
    const payTo = process.env.PLATFORM_CIRCLE_WALLET_ADDRESS?.trim() ?? null;
    res
      .status(402)
      .set('WWW-Authenticate', `x402 network="${config.blockchain}", asset="USDC", amount="${priceUsdc}"`)
      .json({
        error: 'Payment Required',
        accepts: [
          {
            scheme: 'circle-settled',
            network: config.blockchain,
            asset: 'USDC',
            amount: priceUsdc,
            payTo,
            resource: '/inspire',
            description: 'Pay per query via your Cuerate agent wallet (send your key as the x-agent-key header).',
          },
        ],
      });
    return;
  }

  try {
    const config = getCircleConfig();
    assertTestnetTransfersOnly(config);

    const agentWallet = await resolveAgentWallet(agentKey);
    if (!agentWallet) {
      res.status(401).json({ error: 'Unknown or unprovisioned agent key.' });
      return;
    }

    // Verify the agent can actually cover the fee before doing any work.
    let availableMicros = 0;
    try {
      const { usdcBalance } = await readCircleUsdcBalance(agentWallet.walletId);
      availableMicros = parseUsdcMicros(usdcBalance) - parseUsdcMicros(agentWallet.lockedBalance);
    } catch (balanceError) {
      logger.error('inspire balance read failed', {
        walletId: agentWallet.walletId,
        error: balanceError instanceof Error ? balanceError.message : String(balanceError),
      });
      res.status(502).json({ error: 'Could not verify agent wallet balance.' });
      return;
    }

    if (availableMicros < priceMicros) {
      res.status(402).json({
        error: 'Insufficient USDC in agent wallet.',
        required: priceUsdc,
        available: formatUsdcMicros(availableMicros),
      });
      return;
    }

    const match = await searchPrompts(query);
    if (!match) {
      res.status(404).json({ error: 'No matching prompt found for that query.' });
      return;
    }

    // Pay the matched creator + their fork lineage from the agent's wallet.
    // On-chain (Stage 2): the agent approves + calls the royalty contract, which splits in Solidity.
    // Off-chain (Stage 1, fallback): we compute the split and loop Circle transfers.
    const agentPayer = {
      walletId: agentWallet.walletId,
      walletAddress: agentWallet.walletAddress,
      blockchain: agentWallet.blockchain,
    };

    let mode: 'onchain' | 'offchain';
    let batchId: string;
    let txIds: string[];
    let lineagePayout: Array<{
      recipient: string;
      generation: number;
      amount: string;
      status?: string;
      txId?: string | null;
    }>;

    if (getOnchainConfig().enabled) {
      const result = await settleOnchain(match.id, priceMicros, agentPayer);
      mode = 'onchain';
      batchId = result.batchId;
      txIds = result.txIds;
      lineagePayout = result.payouts.map((p) => ({
        recipient: p.uid,
        generation: p.generation,
        amount: p.amount,
      }));
    } else {
      const settlement = await settlePayment(match.id, priceMicros, agentPayer, 'inspire');
      mode = 'offchain';
      batchId = settlement.batchId;
      txIds = settlement.txIds;
      lineagePayout = settlement.payouts.map((p) => ({
        recipient: p.uid,
        generation: p.generation,
        amount: p.amount,
        status: p.status,
        txId: p.txId,
      }));
    }

    // Side-effect like (no extra charge): agent demand shows up as real engagement,
    // feeding the existing tier/leaderboard system with zero UI work.
    try {
      await db.collection('prompts').doc(match.id).update({ likes: FieldValue.increment(1) });
    } catch (likeError) {
      logger.warn('inspire like increment failed', {
        promptId: match.id,
        error: likeError instanceof Error ? likeError.message : String(likeError),
      });
    }

    res.status(200).json({
      prompt: match.promptText,
      model: match.model,
      thumbnailUrl: match.thumbnailUrl,
      styleTags: match.styleTags,
      moodLabel: match.moodLabel,
      source: {
        promptId: match.id,
        creatorHandle: match.authorHandle,
      },
      payment: {
        amount: priceUsdc,
        currency: 'USDC',
        network: config.blockchain,
        mode,
        batchId,
        lineagePayout,
        txIds,
      },
    });
  } catch (err) {
    logger.error('inspire fatal error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Inspiration query failed.' });
  }
});

/**
 * When a prompt (or fork) is created, register it in the on-chain fork registry so its lineage is
 * trustless and walkable by the royalty contract. Only active when the on-chain path is enabled.
 * Degrades gracefully: creators without a wallet are skipped (the contract folds unregistered
 * ancestors into the platform cut at settle time).
 */
export const onPromptCreated = onDocumentCreated('prompts/{promptId}', async (event) => {
  if (!getOnchainConfig().enabled) {
    return;
  }

  const snapshot = event.data;
  if (!snapshot) {
    return;
  }

  const data = snapshot.data() ?? {};
  const promptId = event.params.promptId;
  const authorUid = String(data.authorUid ?? '');
  const parentPromptId = data.forkedFromId ? String(data.forkedFromId) : null;

  if (!authorUid) {
    return;
  }

  const wallet = await readCircleWallet(authorUid);
  if (!wallet) {
    logger.info('onPromptCreated: creator has no wallet yet, skipping on-chain registration', {
      promptId,
      authorUid,
    });
    return;
  }

  try {
    const txId = await registerPostOnchain(promptId, wallet.walletAddress, parentPromptId);
    logger.info('onPromptCreated: registered post on-chain', { promptId, parentPromptId, txId });
  } catch (err) {
    // A revert here usually means the post is already registered — safe to ignore.
    logger.warn('onPromptCreated: on-chain registration failed (may already exist)', {
      promptId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

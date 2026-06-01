import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getCircleClient } from './circle.js';
import { assertTestnetTransfersOnly, getCircleConfig, type CircleRuntimeConfig } from './config.js';

initializeApp();

const db = getFirestore();

type CuerateCircleWallet = {
  walletId: string;
  walletAddress: string;
  blockchain: string;
  accountType: 'SCA' | 'EOA';
  usdcBalance: string;
  lockedBalance: string;
  balanceUpdatedAt?: unknown;
};

type PaidLikeKind = 'prompt' | 'workflow';

const USDC_MICROS = 1_000_000;
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

function parseUsdcMicros(value: unknown) {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '0';
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) {
    return 0;
  }

  const [whole, fraction = ''] = raw.split('.');
  return Number(whole) * USDC_MICROS + Number(fraction.padEnd(6, '0').slice(0, 6));
}

function formatUsdcMicros(micros: number) {
  const safeMicros = Math.max(0, Math.round(micros));
  const whole = Math.floor(safeMicros / USDC_MICROS);
  const fraction = String(safeMicros % USDC_MICROS).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function computeAvailableBalance(input: { usdcBalance: string; lockedBalance: string }) {
  return formatUsdcMicros(parseUsdcMicros(input.usdcBalance) - parseUsdcMicros(input.lockedBalance));
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

async function readCircleWallet(uid: string): Promise<CuerateCircleWallet | null> {
  const snapshot = await db.collection('usersPrivate').doc(uid).get();
  const circle = snapshot.data()?.circle as
    | Partial<CuerateCircleWallet>
    | undefined;

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

async function readCircleUsdcBalance(walletId: string) {
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

async function resolveUsdcTokenAddress(walletId: string, configuredAddress?: string) {
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

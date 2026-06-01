# Cuerate — Tier & Wallet Implementation Plan

**Date:** 2026-05-30
**Status:** Firebase Functions v2 blocked by billing. Payments pivoted to batch model.

---

## 1. Situation

| Item | State |
|---|---|
| Circle wallet backend | Scaffolded in `functions/src/index.ts` — 3 callable functions |
| Deployment | **BLOCKED** — Firebase billing not enabled; Cloud Functions v2 requires Cloud Build + Artifact Registry |
| Frontend wallet code | Dead code (`walletApi` in `src/lib/wallet.ts` — no component imports it) |
| Payment model | Pivoted from per-like micropayment → **batched settlement** |
| Tier system | Not implemented |
| Prompt lock | Not implemented (prompts fully visible to all users) |

---

## 2. Fix the Deployment Blocker (Pick One)

### Option A — Switch to Firebase Functions v1 (Free on Spark Plan)
Cloud Functions **v1** does NOT require billing. v2 does. Your current code uses `firebase-functions/v2/https`.

**Changes needed:**
1. In `functions/src/index.ts`, `functions/src/config.ts`, `functions/src/circle.ts`:
   - Replace `import { onCall, onRequest } from 'firebase-functions/v2/https'` with `import functions from 'firebase-functions'`
   - Replace `onCall(async (request) => { ... })` with `functions.https.onCall(async (data, context) => { ... })`
   - Replace `onRequest(async (request, response) => { ... })` with `functions.https.onRequest(async (request, response) => { ... })`
   - Replace `request.auth?.uid` with `context.auth?.uid`
   - Replace `request.data` with `data`
   - Replace `import { logger } from 'firebase-functions'` with `functions.logger`
2. In `firebase.json`, ensure `"functions": { "source": "functions" }` (already correct)
3. Re-run `npm run functions:deploy`

**Pros:** Zero cost, keeps existing Firebase auth integration.
**Cons:** v1 is older, slightly different API.

### Option B — Move Backend to Vercel Serverless Functions
Use the Vercel project you already have (`cuerateprompt.vercel.app`).

**Changes needed:**
1. Create `api/wallet.ts`, `api/tier.ts` in project root (or `src/pages/api/` if using Next.js)
2. Move Circle SDK calls from `functions/src/` into Vercel API routes
3. Use Firebase Admin SDK inside Vercel functions for Firestore access
4. Remove `functions/` folder entirely

**Pros:** No Firebase billing needed; free Vercel hobby tier handles this.
**Cons:** Need Firebase service account key for Admin SDK; restructure auth context passing.

### Option C — Enable Firebase Billing (~$0 for low usage)
Go to [Google Cloud Console → Billing](https://console.cloud.google.com/billing) and link a payment method.

**Pros:** Keep everything exactly as-is; v2 is modern and fast.
**Cons:** Requires credit card; minimal cost but not zero.

> **Recommendation:** Option A. Change 5 import lines and deploy for free.

---

## 3. Tier System Implementation

### Data Model

Add to `users/{uid}` ( Firestore ):
```typescript
interface UserTier {
  tier: 0 | 1 | 2;           // derived from balance + likePrice
  likePrice: 0 | 0.001 | 0.01; // user-selected per-like cost
  walletBalance: number;    // USDC balance (cached from Circle)
  walletReady: boolean;      // Circle wallet created
  badge: 'none' | 'supporter' | 'pro';
  totalEarned: number;       // lifetime earnings
  totalSpent: number;        // lifetime likes sent
}
```

> **Important:** Store `tier` and `walletBalance` in `usersPrivate/{uid}` (server-writable only), not `users/{uid}` where clients can forge it. Or add Firestore rules to block client writes to these fields.

### Tier Detection Logic

```typescript
function getUserTier(walletBalance: number, likePrice: number): 0 | 1 | 2 {
  if (walletBalance === 0) return 0;
  if (likePrice === 0.01) return 2;
  if (likePrice === 0.001) return 1;
  return 0;
}
```

### Badge Derivation
```typescript
function getBadge(tier: number): string {
  if (tier === 2) return 'pro';
  if (tier === 1) return 'supporter';
  return 'none';
}
```

---

## 4. Wallet System Implementation

### Step 4A — Auto-Create Wallet on Signup

In `src/lib/backend.ts` → `upsertUserProfile`, after user profile is created:
```typescript
// After upsertUserProfile completes:
if (firebaseEnabled) {
  // Call the Cloud Function to create Circle wallet
  await walletApi.ensureCircleWallet();
}
```

> This requires `walletApi` to be imported and called. Currently dead code.

### Step 4B — Balance Refresh

Add a background balance refresh. Options:
1. **Client-side poll:** On app load, call `walletApi.getCircleWalletStatus()` every 30s.
2. **Webhook-driven:** Implement `circleWebhook` signature verification, update `usersPrivate/{uid}/walletBalance` on transfer events.
3. **Lazy refresh:** Check balance before any action that requires it (like, post, etc.).

> Recommendation: Start with #1 (client poll), move to #2 when webhooks are verified.

### Step 4C — Deposit Flow

Tier 0 → Tier 1 requires deposit. Options:
1. **Circle fiat on-ramp** — Use Circle's embedded widget (if available for your region).
2. **Direct USDC transfer** — Show user's wallet address; they send USDC from an external wallet (MetaMask, Coinbase, etc.).
3. **Testnet faucet** — For testnet only, use `requestTestnetTokens` from Circle SDK.

> Recommendation: Start with #3 (faucet) for testnet. For mainnet, implement #2 (show address + QR code).

---

## 5. Batched Payment Architecture

Since per-like micropayments hit rate limits / cost too much gas, use batch settlement.

### Data Model

New collection: `likeBatches/{batchId}`
```typescript
interface LikeBatch {
  likerId: string;           // who is paying
  creatorId: string;         // who is earning
  postId: string;
  likePrice: number;         // 0.001 or 0.01
  count: number;             // how many likes in this batch
  totalAmount: number;       // count * likePrice
  status: 'open' | 'settled' | 'failed';
  createdAt: Timestamp;
  settledAt?: Timestamp;
  circleTransactionId?: string;
}
```

### Flow

**Step 1 — User Likes (Client)**
- Frontend writes to `promptLikes/{promptId}_{uid}` (already exists)
- Frontend writes to `likeBatches` (upsert open batch for this liker→creator pair)

**Step 2 — Batch Accumulation (Firestore)**
- Batch stays `open` for N minutes or until count threshold (e.g., 10 likes)
- Frontend shows "Pending: $0.005 USDC" in UI

**Step 3 — Settlement Trigger**
- Option A: Scheduled Cloud Function (cron) every 5 minutes
- Option B: Client triggers settlement when batch reaches threshold
- Option C: Manual "Settle Now" button

> **For testnet:** Option B is simplest. When batch count >= 1, call `createTestUsdcTransfer`.

**Step 4 — Settlement Function**
```typescript
// Cloud Function
export const settleLikeBatch = onCall(async (data, context) => {
  const { batchId } = data;
  const batch = await db.collection('likeBatches').doc(batchId).get();
  
  if (!batch.exists || batch.data().status !== 'open') {
    throw new HttpsError('failed-precondition', 'Batch not found or already settled');
  }
  
  const { likerId, creatorId, totalAmount } = batch.data();
  
  // Get Circle wallets
  const likerWallet = await readCircleWallet(likerId);
  const creatorWallet = await readCircleWallet(creatorId);
  
  // Execute transfer
  const transfer = await circle.createTransaction({
    walletId: likerWallet.walletId,
    destinationAddress: creatorWallet.walletAddress,
    tokenAddress: USDC_TOKEN_ADDRESS,
    amounts: [String(totalAmount)],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  });
  
  // Mark settled
  await batch.ref.update({
    status: 'settled',
    settledAt: FieldValue.serverTimestamp(),
    circleTransactionId: transfer.data?.id,
  });
  
  // Update balances (or rely on webhook/poll)
  return { success: true, transactionId: transfer.data?.id };
});
```

### Platform Fee

Deduct 10% platform fee on settlement:
```typescript
const creatorAmount = totalAmount * 0.9;
const platformAmount = totalAmount * 0.1;

// Transfer 90% to creator
await circle.createTransaction({ ...creatorWallet, amounts: [String(creatorAmount)] });

// Transfer 10% to platform wallet
await circle.createTransaction({ ...platformWallet, amounts: [String(platformAmount)] });
```

> Or better: do this in a single transaction if Circle supports multi-destination. If not, two calls.

---

## 6. Prompt Lock (API-Level)

### Implementation

Create a Cloud Function `getPrompt` that strips fields based on caller tier:
```typescript
export const getPrompt = onCall(async (data, context) => {
  const uid = context.auth?.uid;
  const { promptId } = data;
  
  const promptDoc = await db.collection('prompts').doc(promptId).get();
  if (!promptDoc.exists) throw new HttpsError('not-found', 'Prompt not found');
  
  const promptData = promptDoc.data();
  
  // Get user tier
  let tier = 0;
  if (uid) {
    const userPrivate = await db.collection('usersPrivate').doc(uid).get();
    tier = userPrivate.data()?.tier ?? 0;
  }
  
  // Tier 0 — strip everything sensitive
  if (tier === 0) {
    const { promptText, model, ...safe } = promptData;
    return {
      ...safe,
      promptPreview: promptText?.split(' ').slice(0, 5).join(' ') + '...',
    };
  }
  
  // Tier 1 — full prompt, no workflow
  if (tier === 1) {
    return promptData; // Prompt Cards only
  }
  
  // Tier 2 — everything
  return promptData;
});
```

> The frontend must call `getPrompt()` instead of reading Firestore directly for prompt content.

---

## 7. Frontend Integration Steps

### Step 1 — Wire Up `walletApi`
- Import `walletApi` in `src/app/components/...` where wallet UI lives
- Add "Wallet" section to user profile / settings
- Show: address (truncated), balance, deposit button, transaction history

### Step 2 — Add Tier UI
- Show current tier badge on profile
- Show "Upgrade to Pro" CTA for Tier 1 users
- Show "Deposit to Unlock" CTA for Tier 0 users
- Lock prompt text / workflow steps with blur overlay + CTA

### Step 3 — Batched Like UI
- Show like button (already exists)
- After like, show toast: "Like recorded. $0.001 will be sent to @creator."
- Show pending batch status in wallet UI

### Step 4 — Deposit Flow
- For testnet: "Get Free Test USDC" button → calls `requestTestnetTokens`
- For mainnet: Show QR code of user's Circle wallet address

---

## 8. Build Order (Revised)

| # | Task | Effort | Blocker |
|---|---|---|---|
| 1 | **Fix deployment** — Downgrade Functions to v1 OR enable billing | 30 min | — |
| 2 | **Add `tier`, `likePrice`, `walletBalance` to `usersPrivate`** | 1 hr | #1 |
| 3 | **Auto-create Circle wallet on signup** | 1 hr | #1 |
| 4 | **Implement `getPrompt` Cloud Function with tier stripping** | 2 hrs | #1 |
| 5 | **Frontend: prompt lock UI (blur + CTA)** | 2 hrs | #4 |
| 6 | **Implement batched like + `settleLikeBatch` function** | 3 hrs | #1, #2 |
| 7 | **Frontend: wallet panel (balance, deposit, history)** | 3 hrs | #3 |
| 8 | **Frontend: tier badges + upgrade CTAs** | 2 hrs | #2 |
| 9 | **Testnet: faucet integration** | 1 hr | #1 |
| 10 | **Platform fee deduction (10%)** | 1 hr | #6 |
| 11 | **Webhook signature verification** | 2 hrs | #1 |
| 12 | **Mainnet: real USDC on-ramp** | 4 hrs | Billing |

---

## 9. Immediate Next Action

**Do this first:**

```bash
cd "C:\Users\DELL\Desktop\Hackathon Products\cueratefinal\functions\src"
```

Replace v2 imports with v1 in all three files (`index.ts`, `config.ts`, `circle.ts`), then:

```bash
cd "C:\Users\DELL\Desktop\Hackathon Products\cueratefinal"
npm run functions:deploy
```

This unblocks everything else. If it still fails, enable Firebase billing (Option C).

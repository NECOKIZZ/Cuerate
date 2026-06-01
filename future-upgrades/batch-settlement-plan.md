# Batch Settlement Implementation Plan

## Current State (Working)
- `recordPaidLike` → creates `likePayments` with `pending_settlement` status
- `settlePendingPayments` → manually batches & processes Circle transfers
- `lockedBalance` tracks reserved USDC per user
- Firestore collections: `likePayments`, `settlementBatches`, `usersPrivate`

---

## Phase 1: Webhook Completion (Critical)
**Goal:** Circle webhooks update payment status when on-chain tx finalizes.

1. **Create `onCircleWebhook` HTTPS function**
   - Verify webhook signature using Circle secret
   - Listen for `transactions.outbound` and `transactions.inbound`
   - Update `settlementBatches.status` → `complete` / `failed`
   - Update `likePayments.status` → `settled` / `failed`
   - Adjust `lockedBalance` on completion (currently done pre-transfer; verify this is correct or move to webhook)

2. **Add webhook URL in Circle Console**
   - `https://us-central1-cuerate-e31b5.cloudfunctions.net/onCircleWebhook`

---

## Phase 2: Automated Trigger (Schedule-Based)
**Goal:** Run settlement automatically every N minutes.

1. **Create `scheduleSettlement` Cloud Scheduler job**
   - Runs every 5-15 minutes via `functions.pubsub.schedule()`
   - Calls same batching logic as `settlePendingPayments`
   - Add configurable threshold: only settle if batch value >= $0.01 or payment count >= 5

2. **Add `settlementConfig` doc in Firestore**
   - `minBatchAmountMicros`, `maxBatchSize`, `cronInterval`
   - Admin can tune without redeploy

---

## Phase 3: Retry & Dead Letter Queue
**Goal:** Handle transient failures gracefully.

1. **Add retry logic in `settlePendingPayments`**
   - If Circle API fails with retryable error, mark batch `retrying` instead of `failed`
   - Exponential backoff (next run picks it up)

2. **Dead letter collection: `failedSettlements`**
   - After 3 retries, move to manual review queue
   - Admin dashboard shows these for inspection

---

## Phase 4: Batch History & Frontend
**Goal:** Users see their payment flow.

1. **Wallet screen additions**
   - List of `settlementBatches` where user is liker or creator
   - Show: amount, status, tx hash, timestamp
   - Filter: pending / complete / failed

2. **Like button UX improvement**
   - Show micropayment indicator (e.g., "0.001" tooltip)
   - Toast on like: "Payment queued for batch"

---

## Phase 5: Safety & Monitoring
**Goal:** Prevent double-spend and monitor health.

1. **Idempotency**
   - Settlement batch id = hash of sorted payment IDs
   - Prevents duplicate Circle transactions on retry

2. **Metrics logging**
   - Log batch size, settlement time, success rate
   - Cloud Monitoring alerts if failure rate > 5%

3. **Balance sanity check**
   - Before creating Circle tx: verify `actualBalance >= lockedBalance + batchAmount`
   - If mismatch, auto-reconcile (clear stale locks)

---

## Priority Order
| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| High | 1 - Webhooks | 2-3 hrs | Essential for production |
| High | 3 - Retry/DLQ | 2 hrs | Prevents stuck payments |
| Medium | 2 - Auto Trigger | 1-2 hrs | Removes manual step |
| Medium | 5 - Safety checks | 2 hrs | Prevents edge case bugs |
| Low | 4 - Frontend polish | 3-4 hrs | UX improvement |

---

## Key Files to Create/Modify
- `functions/src/webhooks.ts` — new
- `functions/src/index.ts` — add scheduler + retry logic
- `functions/src/config.ts` — add `settlementConfig` type
- `src/app/screens/Wallet.tsx` — batch history UI

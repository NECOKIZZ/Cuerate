# Cuerate Integration & Security Audit

**Date:** 2026-05-30
**Auditor:** Cascade (AI auditor)
**Scope:** Circle developer-controlled wallets (backend + frontend) + Firestore security rules
**Status:** No code changes made — audit only

---

## 1. Circle Developer-Controlled Wallets Integration

### Files Reviewed
- `functions/src/index.ts` — Cloud Functions (wallet creation, balance, transfers, webhook)
- `functions/src/circle.ts` — SDK client initialization
- `functions/src/config.ts` — Environment configuration
- `src/lib/wallet.ts` — Frontend wallet API wrapper
- `functions/package.json` — Dependency versions
- `.env` — Environment variables

### Correctly Implemented
- SDK initialization uses `initiateDeveloperControlledWalletsClient` with correct `apiKey` + `entitySecret`.
- API call shapes match Circle v8 SDK: `createWallets`, `getWalletTokenBalance`, `createTransaction`.
- Fee configuration (`{ type: 'level', config: { feeLevel: 'MEDIUM' } }`) matches `FeeConfiguration<FeeLevel>`.
- All callable functions enforce Firebase Auth via `requireAuth`.
- Idempotency keys generated with `crypto.randomUUID()`; transfer idempotency reuses `paymentRef.id`.
- `assertTestnetTransfersOnly` blocks mainnet transfers unless `CUERATE_ALLOW_LIVE_TRANSFERS=true`.
- TypeScript compilation (`tsc --noEmit`) passes with zero errors.

### Issues Found

| Severity | # | Issue | Location |
|---|---|---|---|
| **Critical** | CW-1 | **Webhook endpoint does NOT verify Circle signatures.** Any actor can POST fake events. | `functions/src/index.ts:255-271` |
| **High** | CW-2 | **Missing `functions/.env`.** Firebase Functions local emulator will not see `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, etc. | `.env:13` (comment) |
| **High** | CW-3 | **Root `.env` contains non-functional placeholder values** (`CIRCLE_ENTITY_SECRET=32_byte_hex_entity_secret`, `CIRCLE_WALLET_SET_ID=wallet_set_id`). Integration will fail at runtime. | `.env:15-16` |
| **Medium** | CW-4 | **`as any` casts on `createWallets` and `createTransaction`** bypass type safety. Likely caused by `AccountType` type mismatch. | `functions/src/index.ts:102, 235` |
| **Medium** | CW-5 | **Circle SDK errors are not wrapped.** Raw 4xx/5xx errors propagate to the client, leaking internal details. | `functions/src/index.ts` (all calls) |
| **Medium** | CW-6 | **`resolveUsdcTokenAddress` fails for empty/zero-balance wallets.** If `CIRCLE_USDC_TOKEN_ADDRESS` is unset and wallet has no USDC record, the function throws. | `functions/src/index.ts:58-77` |
| **Low** | CW-7 | **Frontend `walletApi` is dead code.** No component imports `ensureCircleWallet`, `getCircleWalletStatus`, or `createTestUsdcTransfer`. | `src/lib/wallet.ts` |
| **Low** | CW-8 | **`CIRCLE_USDC_TOKEN_ADDRESS` is empty.** Runtime balance lookup is fragile; ARC-TESTNET USDC contract address should be hardcoded or configured. | `.env:19` |

---

## 2. Firestore Security Rules Audit

### File Reviewed
- `firestore.rules` (424 lines)
- Cross-referenced with `src/lib/backend.ts` (frontend collections) and `functions/src/index.ts` (backend collections)

### Issues Found

| Severity | # | Issue | Location |
|---|---|---|---|
| **Critical** | FR-1 | **`users` collection has ZERO field restrictions.** Any signed-in user can inject arbitrary fields into their public profile (e.g., `walletReady: true`, `tier: 'premium'`, `totalEarned: '999999'`). Since `users` is world-readable, forged fields are visible to the entire app. | `firestore.rules:233-236` |
| **Critical** | FR-2 | **`authLogs` allows unauthenticated injection.** The rule `(request.resource.data.event == 'email_link_sent')` does NOT require `isSignedIn()`. Any actor can create audit-log docs with arbitrary data. | `firestore.rules:281-286` |
| **Critical** | FR-3 | **Prompt/workflow counter updates do NOT constrain changed keys.** During a "like" or "save", a client can simultaneously mutate any **unlisted** field (e.g., inject backdoor data). The fork-metadata and identity-sync rules correctly use `hasOnly`; counter rules do not. | `firestore.rules:31-105` (counter functions) |
| **High** | FR-4 | **`notifications` update allows any field mutation.** Recipients can change `message`, `fromHandle`, `type`, or inject arbitrary data. Should be restricted to `diff().changedKeys().hasOnly(['read'])`. | `firestore.rules:384-406` |
| **High** | FR-5 | **Prompt author can delete anyone's like/save/copy.** `isPromptAuthor(resource.data.promptId)` grants delete permission on `promptLikes`, `promptSaves`, `promptCopies` to the content author. | `firestore.rules:319-356` |
| **Medium** | FR-6 | **`usersPrivate` create allows arbitrary non-blocked fields.** Only a deny-list is used; clients can add garbage data. | `firestore.rules:12-15` |
| **Medium** | FR-7 | **`collections` update has no field restrictions.** A user can change `userId` to transfer ownership. | `firestore.rules:408-412` |
| **Medium** | FR-8 | **`emailLookup` create/update has no field restrictions.** Could be used as a covert storage channel. | `firestore.rules:288-291` |
| **Medium** | FR-9 | **`walletTransfers`, `likePayments`, `withdrawals` read rules fail on non-existent docs.** `resource.data.xxx` access causes a runtime rule error when the doc does not exist. | `firestore.rules:244-275` |
| **Low** | FR-10 | **`workflows` missing fork metadata update rule.** No `isWorkflowForkMetadataUpdate` function; workflow forking would be denied. | `firestore.rules:307-317` |
| **Low** | FR-11 | **`users` collection `walletReady` is client-writable.** Backend `ensureCircleWallet` writes this field, but clients can bypass the flow. Should be server-only or moved to `usersPrivate`. | `firestore.rules:233-236` |
| **Low** | FR-12 | **`userFollows` read is fully public.** Unauthenticated users can see follower/following relationships. Likely intentional, but worth privacy review. | `firestore.rules:414-421` |

---

## Recommended Priority Order

### P0 (Fix before production)
1. **FR-1** — Add `request.resource.data.diff(resource.data).changedKeys().hasOnly([...])` or equivalent to `users` create/update.
2. **FR-2** — Require `isSignedIn()` for ALL `authLogs` operations.
3. **FR-3** — Add `diff().changedKeys().hasOnly([...])` to counter-update functions.
4. **CW-1** — Implement Circle webhook signature verification using `getNotificationSignature()`.

### P1 (Fix before mainnet)
5. **CW-2 / CW-3** — Set real `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_SET_ID` via Firebase Secret Manager (production) or `functions/.env` (local).
6. **FR-4** — Restrict `notifications` update to `read` field only.
7. **FR-5** — Decide if prompt author deletion of interactions is intentional; if not, remove `isPromptAuthor` from delete rules.
8. **CW-5** — Wrap Circle SDK errors into `HttpsError` before sending to client.

### P2 (Quality / Maintainability)
9. **CW-4** — Remove `as any` casts by aligning `AccountType` type with Circle SDK enum.
10. **CW-6 / CW-8** — Hardcode or configure `CIRCLE_USDC_TOKEN_ADDRESS` for ARC-TESTNET.
11. **FR-6** — Switch `usersPrivate` create to an allow-list (`hasOnly`) instead of a deny-list.
12. **FR-7** — Prevent `collections` `userId` mutation on update.
13. **FR-10** — Add `isWorkflowForkMetadataUpdate` rule if workflow forking is supported.
14. **CW-7** — Wire up `walletApi` in the frontend UI or remove dead code.

---

## Summary

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Circle Wallets | 1 | 2 | 3 | 2 |
| Firestore Rules | 3 | 2 | 4 | 3 |
| **Total** | **4** | **4** | **7** | **5** |

The **Circle backend integration is structurally correct** and matches the v8 SDK. However, it is **not production-ready** due to unverified webhooks, missing environment configuration, and no frontend consumption.

The **Firestore rules have solid counter-update logic** but suffer from **missing field restrictions** on several collections, allowing clients to forge public-profile data and inject unauthenticated audit logs.

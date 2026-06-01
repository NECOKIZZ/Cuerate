# Build Optimizations & Future Upgrades

## 1. Settlement Batching — Current vs. Future

### Current Behavior (May 2026)
`settlePendingPayments` is a **manual callable Cloud Function**.

- When called, it queries all `likePayments` with `status: "pending_settlement"` (limit 100)
- Groups payments by `(likerId, creatorId)` pairs
- Sends one Circle transfer per group
- Creates `settlementBatches/{id}` for audit trail
- Reduces `lockedBalance` optimistically
- Webhook (`circleWebhook`) confirms/fails and updates final state

**Trigger:** None. Must be invoked manually by calling `walletApi.settlePendingPayments()`.

### Recommended Future Upgrades

| Priority | Upgrade | Description |
|---|---|---|
| High | **Scheduled settlement** | Firebase scheduled function running every 5 minutes to auto-call `settlePendingPayments` |
| High | **UI "Settle Now" button** | Button in Wallet screen for admins to trigger settlement manually |
| Medium | **Per-session threshold** | Auto-settle when a user's `paymentSessions/{id}` hits `$1.00` in `pendingAmountMicros` |
| Medium | **Session timeout settlement** | Auto-settle when user inactive for 5+ minutes |
| Low | **Real-time settlement** | Per-like on-chain settlement (only viable at massive scale with L2 batching) |

## 2. Frontend Bundle Size Warning

### Current State
Build output:
```
dist/assets/index-CioIKEN1.js   1,160.44 kB │ gzip: 295.22 kB
(!) Some chunks are larger than 500 kB after minification.
```

### Impact
- Initial page load downloads ~295 KB gzipped JavaScript
- Large bundle blocks interactivity until fully parsed
- Especially painful on mobile / slow connections

### Recommended Fixes

#### Option A — Dynamic Imports (Code Splitting)
Split routes into lazy-loaded chunks:

```ts
// src/app/routes.tsx
const Wallet = lazy(() => import('./screens/Wallet'));
const Feed = lazy(() => import('./screens/Feed'));
```

Vite automatically code-splits on `import()`.

#### Option B — Manual Chunks (Vendor Splitting)
In `vite.config.ts`:

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/functions', 'firebase/firestore'],
          ui: ['lucide-react'], // or whatever UI lib you use
        },
      },
    },
  },
});
```

This separates vendor code from application code, improving cacheability.

#### Option C — Increase Warning Threshold (Quick Fix)
In `vite.config.ts`:

```ts
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1200, // suppress warning (does not fix problem)
  },
});
```

**Not recommended** — hides the problem rather than fixing it.

### Priority
Bundle size optimization is **Low priority** until after mainnet launch. The app works fine at current size. Revisit after:
- Micropayments are verified working
- Tier system is implemented
- User growth justifies the engineering time

# Tier System Implementation Plan

## Phase 1: Core Tier Infrastructure

### 1.1 Firestore Schema Updates
- Add `tier` (0|1|2), `likePrice` (0.001|0.01), `badge` field to `users` doc
- Add `tier` field to `usersPrivate.circle` subdoc for wallet-tier linkage
- Add `platformFeeMicros` (10%) to each `likePayment` doc for revenue tracking

### 1.2 Tier Detection Logic (Cloud Function)
- Create `recalculateTier` triggered on `usersPrivate` write (balance change)
- Rules:
  - `balance === 0` → Tier 0
  - `balance > 0 && likePrice === 0.001` → Tier 1
  - `balance > 0 && likePrice === 0.01` → Tier 2
- Updates `users` doc and `usersPrivate.circle` atomically

### 1.3 Like Price Preference
- Add "Set Like Price" toggle in Wallet screen ($0.001 vs $0.01)
- Changing price updates `likePrice` and triggers `recalculateTier`
- Must have balance > 0 to select either option

---

## Phase 2: Deposit Flow (Tier 0 → 1 Conversion)

### 2.1 Deposit UI
- Wallet screen: "Deposit USDC" button with preset amounts ($1, $5, $10)
- Show conversion: "$1 = ~1,000 likes at $0.001 each"
- Circle fiat on-ramp or crypto deposit QR

### 2.2 Deposit Webhook/Confirmation
- Listen for Circle deposit completion (or poll `getWalletTokenBalance`)
- On confirmed deposit:
  - Update `usdcBalance`
  - Trigger `recalculateTier`
  - Show "Welcome to Tier 1" toast with 🌱 badge

---

## Phase 3: Prompt Lock (API-Level Access Control)

### 3.1 Secure Post Fetch (Cloud Function)
- Replace direct Firestore reads with `getPost` callable function
- Strip fields based on caller's tier:
  - **Tier 0**: remove `prompt`, `workflowSteps`, `promptPreview` → return only first 5 words as teaser
  - **Tier 1**: remove `workflowSteps` only
  - **Tier 2**: return full document

### 3.2 Frontend Lock UI
- Tier 0 sees blurred prompt with "Deposit to reveal" CTA overlay
- Tier 1 sees full prompt but "Upgrade to Pro" lock on Workflow Cards
- Tier 2 sees everything

### 3.3 Feed/List Views
- `listPosts` function also strips prompts for Tier 0
- Never send full prompt data to frontend for Tier 0, even in bulk responses

---

## Phase 4: Like Payment Integration with Tiers

### 4.1 Dynamic Like Pricing
- `recordPaidLike` reads liker's `likePrice` from `users` doc
- Uses that value instead of hardcoded $0.001
- Records `tier` in `likePayment` doc for analytics

### 4.2 Creator Earnings Calculation
- Apply 10% platform fee: `creatorGets = amount * 0.9`
- `settlePendingPayments` deducts fee, sends 90% to creator
- Track `totalEarned` on `users` doc

### 4.3 Algorithmic Boost (Tier 2 Likes)
- `posts.likers` map stores `{ userId: tier }`
- Feed ranking weights: Tier 2 like = 10 points, Tier 1 = 1 point
- Update `posts.likeWeightScore` on each like for sorting

---

## Phase 5: Workflow Cards

### 5.1 Post Creation
- Add "Workflow Card" as second post type in creation flow
- UI: step-by-step prompt builder (step 1, step 2, etc.)
- Save `type: "workflow_card"` and `workflowSteps` array

### 5.2 Tier 2 Gating
- Workflow Cards show in feed to all tiers
- Tier 0/1 clicking it sees preview + "Upgrade to Pro to see workflow" CTA
- Tier 2 sees full step-by-step breakdown

---

## Phase 6: Badges & Social Layer

### 6.1 Profile Badges
- Supporter 🌱 badge on Tier 1 profiles
- Pro 👑 badge on Tier 2 profiles (most visible)
- Display on post headers, comments, leaderboards

### 6.2 Supporters Leaderboard
- Global "Top Supporters" page showing users by total likes given
- Weighted: Tier 2 likes count 10x
- Tier 2 users get premium placement

### 6.3 Ghost Creator Notifications
- When Tier 0 user's post gets 10+ likes, send push/notification:
  - "Your post has 47 likes! Deposit $1 to start earning from them."
- Conversion hook: show projected earnings ("You could have earned $0.047")

---

## Phase 7: Fork Feature

### 7.1 Fork Permission
- Block fork attempt if user is Tier 0 (return `failed-precondition`)
- Tier 1+ can fork any post they can view

### 7.2 Fork Flow
- "Fork" button copies prompt to new post editor
- Pre-populate with original prompt + model info
- New post stores `forkedFrom: { originalPostId, originalCreatorId }`
- Display lineage: "Forked from @originalCreator" on new post

---

## Priority Order

| Priority | Phase | Effort |
|----------|-------|--------|
| 🔴 High | 1 - Tier Infrastructure | 2 hrs |
| 🔴 High | 2 - Deposit Flow | 3 hrs |
| 🔴 High | 3 - Prompt Lock | 2 hrs |
| 🟡 Med | 4 - Dynamic Like Pricing | 1 hr |
| 🟡 Med | 6 - Badges & Leaderboard | 2 hrs |
| 🟢 Low | 5 - Workflow Cards | 3 hrs |
| 🟢 Low | 7 - Fork | 2 hrs |

---

## Key Files to Modify

- `functions/src/index.ts` — add `recalculateTier`, update `getPost`, `listPosts`
- `src/app/screens/Wallet.tsx` — deposit UI, like price toggle, badge display
- `src/app/components/PostCard.tsx` — prompt lock overlay, tier gating
- `src/app/screens/CreatePost.tsx` — Workflow Card creation flow
- `functions/src/config.ts` — add `PLATFORM_FEE_PERCENT` constant

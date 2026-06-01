# Cuerate — Full Product & Build Documentation
> *Instagram for AI video prompts. Built on USDC micropayments via Circle + x402.*

---

## 1. What Is Cuerate?

Cuerate is a social platform for AI video creators. Users come to post their AI-generated videos alongside the prompts and workflows used to create them. The goal is to be the go-to destination for AI video inspiration — where creators share their process and get paid instantly when people engage with their work.

Think of it as **Instagram meets GitHub for AI video prompts**, with micropayments baked into every interaction.

**Core value proposition:**
- Creators post AI videos with prompts attached
- Viewers discover, like, save, fork, and copy prompts
- Every like = instant USDC micropayment to the creator
- No subscriptions, no ads, no middlemen

**Live platform:** [cuerateprompt.vercel.app](https://cuerateprompt.vercel.app)  
**Auth:** Firebase (Google Sign-In)  
**Storage:** Supabase  
**Payments:** Circle Developer Controlled Wallets + x402 protocol  
**Blockchain:** Ack Network (testnet first)

---

## 2. Core User Actions

There are five core actions on Cuerate:

| Action | Description |
|---|---|
| **Post** | Upload an AI video with prompt, model info, and optional workflow steps |
| **Like** | Engage with a post — triggers instant USDC micropayment to creator |
| **Save** | Bookmark a post to your personal collection |
| **Copy Prompt** | Copy the raw prompt text to clipboard |
| **Fork** | Take a creator's prompt, remix it, post your own version (like GitHub fork) |

---

## 3. Card Types

Posts on Cuerate exist as one of two card types:

### Prompt Card
- Standard post format
- Contains: AI video + single prompt + model used
- Available to create and view across all tiers (with restrictions — see Tier System)

### Workflow Card
- Advanced post format for complex or long-form AI videos
- Contains: AI video + step-by-step prompt breakdown
- Creator documents their full process: *"To get this scene I used X prompt, then adjusted with Y, then Z"*
- Multiple prompts, multiple steps, multiple models potentially
- **Viewing requires Tier 2** (see Tier System)

---

## 4. Tier System

Cuerate has three tiers based on USDC deposit and per-like price. The deposit unlocks platform features. The per-like price determines how much creators earn per engagement.

### Tier 0 — No Deposit (Lurker / Ghost Creator)

**Can:**
- Watch Prompt Card videos
- Browse and search the platform
- Post videos (Prompt Cards and Workflow Cards)

**Cannot:**
- See any prompts (locked/blurred)
- See Workflow Card content
- Like posts
- Save posts
- Copy prompts
- Fork posts
- **Earn anything** — likes on their posts show visually but zero USDC moves

> Ghost creators can post and build an audience, but their posts are completely non-monetizable until they deposit. This is intentional — it keeps them on the platform long enough to see the value of depositing.

---

### Tier 1 — $0.001 per like
*~$1 deposit = ~1,000 likes*

**Everything in Tier 0, plus:**
- See Prompt Card prompts ✅
- Like posts (triggers $0.001 USDC to creator) ✅
- Save posts ✅
- Copy prompts ✅
- Fork posts ✅
- Posts are fully monetizable ✅
- **Supporter 🌱** badge on profile

> Tier 1 is the core unlock. For $1, everything opens up. This is the main conversion target for Tier 0 users.

---

### Tier 2 — $0.01 per like
*~$10 deposit = ~1,000 likes*

**Everything in Tier 1, plus:**
- See Workflow Cards (full step-by-step breakdowns) ✅
- Like weight = **10x** Tier 1 (creator earns $0.01 per like vs $0.001)
- **Pro 👑** badge on profile — most visible badge on platform
- Posts liked by Tier 2 users get algorithmic boost
- Access to global top supporters leaderboard

> Tier 2 is for serious creators and power users. The 10x like weight means one Tier 2 like = 10 Tier 1 likes in creator earnings.

---

### Summary Table

| Feature | Tier 0 | Tier 1 | Tier 2 |
|---|---|---|---|
| See Prompt Card video | ✅ | ✅ | ✅ |
| See Prompt Card prompts | ❌ | ✅ | ✅ |
| See Workflow Card video | ❌ | ❌ | ✅ |
| See Workflow Card steps/prompts | ❌ | ❌ | ✅ |
| Like posts | ❌ | ✅ | ✅ |
| Save posts | ❌ | ✅ | ✅ |
| Copy prompts | ❌ | ✅ | ✅ |
| Fork posts | ❌ | ✅ | ✅ |
| Post cards | ✅ | ✅ | ✅ |
| Monetizable posts | ❌ | ✅ | ✅ |
| Like weight | — | 1x | 10x |
| Price per like | — | $0.001 | $0.01 |
| Badge | None | Supporter 🌱 | Pro 👑 |

---

## 5. The Prompt Lock — How It Works

**This is the single most important conversion mechanic on the platform.**

Non-depositors can see AI videos but cannot see the prompts used to generate them. The prompt is the product on Cuerate — people come specifically to learn *how* videos were made. Locking the prompt creates a natural, frictionless conversion funnel.

```
User sees incredible AI video
        ↓
Prompt is blurred / locked
        ↓
"Deposit to reveal" CTA
        ↓
User deposits $1 USDC
        ↓
All prompts unlock instantly
```

### Critical Implementation Note

**The prompt must be hidden at the API level, not the frontend.**

Hiding it in the UI is not enough — anyone can inspect network requests and see the prompt in the response payload. The backend must strip the prompt field entirely before returning the response to non-depositors.

**Implementation:**

```javascript
// Firebase Cloud Function — getPost
const getPost = async (userId, postId) => {
  const user = await db.collection('users').doc(userId).get()
  const userTier = user.data().tier // 0, 1, or 2
  
  const post = await db.collection('posts').doc(postId).get()
  const postData = post.data()
  
  // Tier 0 — strip all prompt data
  if (userTier === 0) {
    const { prompt, workflowSteps, promptPreview, ...safePost } = postData
    return {
      ...safePost,
      promptPreview: prompt.split(' ').slice(0, 5).join(' ') + '...' // teaser only
    }
  }
  
  // Tier 1 — strip workflow steps only
  if (userTier === 1) {
    const { workflowSteps, ...safePost } = postData
    return safePost
  }
  
  // Tier 2 — full data
  return postData
}
```

**Prompt Preview Teaser:** Return the first 5 words of the prompt to non-depositors. Just enough to create curiosity. Example: *"A cinematic shot of..."* — this is your conversion hook.

---

## 6. Payment Infrastructure

### Stack
- **Circle Developer Controlled Wallets** — wallet creation and management
- **x402 Protocol** — per-request micropayment standard
- **USDC** — stablecoin for all payments
- **Ack Network** — testnet for development, mainnet for production

### Why Developer Controlled Wallets

Circle offers three wallet types. Cuerate uses **Developer Controlled** because:
- You (Cuerate) control the keys, not the user
- Transactions execute silently in the background
- No PIN, no confirmation popup, no friction per like
- User just sees their balance and activity log

This is the same model as Cash App or Robinhood — the user doesn't think about keys.

### Wallet Creation Flow

Every user gets a Circle wallet automatically on signup. They never see this happen.

```javascript
import { initiateDeveloperControlledWalletsClient } 
  from '@circle-fin/developer-controlled-wallets'

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
})

// Called automatically on Google Sign-In
const createUserWallet = async (userId) => {
  const response = await circle.createWallets({
    walletSetId: process.env.WALLET_SET_ID,
    accountType: "SCA",
    blockchains: ["MATIC-AMOY"], // swap for Ack Network testnet
    count: 1,
    metadata: [{ name: `cuerate_${userId}`, refId: userId }]
  })
  
  const wallet = response.data.wallets[0]
  
  // Save wallet ID to Firebase user record
  await db.collection('users').doc(userId).update({
    walletId: wallet.id,
    walletAddress: wallet.address,
    walletBalance: 0,
    tier: 0
  })
  
  return wallet
}
```

### Like Payment Flow

When a user likes a post, your backend:
1. Checks liker has sufficient USDC balance
2. Determines tier and like price
3. Executes Circle transfer from liker → creator
4. Updates like count and creator balance in Firestore
5. Returns success to frontend

```javascript
const processLike = async (likerId, creatorId, postId) => {
  const liker = await db.collection('users').doc(likerId).get()
  const creator = await db.collection('users').doc(creatorId).get()
  
  const likerTier = liker.data().tier
  const likePrice = likerTier === 2 ? "0.01" : "0.001"
  
  // Check balance
  if (liker.data().walletBalance < parseFloat(likePrice)) {
    return { error: "Insufficient balance. Please deposit USDC." }
  }
  
  // Execute Circle transfer
  await circle.createTransaction({
    walletId: liker.data().walletId,
    tokenId: process.env.USDC_TOKEN_ID,
    destinationAddress: creator.data().walletAddress,
    amounts: [likePrice],
  })
  
  // Update Firestore
  await db.collection('posts').doc(postId).update({
    likes: FieldValue.increment(1),
    [`likers.${likerId}`]: likerTier
  })
}
```

### x402 Session Batching

For high-frequency liking, use x402 wallet sessions instead of individual on-chain calls per like. User authenticates once per session, likes are accumulated, settled periodically.

```javascript
// User opens Cuerate — start session
const session = await x402.createSession({
  walletId: user.walletId,
  maxAmount: "1.00", // session spending limit
  duration: 3600 // 1 hour
})

// Each like uses session token — no individual chain call
await x402.sessionTransfer({
  sessionToken: session.token,
  to: creatorAddress,
  amount: likePrice
})

// Settle at end of session or when threshold hit
await x402.settleSession(session.token)
```

### Tier Detection Logic

A user's tier is determined by their current USDC balance and their chosen like price setting:

```javascript
const getUserTier = (walletBalance, likePrice) => {
  if (walletBalance === 0) return 0
  if (likePrice === 0.001) return 1
  if (likePrice === 0.01) return 2
  return 1 // default
}
```

Tier is stored in Firestore and updated whenever balance changes or like price preference is updated.

---

## 7. Data Models (Firestore)

### User Document
```json
{
  "uid": "firebase_uid",
  "email": "user@gmail.com",
  "displayName": "Creator Name",
  "photoURL": "...",
  "walletId": "circle_wallet_id",
  "walletAddress": "0x...",
  "walletBalance": 1.50,
  "tier": 1,
  "likePrice": 0.001,
  "totalEarned": 12.50,
  "badge": "supporter",
  "createdAt": "timestamp"
}
```

### Post Document
```json
{
  "id": "post_id",
  "creatorId": "firebase_uid",
  "type": "prompt_card", // or "workflow_card"
  "videoUrl": "supabase_storage_url",
  "thumbnailUrl": "...",
  "modelUsed": "Runway Gen-3",
  "prompt": "Full prompt text — NEVER sent to Tier 0 users",
  "promptPreview": "A cinematic shot of...",
  "workflowSteps": [
    { "step": 1, "prompt": "...", "model": "...", "notes": "..." }
  ],
  "likes": 420,
  "saves": 87,
  "forks": 23,
  "likers": { "userId": 1, "userId2": 2 },
  "tags": ["cinematic", "runway", "sci-fi"],
  "createdAt": "timestamp"
}
```

### Fork Document
```json
{
  "id": "fork_id",
  "originalPostId": "post_id",
  "originalCreatorId": "uid",
  "forkedBy": "uid",
  "newPrompt": "Remixed prompt...",
  "newVideoUrl": "...",
  "createdAt": "timestamp"
}
```

---

## 8. The Fork Feature

Fork is Cuerate's GitHub-inspired remix mechanic. When a user forks a post:

1. The original prompt is copied to a new post editor
2. User edits the prompt, generates their own video
3. User posts their version — the new post shows *"Forked from @originalCreator"*
4. The fork lineage is tracked — you can see all forks of a post

**Fork chain example:**
```
@creator posts "A cinematic shot of a neon city at night"
  └── @user1 forks → "A cinematic shot of a neon city at dawn"
        └── @user2 forks → "A cinematic shot of a neon desert at dawn"
```

This creates **discovery loops** — viral prompts generate entire trees of derivative work, all linking back to the original creator.

**Implementation note:** Fork requires Tier 1+. Tier 0 cannot fork.

---

## 9. Conversion Strategy (Tier 0 → Tier 1)

The entire platform is designed to make Tier 0 users *want* to deposit. Key mechanics:

**The prompt lock** — They see incredible videos. The prompt is right there, one deposit away. Curiosity does the selling.

**Ghost creator earnings** — They post, people like their work, they see the like count go up. But they earn $0. The notification *"Your post got 47 likes — start earning from them"* is your best CTA.

**The $1 framing** — Never say "deposit USDC." Say *"$1 unlocks everything — that's ~1,000 likes."* Frame it as value, not cost.

**Workflow Card teaser** — Show Workflow Card thumbnails in the feed to Tier 1 users with a lock icon. *"Upgrade to Pro to see the full workflow."*

---

## 10. Testnet Launch Plan

1. Deploy on **Ack Network testnet**
2. Use Circle faucet for free test USDC
3. Onboard early AI video creators — give them test USDC to seed the platform
4. Measure: at what point do users stop liking when test USDC runs out?
5. Observe: do Tier 0 users convert after seeing their post earn likes with no payment?
6. Calibrate like prices based on engagement data before mainnet

**Key testnet metric to watch:** Conversion rate from Tier 0 → Tier 1 after a user's post receives 10+ likes.

---

## 11. Revenue Model

Cuerate takes a platform cut on every like transaction. Suggested: **10%**.

| Like Price | Creator Gets | Cuerate Gets |
|---|---|---|
| $0.001 (Tier 1) | $0.0009 | $0.0001 |
| $0.01 (Tier 2) | $0.009 | $0.001 |

At scale:

| Users | Active (60%) | Likes/Day | Daily Volume | Cuerate/Day (10%) |
|---|---|---|---|---|
| 10,000 | 6,000 | 120,000 | $120 | $12 |
| 100,000 | 60,000 | 1,200,000 | $1,200 | $120 |
| 1,000,000 | 600,000 | 12,000,000 | $12,000 | $1,200 |

*Assumes 20 likes/day per active user, mix of Tier 1 and Tier 2.*

---

## 12. Build Order (Recommended)

### Phase 1 — Core Platform (Already Live)
- [x] Firebase auth (Google Sign-In)
- [x] Supabase storage
- [x] Post creation (Prompt Cards)
- [x] Feed / discovery

### Phase 2 — Payment Layer
- [ ] Circle SDK integration
- [ ] Auto wallet creation on signup
- [ ] Deposit flow (USDC on-ramp)
- [ ] Like → payment trigger
- [ ] Balance display in UI
- [ ] Tier detection logic

### Phase 3 — Access Control
- [ ] Prompt lock at API level (Cloud Functions)
- [ ] Tier-based API response shaping
- [ ] Prompt preview teaser (first 5 words)
- [ ] Workflow Card type + Tier 2 gate

### Phase 4 — Social Features
- [ ] Fork mechanic
- [ ] Save collection
- [ ] Profile badges (Supporter 🌱 / Pro 👑)
- [ ] Fork lineage display
- [ ] Creator earnings dashboard

### Phase 5 — Testnet Launch
- [ ] Deploy to Ack Network testnet
- [ ] Faucet USDC distribution to early users
- [ ] Feedback collection
- [ ] Conversion rate measurement

### Phase 6 — Mainnet
- [ ] x402 session batching for high-frequency likes
- [ ] Real USDC on-ramp
- [ ] Platform fee collection wallet
- [ ] Creator payout dashboard

---

*Document compiled from product design sessions. Last updated: May 2026.*

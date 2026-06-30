
# Cuerate Agent Economy — Build Spec

> For: Lepton Agents Hackathon (Canteen × Circle × Arc)
> Builds on existing Cuerate stack: Firebase auth, Supabase storage, Circle Developer Controlled Wallets, x402, ARC Network (testnet)
> Covers: (1) Inspiration API — "Pinterest for Agents", (2) Decaying Fork-Royalty Settlement, (3) Remix Agent

---

## 0. Why these three together

The Remix Agent and the Inspiration API both need the same underlying thing: a way to pay out USDC across a *chain* of creators, not just one. Build the royalty settlement logic first as a standalone function — both other features call into it.

```
Inspiration API ──┐
                   ├──> Royalty Settlement Engine ──> Circle Gateway (batched payout)
Remix Agent ───────┘
```

---

## 1. Decaying Fork-Royalty Settlement

### 1.1 Problem

Currently, fork royalties (if paid at all) go 95% to the immediate creator / 5% platform cut, with no credit flowing further back than one hop. A prompt that's been forked 4 times means the person 4 generations back — who may have invented the actual idea — gets nothing.

### 1.2 The rule

When a payment event happens on a post (a like, a remix purchase, an Inspiration API hit), walk that post's fork lineage backward and split the payment geometrically:

| Position in chain | Share |
|---|---|
| Gen 1 (the post being interacted with) | 50% |
| Gen 2 (its parent) | 25% |
| Gen 3 (grandparent) | 12.5% |
| Gen 4 | 6.25% |
| Gen 5 | 3.125% |
| Gen 6 and beyond, **OR** the root/original creator if the chain ends before Gen 6 | absorbs all remaining % |

**Depth cap: 5 generations.** Beyond that, stop walking the chain — fold every remaining ancestor's share into the original/root creator's payout. This keeps the loop bounded (max 5 addresses to pay out, regardless of whether the real chain is 5 or 50 deep) and guarantees the root creator never gets diluted to near-zero on old, much-forked content.

**Worked example — 7-generation chain:**
- Gen 1: 50%
- Gen 2: 25%
- Gen 3: 12.5%
- Gen 4: 6.25%
- Gen 5: 3.125%
- Root creator (absorbs everyone past Gen 5, i.e. Gen 6 + Gen 7 + the infinite remainder): 3.125%

Total always sums to exactly 100%. No on-chain division remainder, no floating point drift, no unbounded loop.

### 1.3 Where this replaces existing logic

In `cuerate-build-doc.md`, Section 8 (Fork Feature) and the `processLike` function in Section 6 currently only know about a single creator per post. This needs to change:

- Every `Post` document needs a `lineage` array: ordered list of `{ creatorId, walletAddress }` from most recent back to the original post. Build this once at fork-time (when `forkPost()` runs) by appending the parent's lineage to the new post's own entry — don't recompute it at payment time, that's an unnecessary lookup chain every single like.
- `processLike`, the new remix-purchase handler, and the new Inspiration API handler all call one shared function: `settlePayment(postId, totalAmount)`.

### 1.4 `settlePayment` — implementation sketch

```javascript
const DEPTH_CAP = 5

async function settlePayment(postId, totalAmount) {
  const post = await db.collection('posts').doc(postId).get()
  const lineage = post.data().lineage // [{creatorId, walletAddress}, ...] most-recent-first

  const payouts = []
  let allocated = 0

  const knownDepth = Math.min(lineage.length, DEPTH_CAP)

  for (let i = 0; i < knownDepth; i++) {
    const share = i < DEPTH_CAP - 1
      ? Math.pow(0.5, i + 1)          // 0.5, 0.25, 0.125, 0.0625...
      : 1 - allocated                  // last slot in the cap absorbs the rest if chain is exactly DEPTH_CAP long
    const amount = totalAmount * share
    payouts.push({ to: lineage[i].walletAddress, amount })
    allocated += share
  }

  // If the real chain is shorter than DEPTH_CAP, whatever's left over
  // (the tail of the infinite geometric series) goes to the root —
  // which is just the last entry in the lineage array.
  if (lineage.length < DEPTH_CAP) {
    const root = lineage[lineage.length - 1]
    const remainder = totalAmount * (1 - allocated)
    const existing = payouts.find(p => p.to === root.walletAddress)
    if (existing) existing.amount += remainder
    else payouts.push({ to: root.walletAddress, amount: remainder })
  }

  return payouts
}
```

### 1.5 Settling on-chain — skip a custom contract

Don't write a Solidity (or Move-style) royalty-split contract. Use **Circle Gateway / Nanopayments batching** instead: pass the `payouts` array from `settlePayment()` straight into one batched Gateway transaction. This is faster to build, reuses the existing Circle SDK already wired into Cuerate, and directly demonstrates "Circle tool usage" for judging since the batching mechanism *is* the settlement engine, not an implementation detail underneath it.

```javascript
const payouts = await settlePayment(postId, totalAmount)

await circleGateway.batchTransfer({
  sourceWalletId: payer.walletId,
  transfers: payouts.map(p => ({
    destinationAddress: p.to,
    amount: p.amount.toFixed(6), // nanopayment precision
    token: 'USDC'
  }))
})
```

Platform fee: take Cuerate's cut *before* calling `settlePayment` (e.g. deduct 10% off `totalAmount` up front), so the lineage split is always computed on the post-fee remainder.

### 1.6 Build checklist

- [ ] Add `lineage` array to Post document schema
- [ ] Populate `lineage` on fork creation (append parent's lineage + parent itself)
- [ ] Build `settlePayment(postId, totalAmount)` as shared function
- [ ] Wire `processLike` to call it instead of single-recipient transfer
- [ ] Wire Circle Gateway batched transfer call
- [ ] Test with synthetic chains of depth 1, 5, and 10+ to confirm 100% allocation and bounded gas/loop cost

---

## 2. Inspiration API — "Pinterest for Agents"

### 2.1 The pitch

Cuerate's prompt library becomes something *other AI tools* pay to search, not just something humans browse. An outside agent (or another AI video tool) calls an endpoint, pays a few cents, gets back the best-matching prompt/style for what it's trying to generate, and the original creator gets paid for being the source — even though they never directly interacted with whoever just paid.

### 2.2 How it works, concretely

It's a wrapper around search you already have, with a paywall in front of it.

1. **Endpoint:** `POST /api/v1/inspire` — accepts a style/keyword query (e.g. `"cinematic neon city night"`) and a payer wallet reference.
2. **Paywall:** Use x402 — the request gets a `402 Payment Required` response until payment clears, then the search runs. No need to build custom auth/billing logic, this is exactly the protocol's intended use case.
3. **Search:** Match the query against existing `tags`, `modelUsed`, and `prompt` text fields already in the Post document. Simple keyword/tag scoring is enough for a hackathon — no need for embeddings or vector search unless time allows.
4. **Response:** Return the matched prompt text, model used, and a thumbnail/preview URL. Strip nothing here — the payer already paid to see the full prompt, this isn't the same as the Tier 0 prompt-lock from the core product.
5. **Payment split:** Same `settlePayment()` function from Section 1 — the matched post's creator (and their lineage, if it's a forked post) gets paid automatically.

### 2.3 Engagement side-effect (no extra fee)

Don't charge an additional 0.01 USDC "like" fee on top of the API fee — that's double-charging for one action. Instead, the `/inspire` endpoint should register an automatic like on the returned post as a side effect of the one paid call. This keeps pricing simple (one fee, one transaction) while still feeding the existing tier/badge/leaderboard system — agent-driven demand shows up as real engagement without a confusing two-payment flow.

```javascript
app.post('/api/v1/inspire', requirePayment, async (req, res) => {
  const { query } = req.body
  const match = await searchPostsByTagsAndPrompt(query) // existing search, reused

  // Side effect: counts as a like, no extra charge
  await db.collection('posts').doc(match.id).update({
    likes: FieldValue.increment(1)
  })

  const payouts = await settlePayment(match.id, req.paymentAmount)
  await circleGateway.batchTransfer({ /* ... */ })

  res.json({
    prompt: match.prompt,
    modelUsed: match.modelUsed,
    thumbnailUrl: match.thumbnailUrl
  })
})
```

### 2.4 Build checklist

- [ ] Build `/api/v1/inspire` endpoint
- [ ] Wire x402 payment-required flow in front of it
- [ ] Reuse existing tag/prompt search, no new search infra needed for hackathon scope
- [ ] On response, auto-increment like count (no separate charge)
- [ ] Call shared `settlePayment()` for payout
- [ ] Demo script: call this from a *second*, clearly-separate AI tool/script to prove it's machine-to-machine, not just another human-facing feature

---

## 3. Remix Agent

### 3.1 The pitch

A viewer sees a video they like and instead of forking it manually, pays an agent a small fee (e.g. $0.05) to do it for them. The agent decides how to adapt the prompt, which model to call, and whether to regenerate or reuse a cached result — that decision-making is what makes it an *agent* and not just an automated fork button.

### 3.2 Flow

1. Viewer taps **"Remix this for me"** on a post, pays via x402.
2. Backend reads the original post's `prompt`, `workflowSteps` (if a Workflow Card), and `modelUsed`.
3. **Agent decision point 1 — adapt the prompt.** Call an LLM to rewrite the prompt toward whatever the viewer asked for (a style tweak, a different setting, etc.), grounded in the original.
4. **Agent decision point 2 — cache vs. regenerate.** Check if a sufficiently similar remix already exists (same post + similar requested tweak) before paying to generate a new one. If found, skip generation and just fork the existing result — saves cost, and demonstrates the "cost-vs-value" decisioning judges are scoring for.
5. **Agent decision point 3 — pick a model.** Default to whatever model the original post used, unless the viewer's request implies a different one is better suited (e.g. asking for something the original model can't do well). Cuerate doesn't generate video itself — this is one outbound API call to whichever model is appropriate (Runway, Kling, Pika, etc.), same as a creator would call manually.
6. Generate, upload to Supabase as normal, create a new `Post` + `Fork` document — `lineage` array is the parent's lineage + parent, exactly as in Section 1.
7. Call `settlePayment(originalPostId, remixFee)` — pays the full lineage chain automatically, platform takes its cut first.
8. New post is tagged **"Remixed by Agent for @viewer"**.

### 3.3 Data model additions

```json
// New field on Post document
{
  "remixedByAgent": true,
  "remixRequestedBy": "viewer_uid",
  "remixSourcePostId": "original_post_id"
}
```

No new collection needed — this rides on the existing Fork Document schema from the core build doc, just adds the agent attribution fields.

### 3.4 Build checklist

- [ ] `POST /api/v1/remix` endpoint — takes postId, viewer's tweak request, payment
- [ ] LLM call to adapt prompt (decision point 1)
- [ ] Simple cache check against existing forks of the same post before regenerating (decision point 2)
- [ ] Outbound call to video model API (decision point 3 — model selection logic can be a simple rule for hackathon scope, doesn't need to be sophisticated to count)
- [ ] Create Post + Fork documents with `lineage`
- [ ] Call shared `settlePayment()`
- [ ] Demo script: show the same source post remixed twice with different requested tweaks, to prove the agent is adapting per-request, not just copy-pasting

---

## 4. Suggested build order for the 2-week window

1. **Royalty Settlement Engine** (Section 1) — everything else depends on this, build and test it standalone first with fake data before wiring real payments.
2. **Remix Agent** (Section 3) — most demo-able, most directly shows "agentic sophistication," reuses the settlement engine.
3. **Inspiration API** (Section 2) — fastest to build once settlement engine exists, since it's mostly a thin wrapper + x402 paywall over search you already have. Good for proving machine-to-machine traction in the submission video.

Submit early with a partial build per the hackathon rules (multiple submissions allowed) — don't wait for all three to be polished before the first submission.

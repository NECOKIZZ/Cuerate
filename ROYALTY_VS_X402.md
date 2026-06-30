# Why Cuerate's royalty settlement beats off-the-shelf x402

> TL;DR — Circle's `@circle-fin/x402-batching` is excellent at one thing: moving a micropayment from
> a buyer to **one** seller, gaslessly and batched. Cuerate's problem is different: a single agent
> payment must be **split fairly across an entire chain of creators** — the person who made the
> prompt, the person they forked it from, and so on. We built an on-chain royalty engine that does
> that **atomically and trustlessly**, which the stock x402 flow structurally cannot.

We are **x402-compatible** (our `/inspire` endpoint speaks the HTTP `402 Payment Required` handshake,
so any agent gets the familiar challenge→pay→200 flow). We just don't *settle* through the generic
batching path, because it would throw away the thing that makes Cuerate Cuerate.

---

## The core difference

| | Stock x402 batching | Cuerate on-chain royalty engine |
|---|---|---|
| **Recipients per payment** | One seller address | The whole fork lineage (N generations) |
| **Split logic** | None — money lands at one address | Decaying 50/25/12.5… enforced in Solidity |
| **Atomicity** | Payment settles; any splitting is a **separate, later** off-chain step | **One transaction** pays the fee *and* distributes to every creator |
| **Trust model** | Split (if any) is computed off-chain and trusted | Split is computed **on-chain**, verifiable by anyone |
| **Provenance** | No concept of creative lineage | Fork lineage is a **first-class on-chain registry** |
| **Settlement timing** | Batched (~10 min on testnet) | Immediate, in the same call |

---

## Four concrete reasons ours is the right tool

### 1. Atomic multi-party distribution
With stock x402 the agent pays → USDC lands in one seller wallet → *then* you'd run a second system to
divide it among creators and reconcile who got what. Two systems, two failure modes, a reconciliation
gap. Cuerate's `CuerateRoyalty.settle()` pulls the agent's payment **and** fans it across the lineage
in a **single on-chain transaction**. If the split can't complete, the whole payment reverts. There is
no in-between state where Cuerate is holding money it hasn't distributed.

### 2. The fairness rule is trustless, not a promise
"We pay forkers their share" is marketing unless it's enforceable. Our decay curve, the dust floor,
the 5%-on-originals rule, and the platform-takes-the-remainder rule are **Solidity** — anyone can read
the contract and verify that gen-1 gets 50%, gen-2 gets 25%, and so on, down to the original creator.
Stock x402 has nothing to say about fairness; it just moves money to an address.

### 3. Creative lineage is on-chain, not in our database
Cuerate registers every fork's parent pointer on-chain (`registerPost`). The royalty contract **walks
that lineage itself** at settle time. Provenance — "this remix descends from that original" — is
publicly auditable, not a row in our Firestore we ask you to trust. x402 has no notion of lineage at all.

### 4. An economic model built for remix culture
- **Originals are protected**: a solo creator keeps **95%** (5% platform fee), instead of being diluted.
- **Forks decay**: each generation upstream earns half of the one below it, so credit flows back to
  the people who actually originated the idea — not just the latest remixer.
- **Platform earns from depth, not from originals**: on forked chains the platform takes only the
  geometric *remainder*, so our revenue scales with remix activity rather than taxing new work.
- **Dust floor** stops the chain before sub-$0.00001 slices, so we never waste gas on meaningless
  micro-transfers. (This is the *good* idea from nanopayments — bounded settlement — applied to a
  multi-party split.)

A generic paywall SDK can't express any of this. It was never meant to.

---

## What we still take from Circle (we're deep on the stack)

We didn't avoid Circle — we built **on top of** it:
- **Arc** as the chain (USDC is the native gas token → sub-cent settlement is economically real).
- **Circle Developer-Controlled Wallets** for every creator and the paying agent.
- **Circle contract-execution API** to drive the on-chain settle from the agent's wallet.
- **x402 protocol compatibility** at the API edge for the standard agent experience.

The difference is the **settlement layer**: instead of batching to one seller, we wrote the multi-party,
lineage-aware royalty engine that Circle's primitive deliberately leaves to the application.

---

## One honest line for the judges

> Circle's x402 batching is the right tool for *one buyer → one seller* nanopayments. Cuerate is a
> *creator economy*, where one payment is owed to many. We kept x402's agent-facing handshake and Arc's
> USDC-native settlement, and replaced the single-recipient batching with an on-chain royalty contract
> that splits every payment across the full fork lineage — atomically, trustlessly, in one transaction.

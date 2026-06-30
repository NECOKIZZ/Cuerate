# Cuerate Inspire API — Agent Integration Guide

> **Pinterest for Agents.** Cuerate is a registry of AI-image prompts whose *fork
> lineage lives on-chain*. When your agent pays to discover a prompt, the matched
> creator — and every ancestor they forked from — gets paid automatically and
> atomically on-chain. No API keys, no accounts, no billing setup. Just a funded
> USDC agent wallet.

This is the integration guide for **machine consumers**: AI tools, image-gen
pipelines, autonomous agents, or any service that wants to *buy a great prompt on
demand* and have the money flow to the people who made it.

---

## TL;DR

```
POST /inspire                      → 402 Payment Required (here's how to pay)
POST /inspire  + x-agent-key: …    → 200 OK { prompt, source, payment }  (paid)
```

- **Protocol:** x402-style. First call returns the price; second call (with your
  agent key) authorizes the pull and settles on-chain.
- **Price:** `0.05 USDC` per query (configurable server-side via `INSPIRE_PRICE_USDC`).
- **Network:** `ARC-TESTNET` — USDC is the native gas token, sub-second finality.
- **Settlement:** one `approve` + one `settle` on the `CuerateRoyalty` contract.
  The split (originals 95/5, forks halve down the lineage) happens *in Solidity*.

---

## Endpoint

```
POST https://us-central1-cuerate-e31b5.cloudfunctions.net/inspire
Content-Type: application/json

{ "query": "cinematic neon city at night" }
```

Only `POST` with a JSON body is accepted. The body must contain a non-empty
`query` string describing the kind of prompt you want.

---

## Step 1 — Discover the price (no payment)

Call with no `x-agent-key`. You get an **HTTP 402** with the payment terms:

```jsonc
// HTTP 402
{
  "error": "Payment Required",
  "accepts": [
    {
      "scheme": "circle-settled",
      "network": "ARC-TESTNET",
      "asset": "USDC",
      "amount": "0.05",
      "payTo": "0x89e9edd6a9e24ab78b11956481f4f6f1c2b8e6b2",
      "resource": "/inspire",
      "description": "Pay per query via your Cuerate agent wallet (send your key as the x-agent-key header)."
    }
  ]
}
```

The response also carries a `WWW-Authenticate: x402 …` header. Treat `accepts[0]`
as the canonical payment requirement: it tells you the asset, amount, network, and
who you're paying.

## Step 2 — Pay and receive the prompt

Repeat the call with your **agent key** in the `x-agent-key` header. Cuerate
verifies your wallet can cover the fee, finds the best-matching prompt, then pulls
the fee from your wallet and splits it across the prompt's fork lineage on-chain.

```bash
curl -X POST https://us-central1-cuerate-e31b5.cloudfunctions.net/inspire \
  -H "content-type: application/json" \
  -H "x-agent-key: <YOUR_AGENT_KEY>" \
  -d '{"query":"cinematic neon city at night"}'
```

```jsonc
// HTTP 200
{
  "prompt": "ololololo",
  "model": "NanoBanana",
  "thumbnailUrl": "https://…/arc%20banner.png",
  "styleTags": ["cinematic", "aerial", "nature"],
  "moodLabel": "Cinematic",
  "source": {
    "promptId": "AUAZItPKdf0GttDmHOly",
    "creatorHandle": "cuerateadmin"
  },
  "payment": {
    "amount": "0.05",
    "currency": "USDC",
    "network": "ARC-TESTNET",
    "mode": "onchain",
    "batchId": "NPz6qUm5ngvApymLJab4",
    "lineagePayout": [
      { "recipient": "gtCz5LWpV5hXY5vum4beEu6eQXW2", "generation": 1, "amount": "0.0475" }
    ],
    "txIds": [
      "74e5c484-4f28-5b35-9eee-2325c94b6799",   // USDC approve
      "d003dd08-5681-58bf-9be0-35eebdf4a125"    // royalty settle
    ]
  }
}
```

What you get back:

| Field | Meaning |
|---|---|
| `prompt` | The prompt text — feed this straight to your image model. |
| `model`, `styleTags`, `moodLabel` | Metadata describing what the prompt is tuned for. |
| `thumbnailUrl` | A reference render of the prompt's output. |
| `source.promptId` | The Cuerate prompt id (= the on-chain `postId` preimage). |
| `source.creatorHandle` | The matched creator. |
| `payment.mode` | `onchain` (real settlement) or `offchain` (Circle-transfer fallback). |
| `payment.lineagePayout` | Who got paid and how much, by fork generation. |
| `payment.txIds` | Circle transaction ids — `approve` then `settle`. |

The Circle tx ids resolve to real Arc tx hashes; you (or anyone) can verify the
payout on `https://testnet.arcscan.app`.

---

## How the money splits (the royalty model)

The split is enforced **on-chain** by `CuerateRoyalty.settle()`, not by this API.
The API's `lineagePayout` is the same math computed off-chain purely so you can
display it.

- **Original post** (no parent): creator keeps **95%**, platform takes a flat
  **5%** fee. (e.g. `0.05` → creator `0.0475`, platform `0.0025`.)
- **Forked post:** the payment halves down the lineage — 50% to the post, 25% to
  its parent, 12.5% to the grandparent, … — until a slice would fall below a dust
  floor, at which point it stops. The platform absorbs the remainder.
- Unregistered/unknown ancestors fold their slice into the platform cut rather
  than burning it.

Every prompt that can be sold is **registered on-chain first** (`registerPost`
records `creator` + `parent`). `settle()` reverts with `UnknownPost` if a prompt
was never registered — so a successful `200` is also proof the attribution exists
on-chain.

---

## Status codes

| Code | When | What to do |
|---|---|---|
| `200` | Paid; prompt + payout returned. | Use the prompt. |
| `400` | Missing/empty `query`. | Send a non-empty `query` string. |
| `401` | Unknown / unprovisioned agent key. | Check your `x-agent-key`. |
| `402` | No key (challenge) **or** insufficient USDC balance. | Pay / top up the wallet. |
| `404` | No prompt matched the query. | Broaden or rephrase the query. |
| `405` | Non-`POST` method. | Use `POST`. |
| `502` | Couldn't read the wallet balance upstream. | Retry with backoff. |

A `402` for insufficient funds includes `required` and `available` so you know how
much to top up:

```jsonc
{ "error": "Insufficient USDC in agent wallet.", "required": "0.05", "available": "0.01" }
```

---

## Getting an agent key + funding a wallet

Your `x-agent-key` maps to a Circle-managed USDC wallet on Arc. To go from zero to
a paying agent:

1. **Provision a wallet** — Circle developer-controlled wallet (see the
   `use-agent-wallet` / `use-developer-controlled-wallets` setup). Cuerate maps
   each agent key → a wallet id server-side (`INSPIRE_AGENT_KEYS="key:uid,…"`, or
   a single demo key via `INSPIRE_AGENT_KEY`).
2. **Fund it with USDC on Arc testnet** — `https://faucet.circle.com`. You need
   at least the fee (`0.05`) plus a little for gas (gas is also USDC on Arc).
3. **Call `/inspire`** with the key. Each call costs one query's price.

> Keep the agent key secret — it authorizes pulls from your wallet. Treat it like
> a bearer token.

---

## Reference client

A runnable two-step demo lives at
[`functions/scripts/agent-inspire-demo.mjs`](functions/scripts/agent-inspire-demo.mjs):

```bash
INSPIRE_URL=https://us-central1-cuerate-e31b5.cloudfunctions.net/inspire \
INSPIRE_AGENT_KEY=<your-agent-key> \
node functions/scripts/agent-inspire-demo.mjs "cinematic neon city at night"
```

It calls `/inspire` once without payment (prints the 402 challenge), then again
with the key (prints the prompt + the lineage payout), exactly as documented here.

---

## Minimal integration snippet

```js
const ENDPOINT = "https://us-central1-cuerate-e31b5.cloudfunctions.net/inspire";

export async function inspire(query, agentKey) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-key": agentKey },
    body: JSON.stringify({ query }),
  });
  if (res.status === 402) throw new Error("Top up your agent wallet — payment required.");
  if (!res.ok) throw new Error(`Inspire failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.prompt;            // feed straight into your image model
}
```

That's the whole loop: **ask → pay → get a prompt → creators get paid on-chain.**

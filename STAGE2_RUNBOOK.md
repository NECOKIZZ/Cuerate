# Stage 2 end-to-end runbook — on-chain royalties on Arc

Goal: deploy the royalty contract, then prove the full loop — **create a post → fork it → an agent
pays via `/inspire` → one on-chain tx splits the fee across the fork lineage.**

Everything settles on **Arc testnet**. USDC is the native gas token there, so wallets need testnet
USDC from https://faucet.circle.com for both payments *and* gas.

---

## 0. Prereqs
- `functions/.env` already has `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_WALLET_SET_ID`.
- Foundry installed (`forge --version`). If not: `curl -L https://foundry.paradigm.xyz | bash && foundryup`.

## 1. Create the treasury + registrar wallet
This one Circle wallet receives the platform cut **and** registers forks on-chain.
```bash
cd functions
npm run circle:create-platform-wallet
```
Note the printed **WALLET ADDRESS** and **REGISTRAR_WALLET_ID** (the id is auto-written to `.env`).
Fund the WALLET ADDRESS with Arc testnet USDC at https://faucet.circle.com (it needs gas to register forks).

## 2. Deploy the contract
```bash
cd ../contracts
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
# Deployer key must be a funded Arc testnet wallet (use an encrypted keystore: `cast wallet import deployer`)
forge create src/CuerateRoyalty.sol:CuerateRoyalty \
  --rpc-url "$ARC_TESTNET_RPC_URL" --account deployer --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 <TREASURY_WALLET_ADDRESS>
```
Record the deployed **ROYALTY_CONTRACT_ADDRESS**. Then hand the registrar role to the Circle wallet:
```bash
cast send <ROYALTY_CONTRACT_ADDRESS> "setOwner(address)" <TREASURY_WALLET_ADDRESS> \
  --rpc-url "$ARC_TESTNET_RPC_URL" --account deployer
```
(Run `forge test -vv` first if you want to re-confirm the split math — 7 tests, all green.)

## 3. Configure + deploy functions
In `functions/.env`:
```
INSPIRE_ONCHAIN=true
ROYALTY_CONTRACT_ADDRESS=<deployed address>
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
REGISTRAR_WALLET_ID=<from step 1>
INSPIRE_PRICE_USDC=0.05
INSPIRE_AGENT_KEYS=demokey:<AGENT_UID>     # see step 4 for AGENT_UID
```
```bash
cd functions && npm run deploy
```
Note the deployed `inspire` URL (e.g. `https://<region>-<project>.cloudfunctions.net/inspire`).

## 4. Set up the creator(s) and the agent (in the app)
- **Creators must have a Circle wallet *before* posting** — otherwise the fork can't be registered with
  their address on-chain and their share folds to the platform. In the app, each test creator should
  open the Wallet screen once so `ensureCircleWallet` provisions their wallet.
- **The agent** is just another Cuerate user whose `uid` you map in `INSPIRE_AGENT_KEYS`. Find its uid
  in the Firebase console (`users` collection). Fund the agent's wallet address with Arc testnet USDC —
  it needs enough for the `$0.05` fee **plus gas** for two contract calls (`approve` + `settle`).

## 5. Test forking + on-chain registration
1. As **Creator A**, create an original post **P1**. The `onPromptCreated` trigger registers it on-chain
   (parent = `0x0`). Verify in the functions logs (`onPromptCreated: registered post on-chain`) or:
   ```bash
   cast call <ROYALTY_CONTRACT_ADDRESS> "posts(bytes32)(address,bytes32,bool)" \
     $(cast keccak "<P1_promptId>") --rpc-url "$ARC_TESTNET_RPC_URL"
   ```
2. Fork **P1 → P2** in the app (optionally **P2 → P3** for a deeper chain). Each fork auto-registers
   with its parent pointer.

## 6. The agent call → on-chain royalty split
```bash
cd functions
INSPIRE_URL=<deployed inspire url> INSPIRE_AGENT_KEY=demokey \
  npm run inspire:demo "the words that match P2's prompt/tags"
```
What happens:
1. First call (no key) → **HTTP 402** challenge (the x402 handshake).
2. Second call (with key) → the agent's Circle wallet `approve`s the contract, then calls
   `settle(postId, amount)` → **one on-chain tx** splits the `$0.05` across the lineage:
   - 2-deep chain (P2→P1): P2 creator **50%**, P1 (original) **25%**, treasury **25%**.
   - original post P1 alone: creator **95%**, treasury **5%**.
3. Response includes the prompt, the `lineagePayout` breakdown, and the Circle tx ids. The matched
   post's like count is incremented (agent demand → real engagement, no extra charge).

## 7. Verify on-chain
- Open the settle tx on https://testnet.arcscan.app — you'll see the `Payout` events to each creator
  and the treasury, and `Settled`.
- Check the creator wallet balances increased by their share.

---

## Gotchas
- **Two funded wallets minimum**: the agent (fee + gas) and the registrar/treasury (gas). The deployer
  also needs gas for steps 2.
- **Creator wallet timing**: provision creator wallets before they post, or their lineage slot folds to
  the treasury.
- **Search must match**: `searchPrompts` scores the query against the post's `promptText`/`model`/
  `styleTags`/`moodLabel` — query with words that actually appear on your test post.
- **Settlement is immediate** here (one `settle` tx, fast finality on Arc) — this is *not* the ~10-min
  Gateway batch path; we deliberately don't use that (see `ROYALTY_VS_X402.md`).
- **Fallback**: unset `INSPIRE_ONCHAIN` to fall back to the off-chain Stage 1 path (needs
  `PLATFORM_CIRCLE_WALLET_ADDRESS`); useful if the contract path misbehaves mid-demo.

# Cuerate on-chain royalties — step-by-step (no coding needed)

You run each command by typing it **in this chat with a `!` in front** (so I see the output and guide
you), or in a terminal. Do them **in order**. After each, paste me what it printed.

Everything is on **Arc testnet** (fake money). Wallets need free testnet USDC from
**https://faucet.circle.com** — for both payments and gas.

There are 3 short phases: **make wallets → deploy the contract → test the full loop.**

---

## Phase 1 — Make the two wallets

### Step 1. Create the treasury/registrar wallet
```
!cd "/c/Users/DELL/Desktop/Hackathon Products/cueratefinal/functions" && npm run circle:create-platform-wallet
```
It prints a **WALLET ADDRESS** (starts with `0x…`) and saves ids to your settings file automatically.
**Copy that address.**

### Step 2. Fund it
Open **https://faucet.circle.com**, choose **Arc testnet**, paste the address from Step 1, request USDC.

### Step 3. Create the demo agent wallet (the "AI buyer")
```
!cd "/c/Users/DELL/Desktop/Hackathon Products/cueratefinal/functions" && npm run circle:create-agent-wallet
```
It prints another **WALLET ADDRESS** and sets the demo key (`demokey`). **Copy that address.**

### Step 4. Fund the agent
Same faucet, paste the Step 3 address, request USDC.

---

## Phase 2 — Deploy the royalty contract (Circle does it for you)

### Step 5. Deploy
```
!cd "/c/Users/DELL/Desktop/Hackathon Products/cueratefinal/functions" && npm run deploy:contract
```
This sends the contract to Arc from your treasury wallet, waits ~1–3 min, and saves the
**ROYALTY_CONTRACT_ADDRESS** automatically. (That wallet becomes the owner + treasury — no extra steps.)

### Step 6. Turn on on-chain mode
```
!cd "/c/Users/DELL/Desktop/Hackathon Products/cueratefinal/functions" && printf "\nINSPIRE_ONCHAIN=true\nINSPIRE_PRICE_USDC=0.05\n" >> .env
```

### Step 7. Publish the backend
```
!cd "/c/Users/DELL/Desktop/Hackathon Products/cueratefinal/functions" && npm run deploy
```
This uploads the functions. When it finishes it prints a URL ending in **`/inspire`** — **copy it.**
(If it asks you to log in to Firebase, run `!npx firebase login` first, then re-run this.)

---

## Phase 3 — Test the whole loop

### Step 8. In the Cuerate app
1. Sign in. Open the **Wallet** screen once so your account gets a wallet (needed so you get paid).
2. **Create a post** (this is the "original").
3. **Fork that post** (makes a 2-level lineage). Optionally fork the fork for a deeper chain.

### Step 9. Run the agent (the paid machine-to-machine call)
Replace `<INSPIRE_URL>` with the URL from Step 7, and put words that appear in your post in quotes:
```
!cd "/c/Users/DELL/Desktop/Hackathon Products/cueratefinal/functions" && INSPIRE_URL=<INSPIRE_URL> npm run inspire:demo "your post keywords here"
```
You'll see:
- First call → **402 Payment Required** (the paywall).
- Second call → **200** with the prompt and a **lineage payout** breakdown + transaction ids.

### Step 10. See it on the blockchain
Open **https://testnet.arcscan.app**, paste a transaction id from Step 9. You'll see the single
`settle` payment split out to each creator and the treasury.

---

## What "good" looks like
- Original post paid alone → creator gets 95%, treasury 5%.
- A fork paid → the fork's creator 50%, the original 25%, treasury the remainder.

## If something errors
Paste the full red/error text to me. The most likely first-time hiccup is in Step 9 (the live Circle
payment call) — that's the one spot we couldn't test until now, and I'll fix whatever it shows.

## Safety valve
If the on-chain path misbehaves mid-demo, you can switch back to the simpler off-chain version by
removing `INSPIRE_ONCHAIN=true` from `.env` and re-running Step 7.

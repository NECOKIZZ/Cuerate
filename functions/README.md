# Cuerate Functions

Firebase Functions backend for Circle wallet operations and future payment-owned actions.

## Current Wallet Choice

Cuerate currently defaults to Circle **SCA** wallets because the product goal is frictionless per-like USDC payments:

- better fit for gas-sponsored or account-abstraction payment UX
- better long-term shape for silent creator payments
- requires using a Circle-supported EVM chain for SCA wallets

The wallet records include `accountType`, `walletId`, `walletAddress`, and `blockchain` so Cuerate can still support or migrate alternate wallet types later if needed.

## Product Payment Rule

Once a like payment settles, it is final. If a user unlikes later, only the social like is removed; the payment is not reversed.

## Local Environment

Create `functions/.env` locally. Do not commit it.

```env
CIRCLE_API_KEY=TEST:...
CIRCLE_ENTITY_SECRET=your_64_character_hex_entity_secret
CIRCLE_WALLET_SET_ID=...
CIRCLE_BLOCKCHAIN=ARC-TESTNET
CIRCLE_ACCOUNT_TYPE=SCA
CIRCLE_USDC_TOKEN_ADDRESS=
CUERATE_ALLOW_LIVE_TRANSFERS=false
```

## Register Entity Secret

Add your Circle test API key to `functions/.env` first:

```env
CIRCLE_API_KEY=TEST:...
```

Then run this from the `functions` folder:

```powershell
npm run circle:register-entity-secret
```

The script will:

- generate a 32-byte entity secret locally
- register it with Circle
- append `CIRCLE_ENTITY_SECRET` to `functions/.env`
- save the recovery file outside the repo at `%USERPROFILE%\.circle\cuerate\recovery-file.json`

Store the entity secret and recovery file securely. Do not commit either one.

## Create Wallet Set

After the entity secret is registered, run:

```powershell
npm run circle:create-wallet-set
```

The script creates a Circle wallet set named `Cuerate Wallet Set` and writes `CIRCLE_WALLET_SET_ID` to `functions/.env`.

If Circle returns `156016` / `The entity secret has not been set yet`, generate a ciphertext:

```powershell
npm run circle:entity-secret-ciphertext
```

Paste the printed ciphertext into Circle Console's developer-controlled wallet entity secret setup. Do not paste or share the raw `CIRCLE_ENTITY_SECRET`.

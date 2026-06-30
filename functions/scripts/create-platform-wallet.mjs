import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { upsertEnvValue } from "./env-file.mjs";

/**
 * Creates a Circle dev-controlled wallet to serve as Cuerate's TREASURY + REGISTRAR for the
 * on-chain royalty system:
 *   - Treasury  : receives the platform cut from every settle() (the contract's `platform` arg).
 *   - Registrar : calls registerPost() to record forks on-chain (the contract's `owner`).
 *
 * One wallet can play both roles. After running this:
 *   - Use the printed WALLET ADDRESS as the `platform` constructor arg at deploy, and as the
 *     `setOwner(address)` target so this wallet can register forks.
 *   - REGISTRAR_WALLET_ID is written to functions/.env automatically.
 */

const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
const walletSetId = process.env.CIRCLE_WALLET_SET_ID?.trim();
const blockchain = process.env.CIRCLE_BLOCKCHAIN?.trim() || "ARC-TESTNET";
const accountType = process.env.CIRCLE_ACCOUNT_TYPE?.trim() || "SCA";

if (!apiKey) throw new Error("Add CIRCLE_API_KEY to functions/.env first.");
if (!entitySecret) throw new Error("Run npm run circle:register-entity-secret first.");
if (!walletSetId || walletSetId === "wallet_set_id") {
  throw new Error("Run npm run circle:create-wallet-set first (CIRCLE_WALLET_SET_ID missing).");
}

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const response = await circle.createWallets({
  idempotencyKey: crypto.randomUUID(),
  accountType,
  blockchains: [blockchain],
  count: 1,
  walletSetId,
  metadata: [{ name: "cuerate_treasury_registrar", refId: "platform" }],
});

const wallet = response.data?.wallets?.[0];
if (!wallet?.id || !wallet?.address) {
  throw new Error("Circle did not return a wallet.");
}

upsertEnvValue("REGISTRAR_WALLET_ID", wallet.id);
upsertEnvValue("REGISTRAR_WALLET_ADDRESS", wallet.address);

console.log("Treasury + registrar wallet created on", blockchain);
console.log(`  REGISTRAR_WALLET_ID=${wallet.id}        (written to functions/.env)`);
console.log(`  REGISTRAR_WALLET_ADDRESS=${wallet.address}   (written to functions/.env)`);
console.log("");
console.log("Next:");
console.log(`  1) Fund this address with Arc testnet USDC: https://faucet.circle.com`);
console.log(`     -> paste ${wallet.address}`);
console.log(`  2) Run: npm run deploy:contract   (Circle deploys CuerateRoyalty from this wallet)`);

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { upsertEnvValue } from "./env-file.mjs";

/**
 * Creates a Circle wallet that acts as the external "agent" (buyer) for the Inspiration API demo.
 * Writes INSPIRE_AGENT_WALLET_ID / _ADDRESS and a default INSPIRE_AGENT_KEY=demokey to functions/.env,
 * so /inspire can charge this wallet directly with no Firestore user setup.
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
  metadata: [{ name: "cuerate_demo_agent", refId: "agent" }],
});

const wallet = response.data?.wallets?.[0];
if (!wallet?.id || !wallet?.address) {
  throw new Error("Circle did not return a wallet.");
}

upsertEnvValue("INSPIRE_AGENT_WALLET_ID", wallet.id);
upsertEnvValue("INSPIRE_AGENT_WALLET_ADDRESS", wallet.address);
if (!process.env.INSPIRE_AGENT_KEY?.trim()) {
  upsertEnvValue("INSPIRE_AGENT_KEY", "demokey");
}

console.log("Demo agent wallet created on", blockchain);
console.log(`  INSPIRE_AGENT_WALLET_ID=${wallet.id}        (written to functions/.env)`);
console.log(`  INSPIRE_AGENT_WALLET_ADDRESS=${wallet.address}   (written to functions/.env)`);
console.log(`  INSPIRE_AGENT_KEY=demokey   (written to functions/.env)`);
console.log("");
console.log("Fund this agent address with Arc testnet USDC (needs the fee + gas):");
console.log(`  https://faucet.circle.com  ->  ${wallet.address}`);

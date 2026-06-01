import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { upsertEnvValue } from "./env-file.mjs";

const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
const existingWalletSetId = process.env.CIRCLE_WALLET_SET_ID?.trim();

if (!apiKey) {
  throw new Error("Add CIRCLE_API_KEY to functions/.env before running this script.");
}

if (!entitySecret) {
  throw new Error("Run npm run circle:register-entity-secret before creating a wallet set.");
}

if (existingWalletSetId && existingWalletSetId !== "wallet_set_id") {
  throw new Error("functions/.env already has CIRCLE_WALLET_SET_ID. Refusing to overwrite it.");
}

const circle = initiateDeveloperControlledWalletsClient({
  apiKey,
  entitySecret,
});

const response = await circle.createWalletSet({
  idempotencyKey: crypto.randomUUID(),
  name: "Cuerate Wallet Set",
});

const walletSetId = response.data?.walletSet?.id;

if (!walletSetId) {
  throw new Error("Circle did not return a wallet set id.");
}

upsertEnvValue("CIRCLE_WALLET_SET_ID", walletSetId);

console.log("Circle wallet set created.");
console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
console.log("Wallet set id was written to functions/.env");

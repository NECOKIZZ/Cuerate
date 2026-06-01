import { generateEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();

if (!apiKey) {
  throw new Error("Add CIRCLE_API_KEY to functions/.env before running this script.");
}

if (!entitySecret) {
  throw new Error("Add CIRCLE_ENTITY_SECRET to functions/.env before running this script.");
}

const entitySecretCiphertext = await generateEntitySecretCiphertext({
  apiKey,
  entitySecret,
});

console.log(entitySecretCiphertext);

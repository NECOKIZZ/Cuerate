import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateEntitySecret,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";
import { envPath, readEnvFile, upsertEnvValue } from "./env-file.mjs";

const apiKey = process.env.CIRCLE_API_KEY?.trim();
const recoveryDirectory = path.join(os.homedir(), ".circle", "cuerate");
const recoveryFileDownloadPath = path.join(recoveryDirectory, "recovery-file.json");

if (!apiKey) {
  throw new Error("Add CIRCLE_API_KEY to functions/.env before running this script.");
}

const existingEnv = readEnvFile();

const existingEntitySecretMatch = existingEnv.match(/^CIRCLE_ENTITY_SECRET=(.*)$/m);
const existingEntitySecret = existingEntitySecretMatch?.[1]?.trim();

if (existingEntitySecret) {
  throw new Error("functions/.env already has CIRCLE_ENTITY_SECRET. Refusing to overwrite it.");
}

fs.mkdirSync(recoveryDirectory, { recursive: true });

const entitySecret = generateEntitySecret();

await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath,
});

upsertEnvValue("CIRCLE_ENTITY_SECRET", entitySecret);

console.log("Circle entity secret registered.");
console.log(`CIRCLE_ENTITY_SECRET was added to ${envPath}`);
console.log(`Recovery file saved outside the repo at ${recoveryFileDownloadPath}`);
console.log("Store both values securely. Do not commit them.");

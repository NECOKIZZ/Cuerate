import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { upsertEnvValue } from "./env-file.mjs";

/**
 * Deploys CuerateRoyalty to Arc testnet via Circle's Smart Contract Platform, using the
 * treasury/registrar wallet as the deployer. NOTE: Circle SCP deploys via its own managed
 * deployer EOA, so `msg.sender` in the constructor is NOT our wallet — the contract therefore
 * sets `owner = _platform` (this treasury/registrar address) so the registrar can call
 * registerPost. The same wallet is also the `platform` (treasury) that receives cuts.
 *
 * Prereqs: run `npm run circle:create-platform-wallet` and fund the printed address at
 * https://faucet.circle.com, and build the contract (`forge build` in ../contracts).
 */

const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
const walletId = process.env.REGISTRAR_WALLET_ID?.trim();
const treasury = process.env.REGISTRAR_WALLET_ADDRESS?.trim();
const blockchain = process.env.CIRCLE_BLOCKCHAIN?.trim() || "ARC-TESTNET";
const usdc = process.env.ARC_USDC_ADDRESS?.trim() || "0x3600000000000000000000000000000000000000";

if (!apiKey) throw new Error("Add CIRCLE_API_KEY to functions/.env first.");
if (!entitySecret) throw new Error("Run npm run circle:register-entity-secret first.");
if (!walletId || !treasury) {
  throw new Error("Run `npm run circle:create-platform-wallet` first (REGISTRAR_WALLET_ID / _ADDRESS missing).");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(scriptDir, "../../contracts/out/CuerateRoyalty.sol/CuerateRoyalty.json");
if (!fs.existsSync(artifactPath)) {
  throw new Error(`Contract artifact not found at ${artifactPath}. Run \`forge build\` in the contracts folder first.`);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const abi = artifact.abi;
const bytecode = artifact.bytecode?.object;
if (!abi || !bytecode) {
  throw new Error("Artifact is missing abi/bytecode. Re-run `forge build`.");
}

const scp = initiateSmartContractPlatformClient({ apiKey, entitySecret });

console.log(`Deploying CuerateRoyalty to ${blockchain}`);
console.log(`  deployer/treasury wallet: ${treasury}`);
console.log(`  USDC: ${usdc}`);

let deployRes;
try {
  deployRes = await scp.deployContract({
    idempotencyKey: crypto.randomUUID(),
    name: "CuerateRoyalty",
    description: "CuerateRoyaltyRegistry",
    blockchain,
    walletId,
    abiJson: JSON.stringify(abi),
    bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`,
    constructorParameters: [usdc, treasury], // constructor(address _usdc, address _platform)
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
} catch (err) {
  // Circle's generic "API parameter invalid" hides the real detail in the response body.
  const detail = err?.error?.response?.data ?? err?.response?.data ?? null;
  console.error("\n--- Circle deploy error detail ---");
  console.error("code:", err?.code, "status:", err?.status, "message:", err?.message);
  if (detail) console.error("body:", JSON.stringify(detail, null, 2));
  console.error("bytecode starts with 0x:", bytecode.startsWith("0x"), "| bytecode length:", bytecode.length);
  console.error("abi entries:", Array.isArray(abi) ? abi.length : "(not array)");
  console.error("constructorParameters:", JSON.stringify([usdc, treasury]));
  process.exit(1);
}

const contractId = deployRes.data?.contractId;
if (!contractId) {
  throw new Error(`Deploy did not return a contractId: ${JSON.stringify(deployRes.data)}`);
}
console.log(`  contractId: ${contractId}  (deploying — polling for completion…)`);

let address = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const res = await scp.getContract({ id: contractId });
  const c = res.data?.contract;
  const status = c?.deploymentStatus;
  process.stdout.write(`  status: ${status}\r`);
  if (status === "COMPLETE") {
    address = c?.contractAddress ?? c?.address ?? null;
    break;
  }
  if (status === "FAILED") {
    throw new Error(`Deployment FAILED: ${c?.deploymentErrorReason ?? ""} ${c?.deploymentErrorDetails ?? ""}`);
  }
}

if (!address) {
  throw new Error("Timed out waiting for deployment. Check the Circle console / re-run getContract later.");
}

upsertEnvValue("ROYALTY_CONTRACT_ADDRESS", address);

console.log(`\n\n✅ Deployed CuerateRoyalty at ${address}`);
console.log(`   ROYALTY_CONTRACT_ADDRESS written to functions/.env`);
console.log(`   owner + treasury = ${treasury}`);
console.log(`\nNext: set INSPIRE_ONCHAIN=true and INSPIRE_AGENT_KEYS in functions/.env, then \`npm run deploy\`.`);

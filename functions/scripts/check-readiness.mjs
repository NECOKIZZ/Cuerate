import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

/**
 * Read-only pre-flight for an on-chain end-to-end test:
 *  - registrar/treasury wallet USDC (needs gas to register posts; USDC is gas on Arc)
 *  - agent wallet USDC (needs the $0.05 fee + gas for approve + settle)
 *  - confirms the royalty contract's on-chain owner == registrar wallet
 */
const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
const registrarId = process.env.REGISTRAR_WALLET_ID?.trim();
const registrarAddr = process.env.REGISTRAR_WALLET_ADDRESS?.trim();
const agentId = process.env.INSPIRE_AGENT_WALLET_ID?.trim();
const royalty = process.env.ROYALTY_CONTRACT_ADDRESS?.trim();
const rpc = process.env.ARC_TESTNET_RPC_URL?.trim() || "https://rpc.testnet.arc.network";

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

async function usdc(walletId, label) {
  const res = await circle.getWalletTokenBalance({ id: walletId });
  const bal = res.data?.tokenBalances ?? [];
  const u = bal.find((b) => (b.token?.symbol ?? "").toUpperCase().includes("USDC"));
  console.log(`${label}:`);
  if (!bal.length) console.log("  (no token balances)");
  for (const b of bal) console.log(`  ${b.token?.symbol ?? "?"} = ${b.amount}`);
  return u ? Number(u.amount) : 0;
}

const reg = await usdc(registrarId, `Registrar/treasury  ${registrarAddr}`);
const agent = await usdc(agentId, `Agent wallet`);

// Read contract owner() via JSON-RPC eth_call (selector 0x8da5cb5b).
let owner = "(rpc failed)";
try {
  const body = {
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: royalty, data: "0x8da5cb5b" }, "latest"],
  };
  const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.result && j.result.length >= 42) owner = "0x" + j.result.slice(-40);
  else owner = JSON.stringify(j.error ?? j);
} catch (e) { owner = String(e); }

console.log(`\nContract ${royalty}`);
console.log(`  owner()   = ${owner}`);
console.log(`  registrar = ${registrarAddr?.toLowerCase()}`);
const ownerOk = owner.toLowerCase() === registrarAddr?.toLowerCase();
console.log(`  owner == registrar? ${ownerOk ? "YES ✓ (can register posts)" : "NO ✗ (registration will revert!)"}`);

console.log("\n--- Verdict ---");
console.log(`Registrar can pay gas: ${reg > 0 ? "YES ✓" : "NO ✗ — fund it at https://faucet.circle.com"}`);
console.log(`Agent can pay fee+gas: ${agent >= 0.1 ? "YES ✓" : "LOW ✗ — needs > ~0.1 USDC"} (has ${agent})`);
console.log(`Contract ownership:    ${ownerOk ? "YES ✓" : "NO ✗"}`);

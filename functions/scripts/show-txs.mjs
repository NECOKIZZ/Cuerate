import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

/**
 * Read-only: list the agent wallet's recent on-chain transactions with their
 * blockchain tx hash + failure reason, so we can open them on the Arc explorer.
 */
const apiKey = process.env.CIRCLE_API_KEY?.trim();
const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.trim();
const walletId = process.env.INSPIRE_AGENT_WALLET_ID?.trim();

if (!apiKey || !entitySecret) throw new Error("Missing CIRCLE creds in functions/.env");
if (!walletId) throw new Error("Missing INSPIRE_AGENT_WALLET_ID in functions/.env");

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const res = await circle.listTransactions({ walletIds: [walletId], pageSize: 20 });
const txs = res.data?.transactions ?? [];

console.log(`Found ${txs.length} transaction(s) for agent wallet ${walletId}:\n`);
for (const t of txs) {
  console.log(`• id=${t.id}`);
  console.log(`  state=${t.state}  type=${t.transactionType ?? t.operation ?? "?"}`);
  console.log(`  createDate: ${t.createDate ?? "?"}`);
  console.log(`  amount: ${(t.amounts ?? []).join(", ") || "(contract call)"}`);
  console.log(`  to:     ${t.destinationAddress ?? t.contractAddress ?? "?"}`);
  console.log(`  txHash: ${t.txHash ?? "(never made it on-chain)"}`);
  if (t.errorReason) console.log(`  errorReason: ${t.errorReason}`);
  if (t.errorDetails) console.log(`  errorDetails: ${t.errorDetails}`);
  if (t.txHash) console.log(`  explorer: https://testnet.arcscan.app/tx/${t.txHash}`);
  console.log("");
}

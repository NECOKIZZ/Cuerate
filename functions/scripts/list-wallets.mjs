import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const circle = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY?.trim(),
  entitySecret: process.env.CIRCLE_ENTITY_SECRET?.trim(),
});

const target = "0xa3039a54856ed74b5aec999eef3fc954ab010cf6".toLowerCase();
const res = await circle.listWallets({ pageSize: 50 });
const wallets = res.data?.wallets ?? [];
console.log(`Circle wallets in this account (${wallets.length}):\n`);
for (const w of wallets) {
  const hit = (w.address ?? "").toLowerCase() === target ? "  <-- contract owner()" : "";
  console.log(`• ${w.address}  id=${w.id}  refId=${w.refId ?? ""} ${(w.metadata?.name) ?? ""}${hit}`);
}
const owner = wallets.find((w) => (w.address ?? "").toLowerCase() === target);
console.log(`\nContract owner is a Circle wallet we control: ${owner ? "YES ✓ (id=" + owner.id + ")" : "NO ✗ (likely the Foundry deployer keystore)"}`);

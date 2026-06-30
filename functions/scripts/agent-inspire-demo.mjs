/**
 * Cuerate Inspiration API — machine-to-machine demo client.
 *
 * Simulates a *separate* AI tool that pays Cuerate per query to discover a prompt.
 * Step 1: call /inspire with no payment    -> receives an HTTP 402 challenge.
 * Step 2: call /inspire with the agent key -> pays from its Circle wallet, gets the prompt,
 *         and the matched creator + their fork lineage get paid automatically.
 *
 * Usage:
 *   INSPIRE_URL=https://<region>-<project>.cloudfunctions.net/inspire \
 *   INSPIRE_AGENT_KEY=<your-agent-key> \
 *   node scripts/agent-inspire-demo.mjs "cinematic neon city at night"
 *
 * For the local emulator, INSPIRE_URL looks like:
 *   http://127.0.0.1:5001/<project>/<region>/inspire
 */

const url = process.env.INSPIRE_URL?.trim();
const agentKey = process.env.INSPIRE_AGENT_KEY?.trim();
const query = process.argv.slice(2).join(' ').trim() || 'cinematic neon city at night';

if (!url) {
  throw new Error('Set INSPIRE_URL to your deployed/emulated /inspire endpoint.');
}
if (!agentKey) {
  throw new Error('Set INSPIRE_AGENT_KEY (must map to a funded Cuerate wallet via INSPIRE_AGENT_KEYS).');
}

function divider(title) {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

async function post(headers) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status: response.status, body };
}

divider(`🤖  Agent query: "${query}"`);

// Step 1 — no payment: expect a 402 challenge.
divider('Step 1 — call without payment (expect HTTP 402)');
const challenge = await post({});
console.log('HTTP', challenge.status);
console.log(JSON.stringify(challenge.body, null, 2));

if (challenge.status !== 402) {
  console.warn('\n⚠️  Expected a 402 challenge first. Continuing anyway…');
}

// Step 2 — pay via the agent's Circle wallet (x-agent-key authorizes the pull).
divider('Step 2 — pay via agent wallet (expect HTTP 200)');
const paid = await post({ 'x-agent-key': agentKey });
console.log('HTTP', paid.status);
console.log(JSON.stringify(paid.body, null, 2));

if (paid.status === 200 && paid.body?.payment) {
  divider('💸  Lineage payout');
  console.log(`Matched creator: @${paid.body.source?.creatorHandle ?? '?'}`);
  console.log(`Paid ${paid.body.payment.amount} ${paid.body.payment.currency} on ${paid.body.payment.network}`);
  for (const p of paid.body.payment.lineagePayout ?? []) {
    const label = p.recipient === 'platform' ? 'platform (fee + folded)' : `gen ${p.generation} (${p.recipient})`;
    console.log(`  • ${label}: ${p.amount} USDC  [${p.status}]${p.txId ? `  tx=${p.txId}` : ''}`);
  }
  console.log(`\nSettlement batch: ${paid.body.payment.batchId}`);
  console.log(`Circle tx ids: ${(paid.body.payment.txIds ?? []).join(', ') || '(none)'}`);
} else {
  console.error('\n❌  Paid request did not return a successful payout.');
  process.exitCode = 1;
}

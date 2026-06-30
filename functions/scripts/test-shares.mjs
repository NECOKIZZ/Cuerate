/**
 * Unit check for the decaying fork-royalty split (off-chain engine, mirrors the Solidity contract).
 * Verifies integer-micros payouts sum exactly to the gross at every depth (no float drift).
 * Run with: npm run test:shares  (builds first, then imports the compiled engine).
 */
import { computePayout, DUST_MICROS, ORIGINAL_FEE_BPS, MAX_DEPTH } from '../lib/settlement.js';

const GROSS = 1_000_000; // 1 USDC in micros
let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name} — ${detail}`);
    failures += 1;
  }
}

console.log(`DUST_MICROS=${DUST_MICROS}  ORIGINAL_FEE_BPS=${ORIGINAL_FEE_BPS}  MAX_DEPTH=${MAX_DEPTH}\n`);

for (const len of [1, 2, 3, 5, 7, 10]) {
  const { shares, platformMicros } = computePayout(len, GROSS);
  const sum = shares.reduce((a, b) => a + b, 0) + platformMicros;
  console.log(`lineage ${len}: shares=[${shares.join(', ')}]  platform=${platformMicros}`);
  check(`len ${len} conserves gross`, sum === GROSS, `got ${sum}`);
  check(`len ${len} no negative`, shares.every((s) => s >= 0) && platformMicros >= 0, JSON.stringify({ shares, platformMicros }));
}

// Original post: creator keeps 95%, platform takes the 5% fee.
const orig = computePayout(1, GROSS);
check('original creator 95%', orig.shares[0] === 950_000, JSON.stringify(orig));
check('original platform 5%', orig.platformMicros === 50_000, JSON.stringify(orig));

// Fork shapes: 50/25/12.5, platform absorbs the remainder.
const d2 = computePayout(2, GROSS);
check('fork d2 leaf 50%', d2.shares[0] === 500_000, JSON.stringify(d2));
check('fork d2 original 25%', d2.shares[1] === 250_000, JSON.stringify(d2));
check('fork d2 platform 25%', d2.platformMicros === 250_000, JSON.stringify(d2));

const d3 = computePayout(3, GROSS);
check('fork d3 [50,25,12.5]', d3.shares.join(',') === '500000,250000,125000', JSON.stringify(d3));
check('fork d3 platform 12.5%', d3.platformMicros === 125_000, JSON.stringify(d3));

// Deep chain pays beyond 5 now (no cap); dust floor is the only terminator.
const d7 = computePayout(7, GROSS);
check('fork d7 pays gen6', d7.shares[5] === 15_625, JSON.stringify(d7));
check('fork d7 pays gen7', d7.shares[6] === 7_812, JSON.stringify(d7));

console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}`);
process.exitCode = failures === 0 ? 0 : 1;

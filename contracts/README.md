# CuerateRoyalty — on-chain fork registry + decaying royalty splitter (Arc)

`CuerateRoyalty.sol` records each post's fork lineage on-chain (parent pointers) and, when an agent
pays to discover a post, splits the payment geometrically across that lineage **in Solidity** —
50% / 25% / 12.5% / 6.25% / … capped at 5 generations, with the platform taking a fixed 10% off the
top first. The last paid slot (or the root, for shorter chains) absorbs the remainder so the parts
always sum to exactly the net amount. USDC on Arc is a 6-decimal ERC-20, so amounts are plain base
units (1 USDC = 1,000,000).

## Layout
- `src/CuerateRoyalty.sol` — the contract (`registerPost`, `registerPosts`, `settle`, `lineageOf`).
- `test/CuerateRoyalty.t.sol` — self-contained Foundry tests (mock USDC; no external deps).

## Test
```bash
forge test -vv
```
Asserts `settle` distributes exactly per the share table for chain depths 1/2/3/5/7, that the parts
sum to the gross, that it caps at 5 recipients, and that `address(0)` creators fold into the platform.

## Deploy to Arc testnet
Arc uses USDC as the native gas token — fund your deployer wallet at https://faucet.circle.com first.

```bash
# Arc testnet: chain id 5042002, RPC https://rpc.testnet.arc.network
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network

# Use an encrypted keystore — do NOT pass a raw private key on the CLI for anything but local tests.
forge create src/CuerateRoyalty.sol:CuerateRoyalty \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --account deployer \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 <PLATFORM_WALLET_ADDRESS>
```

Constructor args: `(arcUsdcAddress, platformWalletAddress)`.

## Hand the registrar role to the Circle wallet
The Firestore trigger registers forks via a **Circle dev-controlled registrar wallet**. Transfer
ownership to that wallet's on-chain address so it can call `registerPost`:

```bash
cast send <ROYALTY_CONTRACT_ADDRESS> "setOwner(address)" <REGISTRAR_WALLET_ADDRESS> \
  --rpc-url "$ARC_TESTNET_RPC_URL" --account deployer
```

## Wire the backend
In `functions/.env` (or Secret Manager):
```
INSPIRE_ONCHAIN=true
ROYALTY_CONTRACT_ADDRESS=<deployed address>
ARC_USDC_ADDRESS=0x3600000000000000000000000000000000000000
REGISTRAR_WALLET_ID=<Circle wallet id of the registrar>
```

Then redeploy functions. New posts auto-register on creation; to backfill an existing demo chain,
call `registerPosts(bytes32[],address[],bytes32[])` from the registrar (post id = `keccak256(utf8(promptId))`).

## Post id convention
On-chain `postId = keccak256(utf8(firestorePromptId))` — computed identically by the backend
(`functions/src/onchain.ts: postIdToBytes32`) on both registration and settlement.

## Security notes
- Never commit private keys or keystores. `.env*` and keystore files must be git-ignored.
- The contract is unaudited hackathon code — testnet only. Arc is testnet-only regardless.

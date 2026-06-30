export type CircleRuntimeConfig = {
  apiKey: string;
  entitySecret: string;
  walletSetId: string;
  blockchain: string;
  accountType: 'SCA' | 'EOA';
  usdcTokenAddress?: string;
  allowLiveTransfers: boolean;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

export function getCircleConfig(): CircleRuntimeConfig {
  return {
    apiKey: requiredEnv('CIRCLE_API_KEY'),
    entitySecret: requiredEnv('CIRCLE_ENTITY_SECRET'),
    walletSetId: requiredEnv('CIRCLE_WALLET_SET_ID'),
    blockchain: process.env.CIRCLE_BLOCKCHAIN?.trim() || 'ARC-TESTNET',
    accountType: (process.env.CIRCLE_ACCOUNT_TYPE?.trim() as 'SCA' | 'EOA') || 'SCA',
    usdcTokenAddress: process.env.CIRCLE_USDC_TOKEN_ADDRESS?.trim() || undefined,
    allowLiveTransfers: process.env.CUERATE_ALLOW_LIVE_TRANSFERS === 'true',
  };
}

/** Price (in USDC, decimal string) charged per Inspiration API query. */
export function getInspirePriceUsdc(): string {
  const raw = process.env.INSPIRE_PRICE_USDC?.trim();
  if (raw && /^\d+(\.\d{1,6})?$/.test(raw)) {
    return raw;
  }
  return '0.05';
}

/** Default Arc testnet ERC-20 USDC (6 decimals). */
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000';

export type OnchainConfig = {
  enabled: boolean;
  royaltyAddress: string;
  usdcAddress: string;
  registrarWalletId: string;
};

/** On-chain royalty settlement config (Stage 2). `enabled` gates the whole on-chain path. */
export function getOnchainConfig(): OnchainConfig {
  return {
    enabled: process.env.INSPIRE_ONCHAIN === 'true',
    royaltyAddress: process.env.ROYALTY_CONTRACT_ADDRESS?.trim() || '',
    usdcAddress: process.env.ARC_USDC_ADDRESS?.trim() || ARC_USDC_ADDRESS,
    registrarWalletId: process.env.REGISTRAR_WALLET_ID?.trim() || '',
  };
}

export function assertTestnetTransfersOnly(config: CircleRuntimeConfig) {
  if (config.allowLiveTransfers) {
    return;
  }

  const chain = config.blockchain.toUpperCase();
  const isTestnet = chain.includes('TEST') || chain.includes('AMOY') || chain.includes('SEPOLIA') || chain.includes('DEVNET');
  if (!isTestnet) {
    throw new Error('Live transfers are disabled. Set CUERATE_ALLOW_LIVE_TRANSFERS=true only after mainnet review.');
  }
}

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { getCircleConfig } from './config.js';

let client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function getCircleClient() {
  if (client) {
    return client;
  }

  const config = getCircleConfig();
  client = initiateDeveloperControlledWalletsClient({
    apiKey: config.apiKey,
    entitySecret: config.entitySecret,
  });
  return client;
}

export type CircleWalletRecord = {
  walletId: string;
  walletAddress: string;
  blockchain: string;
  accountType: 'SCA' | 'EOA';
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
};

import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { connectStorageEmulator } from 'firebase/storage';

type FirebaseEnv = Record<string, string | undefined>;

const env = import.meta.env as FirebaseEnv;

function readEnv(key: string, legacyKey: string) {
  return env[key] ?? env[legacyKey];
}

function readBooleanEnv(key: string) {
  return env[key]?.toLowerCase() === 'true';
}

export const firebaseConfig: FirebaseOptions = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'),
};

const firebaseCoreConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

const firebaseStorageConfigured =
  typeof firebaseConfig.storageBucket === 'string' &&
  firebaseConfig.storageBucket.trim().length > 0;

export const firebaseEnabled = firebaseCoreConfig.every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

export const app: FirebaseApp | null = firebaseEnabled
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export const storage: FirebaseStorage | null =
  app && firebaseStorageConfigured ? getStorage(app) : null;

const useEmulators =
  Boolean(app) &&
  readBooleanEnv('VITE_USE_FIREBASE_EMULATORS');

if (useEmulators && auth && db && storage) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export default app;

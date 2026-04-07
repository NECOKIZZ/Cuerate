import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  User as FirebaseAuthUser,
} from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, firebaseEnabled, storage } from './firebase';
import {
  AuthLog,
  AuthLogEvent,
  availableModels,
  availableMoodLabels,
  availableStyleTags,
  Collection,
  CreateCollectionInput,
  difficultyLevels,
  ForkPromptInput,
  Notification,
  Prompt,
  PromptCreateInput,
  User,
} from './types';
import { mockCollections, mockNotifications, mockPrompts, mockUsers } from './mockData';

const LOCAL_AUTH_USER_KEY = 'cuerate.auth.user';
const LOCAL_AUTH_SESSION_KEY = 'cuerate.auth.sessionUid';
const LOCAL_EMAIL_LINK_KEY = 'cuerate.auth.emailLink';
const authListeners = new Set<(user: User | null) => void>();

const COLLECTIONS = {
  users: 'users',
  authLogs: 'authLogs',
  emailLookup: 'emailLookup',
  prompts: 'prompts',
  promptLikes: 'promptLikes',
  notifications: 'notifications',
  collections: 'collections',
} as const;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function cloneDate<T extends { createdAt: Date }>(item: T): T {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
  };
}

function clonePrompt(prompt: Prompt): Prompt {
  return cloneDate(prompt);
}

function cloneUser(user: User): User {
  return cloneDate(user);
}

function cloneAuthLog(authLog: AuthLog): AuthLog {
  return cloneDate(authLog);
}

function cloneNotification(notification: Notification): Notification {
  return cloneDate(notification);
}

function cloneCollection(collectionItem: Collection): Collection {
  return cloneDate(collectionItem);
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }

  return new Date();
}

function deserializeUser(id: string, data: Record<string, unknown>): User {
  return {
    uid: id,
    handle: String(data.handle ?? ''),
    displayName: String(data.displayName ?? ''),
    avatarUrl: String(data.avatarUrl ?? ''),
    email: data.email ? String(data.email) : undefined,
    emailVerified: typeof data.emailVerified === 'boolean' ? data.emailVerified : undefined,
    authProvider: (data.authProvider as User['authProvider']) ?? undefined,
    bio: String(data.bio ?? ''),
    links: (data.links as User['links']) ?? {},
    primaryModels: Array.isArray(data.primaryModels) ? data.primaryModels.map(String) : [],
    followers: Number(data.followers ?? 0),
    following: Number(data.following ?? 0),
    totalCopies: Number(data.totalCopies ?? 0),
    totalPrompts: Number(data.totalPrompts ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: data.updatedAt ? toDate(data.updatedAt) : undefined,
    lastLoginAt: data.lastLoginAt ? toDate(data.lastLoginAt) : undefined,
  };
}

function deserializeAuthLog(id: string, data: Record<string, unknown>): AuthLog {
  return {
    id,
    userId: String(data.userId ?? ''),
    event: (data.event as AuthLogEvent) ?? 'sign_in',
    provider: (data.provider as AuthLog['provider']) ?? 'mock',
    email: data.email ? String(data.email) : undefined,
    createdAt: toDate(data.createdAt),
  };
}

function deserializePrompt(id: string, data: Record<string, unknown>): Prompt {
  return {
    id,
    authorUid: String(data.authorUid ?? ''),
    authorHandle: String(data.authorHandle ?? ''),
    authorAvatar: String(data.authorAvatar ?? ''),
    videoUrl: String(data.videoUrl ?? ''),
    thumbnailUrl: String(data.thumbnailUrl ?? ''),
    mediaWidth: typeof data.mediaWidth === 'number' ? data.mediaWidth : undefined,
    mediaHeight: typeof data.mediaHeight === 'number' ? data.mediaHeight : undefined,
    promptText: String(data.promptText ?? ''),
    model: String(data.model ?? ''),
    contentType: data.contentType === 'image' ? 'image' : 'video',
    aspectRatio: data.aspectRatio === 'portrait' ? 'portrait' : 'landscape',
    styleTags: Array.isArray(data.styleTags) ? data.styleTags.map(String) : [],
    cameraNotes: String(data.cameraNotes ?? ''),
    moodLabel: String(data.moodLabel ?? ''),
    difficulty: String(data.difficulty ?? ''),
    likes: Number(data.likes ?? 0),
    saves: Number(data.saves ?? 0),
    copies: Number(data.copies ?? 0),
    forks: Number(data.forks ?? 0),
    isForked: Boolean(data.isForked),
    forkedFromId: data.forkedFromId ? String(data.forkedFromId) : null,
    forkedFromAuthorHandle: data.forkedFromAuthorHandle ? String(data.forkedFromAuthorHandle) : null,
    createdAt: toDate(data.createdAt),
  };
}

function deserializeNotification(id: string, data: Record<string, unknown>): Notification {
  return {
    id,
    userId: String(data.userId ?? ''),
    type: (data.type as Notification['type']) ?? 'like',
    fromUid: String(data.fromUid ?? ''),
    fromHandle: String(data.fromHandle ?? ''),
    fromAvatar: data.fromAvatar ? String(data.fromAvatar) : undefined,
    promptId: data.promptId ? String(data.promptId) : undefined,
    message: String(data.message ?? ''),
    read: Boolean(data.read),
    createdAt: toDate(data.createdAt),
  };
}

function deserializeCollection(id: string, data: Record<string, unknown>): Collection {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    description: data.description ? String(data.description) : undefined,
    count: Number(data.count ?? 0),
    thumbnails: Array.isArray(data.thumbnails) ? data.thumbnails.map(String) : [],
    createdAt: toDate(data.createdAt),
  };
}

function requireDb() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add your Vite Firebase env vars to enable backend reads/writes.');
  }

  return db;
}

function requireStorage() {
  if (!storage) {
    throw new Error('Firebase Storage is not configured. Add your Vite Firebase env vars to enable uploads.');
  }

  return storage;
}

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readLocalAuthUser(): User | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_AUTH_USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Omit<User, 'createdAt'> & { createdAt: string };
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

function writeLocalAuthUser(user: User | null) {
  if (!canUseBrowserStorage()) {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(LOCAL_AUTH_USER_KEY);
    window.localStorage.removeItem(LOCAL_AUTH_SESSION_KEY);
    return;
  }

  window.localStorage.setItem(
    LOCAL_AUTH_USER_KEY,
    JSON.stringify({
      ...user,
      createdAt: user.createdAt.toISOString(),
    }),
  );
  window.localStorage.setItem(LOCAL_AUTH_SESSION_KEY, user.uid);
}

function readPendingEmailLink() {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const raw = window.localStorage.getItem(LOCAL_EMAIL_LINK_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as {
      mode: 'login' | 'signup';
      email: string;
      displayName?: string;
      handle?: string;
    };
  } catch {
    return null;
  }
}

function writePendingEmailLink(value: {
  mode: 'login' | 'signup';
  email: string;
  displayName?: string;
  handle?: string;
} | null) {
  if (!canUseBrowserStorage()) {
    return;
  }

  if (!value) {
    window.localStorage.removeItem(LOCAL_EMAIL_LINK_KEY);
    return;
  }

  window.localStorage.setItem(LOCAL_EMAIL_LINK_KEY, JSON.stringify(value));
}

function emitAuthUser(user: User | null) {
  for (const listener of authListeners) {
    listener(user ? cloneUser(user) : null);
  }
}

function buildMockUserProfile(input: { uid: string; email: string; displayName: string; handle: string }): User {
  return {
    uid: input.uid,
    handle: input.handle,
    displayName: input.displayName,
    avatarUrl: 'https://images.unsplash.com/photo-1649589244330-09ca58e4fa64?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBwb3J0cmFpdCUyMHdvbWFufGVufDF8fHx8MTc3NTM3OTAyOXww&ixlib=rb-4.1.0&q=80&w=200',
    email: input.email,
    emailVerified: false,
    authProvider: 'mock',
    bio: `New to Cuerate from ${input.email}`,
    links: {},
    primaryModels: ['Sora'],
    followers: 0,
    following: 0,
    totalCopies: 0,
    totalPrompts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
  };
}

function sanitizeHandle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

function getFallbackUsers() {
  const localAuthUser = readLocalAuthUser();

  if (!localAuthUser) {
    return mockUsers.map(cloneUser);
  }

  const users = mockUsers.filter(
    (user) => user.uid !== localAuthUser.uid && user.handle !== localAuthUser.handle,
  );

  return [cloneUser(localAuthUser), ...users.map(cloneUser)];
}

function buildUserProfileFromAuthUser(firebaseUser: FirebaseAuthUser, extras?: Partial<User>): User {
  const baseHandle = sanitizeHandle(extras?.handle || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || firebaseUser.uid) || 'creator';

  return {
    uid: firebaseUser.uid,
    handle: baseHandle,
    displayName: extras?.displayName || firebaseUser.displayName || baseHandle,
    avatarUrl:
      extras?.avatarUrl ||
      firebaseUser.photoURL ||
      'https://images.unsplash.com/photo-1649589244330-09ca58e4fa64?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBwb3J0cmFpdCUyMHdvbWFufGVufDF8fHx8MTc3NTM3OTAyOXww&ixlib=rb-4.1.0&q=80&w=200',
    email: firebaseUser.email ?? extras?.email,
    emailVerified: firebaseUser.emailVerified,
    authProvider: firebaseUser.providerData.some((provider) => provider.providerId === 'google.com') ? 'google' : 'password',
    bio: extras?.bio || `New to Cuerate from ${firebaseUser.email ?? 'Firebase Auth'}`,
    links: extras?.links || {},
    primaryModels: extras?.primaryModels || ['Sora'],
    followers: extras?.followers ?? 0,
    following: extras?.following ?? 0,
    totalCopies: extras?.totalCopies ?? 0,
    totalPrompts: extras?.totalPrompts ?? 0,
    createdAt: extras?.createdAt ?? new Date(),
    updatedAt: new Date(),
    lastLoginAt: new Date(),
  };
}

async function getUserByUid(uid: string): Promise<User | null> {
  if (!firebaseEnabled) {
    const localAuthUser = readLocalAuthUser();
    if (localAuthUser?.uid === uid) {
      return cloneUser(localAuthUser);
    }

    const user = mockUsers.find((entry) => entry.uid === uid) ?? null;
    return user ? cloneUser(user) : null;
  }

  const firestore = requireDb();
  const snapshot = await getDoc(doc(firestore, COLLECTIONS.users, uid));

  if (!snapshot.exists()) {
    return null;
  }

  return deserializeUser(snapshot.id, snapshot.data() as Record<string, unknown>);
}

async function upsertUserProfile(profile: User) {
  if (!firebaseEnabled) {
    writeLocalAuthUser(profile);
    return cloneUser(profile);
  }

  const firestore = requireDb();
  await setDoc(doc(firestore, COLLECTIONS.users, profile.uid), profile, { merge: true });
  if (profile.email) {
    await upsertEmailLookup({ email: profile.email, userId: profile.uid });
  }
  return profile;
}

async function upsertEmailLookup(input: { email: string; userId: string }) {
  if (!firebaseEnabled) {
    return;
  }

  const firestore = requireDb();
  await setDoc(
    doc(firestore, COLLECTIONS.emailLookup, normalizeEmail(input.email)),
    {
      userId: input.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true },
  );
}

async function emailExists(email: string) {
  if (!firebaseEnabled) {
    const localUser = readLocalAuthUser();
    return normalizeEmail(localUser?.email ?? '') === normalizeEmail(email);
  }

  const firestore = requireDb();
  const snapshot = await getDoc(doc(firestore, COLLECTIONS.emailLookup, normalizeEmail(email)));
  return snapshot.exists();
}

async function handleExists(handle: string) {
  const normalizedHandle = sanitizeHandle(handle);

  if (!normalizedHandle) {
    return false;
  }

  if (!firebaseEnabled) {
    return getFallbackUsers().some((user) => user.handle === normalizedHandle);
  }

  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, COLLECTIONS.users), where('handle', '==', normalizedHandle), limit(1)),
  );

  return !snapshot.empty;
}

async function ensureUniqueHandle(baseHandle: string, currentUserId?: string) {
  const normalizedBase = sanitizeHandle(baseHandle) || 'creator';
  let candidate = normalizedBase;
  let suffix = 1;

  while (true) {
    if (!firebaseEnabled) {
      const conflict = getFallbackUsers().find((user) => user.handle === candidate && user.uid !== currentUserId);
      if (!conflict) {
        return candidate;
      }
    } else {
      const firestore = requireDb();
      const snapshot = await getDocs(
        query(collection(firestore, COLLECTIONS.users), where('handle', '==', candidate), limit(2)),
      );
      const conflict = snapshot.docs.find((docSnapshot) => docSnapshot.id !== currentUserId);
      if (!conflict) {
        return candidate;
      }
    }

    suffix += 1;
    candidate = `${normalizedBase}${suffix}`;
  }
}

async function logAuthEvent(input: Omit<AuthLog, 'id' | 'createdAt'>) {
  const authLog: AuthLog = {
    id: crypto.randomUUID(),
    createdAt: new Date(),
    ...input,
  };

  if (!firebaseEnabled) {
    return cloneAuthLog(authLog);
  }

  const firestore = requireDb();
  const authLogDocument = { ...authLog } as Omit<AuthLog, 'id'> & { id?: string };
  delete authLogDocument.id;
  const created = await addDoc(collection(firestore, COLLECTIONS.authLogs), authLogDocument);

  return {
    ...authLog,
    id: created.id,
  };
}

export const authApi = {
  async getCurrentUser(): Promise<User | null> {
    if (!firebaseEnabled) {
      const localAuthUser = readLocalAuthUser();
      return localAuthUser ? cloneUser(localAuthUser) : null;
    }

    if (!auth?.currentUser) {
      return null;
    }

      return getUserByUid(auth.currentUser.uid);
    },

    async sendEmailLink(input: { mode: 'login' | 'signup'; email: string; displayName?: string; handle?: string }): Promise<void> {
      const normalizedEmail = normalizeEmail(input.email);
      const normalizedHandle = sanitizeHandle(input.handle || input.displayName || normalizedEmail.split('@')[0]);

      if (input.mode === 'signup') {
        if (await emailExists(normalizedEmail)) {
          throw new Error('Account already exists. Log in instead.');
        }

        if (normalizedHandle && (await handleExists(normalizedHandle))) {
          throw new Error('Username taken. Choose another one.');
        }
      } else if (!(await emailExists(normalizedEmail))) {
        throw new Error('Account does not exist. Sign up first.');
      }

      writePendingEmailLink({
        mode: input.mode,
        email: normalizedEmail,
        displayName: input.displayName,
        handle: normalizedHandle,
      });

      if (!firebaseEnabled || !auth) {
        return;
      }

      const actionCodeSettings = {
        url: `${window.location.origin}/auth`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, normalizedEmail, actionCodeSettings);
      await logAuthEvent({
        userId: normalizedEmail,
        event: 'email_link_sent',
        provider: 'password',
        email: normalizedEmail,
      });
    },

    async completeEmailLinkSignIn(currentUrl: string): Promise<User | null> {
      const pending = readPendingEmailLink();

      if (!pending) {
        return null;
      }

      if (!firebaseEnabled || !auth) {
        const user = buildMockUserProfile({
          uid: crypto.randomUUID(),
          email: pending.email,
          displayName: pending.displayName || pending.email.split('@')[0],
          handle: sanitizeHandle(pending.handle || pending.displayName || pending.email.split('@')[0]) || 'creator',
        });
        user.authProvider = 'password';
        user.emailVerified = true;
        writeLocalAuthUser(user);
        writePendingEmailLink(null);
        emitAuthUser(user);
        return cloneUser(user);
      }

      if (!isSignInWithEmailLink(auth, currentUrl)) {
        return null;
      }

      const credential = await signInWithEmailLink(auth, pending.email, currentUrl);
      const existingUser = await getUserByUid(credential.user.uid);
      const desiredHandle = existingUser?.handle || pending.handle || pending.displayName || pending.email.split('@')[0];
      const uniqueHandle = await ensureUniqueHandle(desiredHandle, credential.user.uid);
      const user = await upsertUserProfile(
        buildUserProfileFromAuthUser(credential.user, {
          ...existingUser,
          displayName: existingUser?.displayName || pending.displayName || credential.user.displayName || undefined,
          handle: uniqueHandle,
        }),
      );

      if (pending.mode === 'signup') {
        await logAuthEvent({
          userId: user.uid,
          event: 'sign_up',
          provider: 'password',
          email: user.email,
        });
      }

      await logAuthEvent({
        userId: user.uid,
        event: 'email_link_sign_in',
        provider: 'password',
        email: user.email,
      });

      writePendingEmailLink(null);
      emitAuthUser(user);
      return user;
    },

    async signInWithGoogle(): Promise<User | null> {
      if (!firebaseEnabled || !auth) {
        const user = buildMockUserProfile({
          uid: crypto.randomUUID(),
          email: 'google-user@mock.cuerate',
          displayName: 'Google Creator',
          handle: 'googlecreator',
        });
        user.authProvider = 'google';
        user.emailVerified = true;
        writeLocalAuthUser(user);
        await logAuthEvent({
          userId: user.uid,
          event: 'google_sign_in',
          provider: 'google',
          email: user.email,
        });
        emitAuthUser(user);
        return cloneUser(user);
      }

      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      const existingUser = await getUserByUid(credential.user.uid);
      const uniqueHandle = await ensureUniqueHandle(
        existingUser?.handle || credential.user.displayName || credential.user.email?.split('@')[0] || credential.user.uid,
        credential.user.uid,
      );
      const user = await upsertUserProfile(
        buildUserProfileFromAuthUser(credential.user, {
          ...existingUser,
          handle: uniqueHandle,
        }),
      );
      await logAuthEvent({
        userId: user.uid,
        event: 'google_sign_in',
        provider: 'google',
        email: user.email,
      });
      emitAuthUser(user);
      return user;
    },

    async signOut(): Promise<void> {
      if (!firebaseEnabled || !auth) {
        const localAuthUser = readLocalAuthUser();
        if (localAuthUser) {
          await logAuthEvent({
            userId: localAuthUser.uid,
            event: 'sign_out',
            provider: localAuthUser.authProvider ?? 'mock',
            email: localAuthUser.email,
          });
        }
        writeLocalAuthUser(null);
        emitAuthUser(null);
        return;
      }

      if (auth.currentUser) {
        await logAuthEvent({
          userId: auth.currentUser.uid,
          event: 'sign_out',
          provider: auth.currentUser.providerData.some((provider) => provider.providerId === 'google.com') ? 'google' : 'password',
          email: auth.currentUser.email ?? undefined,
        });
      }
      await signOut(auth);
      emitAuthUser(null);
    },

  subscribe(listener: (user: User | null) => void) {
    authListeners.add(listener);

    if (!firebaseEnabled || !auth) {
      listener(readLocalAuthUser());

      const handleStorage = () => {
        listener(readLocalAuthUser());
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('storage', handleStorage);
      }

      return () => {
        authListeners.delete(listener);
        if (typeof window !== 'undefined') {
          window.removeEventListener('storage', handleStorage);
        }
      };
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        listener(null);
        return;
      }

      listener(await getUserByUid(firebaseUser.uid));
    });

    return () => {
      authListeners.delete(listener);
      unsubscribe();
    };
  },
};

export const backendStatus = {
  firebaseEnabled,
};

export const metaApi = {
  getAvailableModels: async () => [...availableModels],
  getAvailableStyleTags: async () => [...availableStyleTags],
  getAvailableMoodLabels: async () => [...availableMoodLabels],
  getDifficultyLevels: async () => [...difficultyLevels],
};

export const usersApi = {
  async getAllUsers(): Promise<User[]> {
    if (!firebaseEnabled) {
      return getFallbackUsers();
    }

    const firestore = requireDb();
    const snapshot = await getDocs(query(collection(firestore, COLLECTIONS.users), orderBy('followers', 'desc')));
    return snapshot.docs.map((entry) => deserializeUser(entry.id, entry.data() as Record<string, unknown>));
  },

  async getUserByHandle(handle: string): Promise<User | null> {
    if (!firebaseEnabled) {
      const user = getFallbackUsers().find((entry) => entry.handle === handle) ?? null;
      return user ? cloneUser(user) : null;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.users), where('handle', '==', handle), limit(1)),
    );

    if (snapshot.empty) {
      return null;
    }

    const userDoc = snapshot.docs[0];
    return deserializeUser(userDoc.id, userDoc.data() as Record<string, unknown>);
  },
};

export const promptsApi = {
  async getFeedPrompts(): Promise<Prompt[]> {
    if (!firebaseEnabled) {
      return mockPrompts.map(clonePrompt);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(query(collection(firestore, COLLECTIONS.prompts), orderBy('createdAt', 'desc')));
    return snapshot.docs.map((entry) => deserializePrompt(entry.id, entry.data() as Record<string, unknown>));
  },

  async getPromptsByAuthorUid(authorUid: string): Promise<Prompt[]> {
    if (!firebaseEnabled) {
      return mockPrompts.filter((prompt) => prompt.authorUid === authorUid).map(clonePrompt);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.prompts),
        where('authorUid', '==', authorUid),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializePrompt(entry.id, entry.data() as Record<string, unknown>));
  },

  async createPrompt(input: PromptCreateInput): Promise<Prompt> {
    const author = (await getUserByUid(input.authorUid)) ?? mockUsers.find((user) => user.uid === input.authorUid) ?? null;

    if (!author) {
      throw new Error(`Could not find author "${input.authorUid}" for prompt creation.`);
    }

    const prompt: Prompt = {
      id: crypto.randomUUID(),
      authorUid: author.uid,
      authorHandle: author.handle,
      authorAvatar: author.avatarUrl,
      videoUrl: input.videoUrl ?? '',
      thumbnailUrl: input.thumbnailUrl ?? '',
      mediaWidth: input.mediaWidth,
      mediaHeight: input.mediaHeight,
      promptText: input.promptText,
      model: input.model,
      contentType: input.contentType,
      aspectRatio: input.aspectRatio ?? 'landscape',
      styleTags: input.styleTags,
      cameraNotes: input.cameraNotes,
      moodLabel: input.moodLabel,
      difficulty: input.difficulty,
      likes: 0,
      saves: 0,
      copies: 0,
      forks: 0,
      isForked: false,
      forkedFromId: null,
      forkedFromAuthorHandle: null,
      createdAt: new Date(),
    };

    if (!firebaseEnabled) {
      return clonePrompt(prompt);
    }

    const firestore = requireDb();
    const promptDocument = { ...prompt } as Omit<Prompt, 'id'> & { id?: string };
    delete promptDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.prompts), {
      ...promptDocument,
    });

    return {
      ...prompt,
      id: created.id,
    };
  },

  async getLikedPromptIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.promptLikes), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().promptId ?? ''))
      .filter(Boolean);
  },

  async toggleLike(promptId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
    if (!userId) {
      throw new Error('Log in to like prompts.');
    }

    if (!firebaseEnabled) {
      return { liked: true, likes: 0 };
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const likeRef = doc(firestore, COLLECTIONS.promptLikes, `${promptId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(likeRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const currentLikes = Number(promptSnapshot.data().likes ?? 0);

      if (likeSnapshot.exists()) {
        transaction.delete(likeRef);
        transaction.update(promptRef, { likes: Math.max(0, currentLikes - 1) });
        return {
          liked: false,
          likes: Math.max(0, currentLikes - 1),
        };
      }

      transaction.set(likeRef, {
        promptId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(promptRef, { likes: currentLikes + 1 });

      return {
        liked: true,
        likes: currentLikes + 1,
      };
    });
  },

  async forkPrompt(input: ForkPromptInput): Promise<Prompt> {
    const sourcePrompt = firebaseEnabled
      ? await (async () => {
          const firestore = requireDb();
          const snapshot = await getDoc(doc(firestore, COLLECTIONS.prompts, input.sourcePromptId));
          return snapshot.exists()
            ? deserializePrompt(snapshot.id, snapshot.data() as Record<string, unknown>)
            : null;
        })()
      : (mockPrompts.find((prompt) => prompt.id === input.sourcePromptId) ?? null);

    if (!sourcePrompt) {
      throw new Error(`Could not find prompt "${input.sourcePromptId}" to fork.`);
    }

    const forked = await this.createPrompt({
      authorUid: input.authorUid,
      promptText: input.promptText,
      model: input.model,
      styleTags: input.styleTags,
      cameraNotes: sourcePrompt.cameraNotes,
      moodLabel: input.moodLabel,
      difficulty: sourcePrompt.difficulty,
      contentType: sourcePrompt.contentType,
      aspectRatio: sourcePrompt.aspectRatio,
      videoUrl: input.videoUrl ?? sourcePrompt.videoUrl,
      thumbnailUrl: input.thumbnailUrl ?? sourcePrompt.thumbnailUrl,
    });

    const result: Prompt = {
      ...forked,
      isForked: true,
      forkedFromId: sourcePrompt.id,
      forkedFromAuthorHandle: sourcePrompt.authorHandle,
    };

    if (!firebaseEnabled) {
      return result;
    }

    const firestore = requireDb();
    await updateDoc(doc(firestore, COLLECTIONS.prompts, result.id), {
      isForked: true,
      forkedFromId: sourcePrompt.id,
      forkedFromAuthorHandle: sourcePrompt.authorHandle,
    });

    return result;
  },
};

export const notificationsApi = {
  async getNotificationsForUser(userId: string): Promise<Notification[]> {
    if (!firebaseEnabled) {
      return mockNotifications.filter((notification) => notification.userId === userId).map(cloneNotification);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.notifications),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializeNotification(entry.id, entry.data() as Record<string, unknown>));
  },

  async markAllRead(userId: string): Promise<void> {
    if (!firebaseEnabled) {
      return;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.notifications), where('userId', '==', userId), where('read', '==', false)),
    );

    await Promise.all(snapshot.docs.map((entry) => updateDoc(doc(firestore, COLLECTIONS.notifications, entry.id), { read: true })));
  },
};

export const collectionsApi = {
  async getCollectionsForUser(userId: string): Promise<Collection[]> {
    if (!firebaseEnabled) {
      return mockCollections.filter((entry) => entry.userId === userId).map(cloneCollection);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.collections),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      ),
    );

    return snapshot.docs.map((entry) => deserializeCollection(entry.id, entry.data() as Record<string, unknown>));
  },

  async createCollection(input: CreateCollectionInput): Promise<Collection> {
    const collectionItem: Collection = {
      id: crypto.randomUUID(),
      userId: input.userId,
      name: input.name,
      description: input.description,
      count: 0,
      thumbnails: [],
      createdAt: new Date(),
    };

    if (!firebaseEnabled) {
      return cloneCollection(collectionItem);
    }

    const firestore = requireDb();
    const collectionDocument = { ...collectionItem } as Omit<Collection, 'id'> & { id?: string };
    delete collectionDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.collections), {
      ...collectionDocument,
    });

    return {
      ...collectionItem,
      id: created.id,
    };
  },
};

export const uploadsApi = {
  async uploadPromptMedia(file: File, userId: string) {
    if (!firebaseEnabled) {
      return {
        path: `mock://${userId}/${file.name}`,
        downloadUrl: URL.createObjectURL(file),
      };
    }

    const firebaseStorage = requireStorage();
    const fileRef = ref(firebaseStorage, `prompts/${userId}/${Date.now()}-${file.name}`);
    await uploadBytes(fileRef, file);

    return {
      path: fileRef.fullPath,
      downloadUrl: await getDownloadURL(fileRef),
    };
  },
};

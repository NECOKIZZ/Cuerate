import {
  addDoc,
  collection,
  deleteDoc,
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
import { auth, db, firebaseEnabled } from './firebase';
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
  Workflow,
  WorkflowCreateInput,
} from './types';
import { mockCollections, mockNotifications, mockPrompts, mockUsers, mockWorkflows } from './mockData';
import { isSupabaseConfigured, supabase, SUPABASE_BUCKET, SUPABASE_URL } from './supabase';

const LOCAL_AUTH_USER_KEY = 'cuerate.auth.user';
const LOCAL_AUTH_SESSION_KEY = 'cuerate.auth.sessionUid';
const LOCAL_EMAIL_LINK_KEY = 'cuerate.auth.emailLink';
const authListeners = new Set<(user: User | null) => void>();

const COLLECTIONS = {
  users: 'users',
  usersPrivate: 'usersPrivate',
  authLogs: 'authLogs',
  emailLookup: 'emailLookup',
  prompts: 'prompts',
  promptLikes: 'promptLikes',
  promptSaves: 'promptSaves',
  promptCopies: 'promptCopies',
  workflows: 'workflows',
  workflowLikes: 'workflowLikes',
  workflowSaves: 'workflowSaves',
  userFollows: 'userFollows',
  notifications: 'notifications',
  collections: 'collections',
} as const;

const QUERY_LIMITS = {
  users: 300,
  feedPrompts: 200,
  feedWorkflows: 150,
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

function cloneWorkflow(workflow: Workflow): Workflow {
  return {
    ...cloneDate(workflow),
    tags: [...workflow.tags],
    steps: workflow.steps.map((step) => ({ ...step })),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedFields(item)) as T;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedFields(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
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

function extractSupabaseStoragePathFromPublicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0 || SUPABASE_URL.length === 0) {
    return null;
  }

  try {
    const sourceUrl = new URL(value);
    const supabaseUrl = new URL(SUPABASE_URL);
    if (sourceUrl.origin !== supabaseUrl.origin) {
      return null;
    }

    const publicMarker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
    const markerIndex = sourceUrl.pathname.indexOf(publicMarker);
    if (markerIndex === -1) {
      return null;
    }

    const encodedPath = sourceUrl.pathname.slice(markerIndex + publicMarker.length);
    if (!encodedPath) {
      return null;
    }

    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
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
    workflowId: data.workflowId ? String(data.workflowId) : undefined,
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

function deserializeWorkflow(id: string, data: Record<string, unknown>): Workflow {
  return {
    id,
    authorUid: String(data.authorUid ?? ''),
    authorHandle: String(data.authorHandle ?? ''),
    authorAvatar: String(data.authorAvatar ?? ''),
    title: String(data.title ?? ''),
    tool: String(data.tool ?? ''),
    description: String(data.description ?? ''),
    coverVideoUrl: String(data.coverVideoUrl ?? ''),
    coverThumbnailUrl: String(data.coverThumbnailUrl ?? ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    stepCount: Number(data.stepCount ?? 0),
    likes: Number(data.likes ?? 0),
    saves: Number(data.saves ?? 0),
    mediaAspectRatio: data.mediaAspectRatio === 'portrait' ? 'portrait' : 'landscape',
    createdAt: toDate(data.createdAt),
    steps: Array.isArray(data.steps)
      ? data.steps.map((entry, index) => {
          const step = (entry ?? {}) as Record<string, unknown>;
          return {
            id: String(step.id ?? `step-${index + 1}`),
            stepNumber: Number(step.stepNumber ?? index + 1),
            label: String(step.label ?? ''),
            model: String(step.model ?? data.tool ?? ''),
            generationType: (step.generationType as Workflow['steps'][number]['generationType']) ?? 'prompt_to_video',
             promptText: step.promptText ? String(step.promptText) : undefined,
             note: step.note ? String(step.note) : undefined,
             inputImageUrl: step.inputImageUrl ? String(step.inputImageUrl) : undefined,
             ingredientsImageUrls: Array.isArray(step.ingredientsImageUrls)
               ? step.ingredientsImageUrls.map(String)
               : undefined,
             startFrameUrl: step.startFrameUrl ? String(step.startFrameUrl) : undefined,
             endFrameUrl: step.endFrameUrl ? String(step.endFrameUrl) : undefined,
            resultMediaUrl: String(step.resultMediaUrl ?? ''),
            resultThumbnailUrl: String(step.resultThumbnailUrl ?? ''),
            resultContentType: step.resultContentType === 'image' ? 'image' : 'video',
          };
        })
      : [],
  };
}

function requireDb() {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Add your Vite Firebase env vars to enable backend reads/writes.');
  }

  return db;
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
  const publicProfile = stripUndefinedFields({
    uid: profile.uid,
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    links: profile.links,
    primaryModels: profile.primaryModels,
    followers: profile.followers,
    following: profile.following,
    totalCopies: profile.totalCopies,
    totalPrompts: profile.totalPrompts,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
  await setDoc(doc(firestore, COLLECTIONS.users, profile.uid), publicProfile, { merge: true });

  const privateProfile = stripUndefinedFields({
    uid: profile.uid,
    email: profile.email,
    emailVerified: profile.emailVerified,
    authProvider: profile.authProvider,
    lastLoginAt: profile.lastLoginAt,
    updatedAt: new Date(),
  });
  if (Object.keys(privateProfile).length > 1) {
    await setDoc(doc(firestore, COLLECTIONS.usersPrivate, profile.uid), privateProfile, { merge: true });
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

async function isHandleTakenByAnotherUser(handle: string, currentUserId: string) {
  const normalizedHandle = sanitizeHandle(handle);
  if (!normalizedHandle) {
    return false;
  }

  if (!firebaseEnabled) {
    return getFallbackUsers().some((user) => user.handle === normalizedHandle && user.uid !== currentUserId);
  }

  const firestore = requireDb();
  const snapshot = await getDocs(
    query(collection(firestore, COLLECTIONS.users), where('handle', '==', normalizedHandle), limit(2)),
  );
  return snapshot.docs.some((docSnapshot) => docSnapshot.id !== currentUserId);
}

async function syncAuthorIdentityOnContent(input: {
  uid: string;
  handle?: string;
  avatarUrl?: string;
}) {
  if (!firebaseEnabled) {
    return;
  }

  const updates = stripUndefinedFields({
    authorHandle: input.handle,
    authorAvatar: input.avatarUrl,
  });

  if (Object.keys(updates).length === 0) {
    return;
  }

  const firestore = requireDb();
  const [promptSnapshots, workflowSnapshots] = await Promise.all([
    getDocs(query(collection(firestore, COLLECTIONS.prompts), where('authorUid', '==', input.uid))),
    getDocs(query(collection(firestore, COLLECTIONS.workflows), where('authorUid', '==', input.uid))),
  ]);

  await Promise.all([
    ...promptSnapshots.docs.map((entry) => updateDoc(entry.ref, updates)),
    ...workflowSnapshots.docs.map((entry) => updateDoc(entry.ref, updates)),
  ]);
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
  const created = await addDoc(collection(firestore, COLLECTIONS.authLogs), stripUndefinedFields(authLogDocument));

  return {
    ...authLog,
    id: created.id,
  };
}

async function createNotification(input: Omit<Notification, 'id' | 'read' | 'createdAt'>) {
  if (!input.userId || !input.fromUid || input.userId === input.fromUid) {
    return;
  }

  const notification: Notification = {
    id: crypto.randomUUID(),
    read: false,
    createdAt: new Date(),
    ...input,
  };

  try {
    if (!firebaseEnabled) {
      mockNotifications.unshift(cloneNotification(notification));
      return;
    }

    const firestore = requireDb();
    const notificationDocument = { ...notification } as Omit<Notification, 'id'> & { id?: string };
    delete notificationDocument.id;
    await addDoc(collection(firestore, COLLECTIONS.notifications), stripUndefinedFields(notificationDocument));
  } catch (error) {
    console.error('Could not create notification:', error);
  }
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
      const normalizedHandle = sanitizeHandle(input.handle || normalizedEmail.split('@')[0]);

      if (input.mode === 'signup') {
        if (normalizedHandle && (await handleExists(normalizedHandle))) {
          throw new Error('Username taken. Choose another one.');
        }
      }

      writePendingEmailLink({
        mode: input.mode,
        email: normalizedEmail,
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
          displayName: pending.handle || pending.email.split('@')[0],
          handle: sanitizeHandle(pending.handle || pending.email.split('@')[0]) || 'creator',
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
      const desiredHandle = existingUser?.handle || pending.handle || pending.email.split('@')[0];
      const uniqueHandle = await ensureUniqueHandle(desiredHandle, credential.user.uid);
      const user = await upsertUserProfile(
        buildUserProfileFromAuthUser(credential.user, {
          ...existingUser,
          displayName: uniqueHandle,
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

    async updateProfile(input: {
      uid: string;
      handle: string;
      bio: string;
      avatarUrl?: string;
      links?: User['links'];
    }): Promise<User> {
      if (!input.uid) {
        throw new Error('Missing user id.');
      }

      if (firebaseEnabled && auth?.currentUser?.uid !== input.uid) {
        throw new Error('You can only edit your own profile.');
      }

      const existingUser = await getUserByUid(input.uid);
      if (!existingUser) {
        throw new Error('Profile not found.');
      }

      const normalizedHandle = sanitizeHandle(input.handle);
      if (!normalizedHandle) {
        throw new Error('Username must include letters, numbers, or underscores.');
      }

      if (await isHandleTakenByAnotherUser(normalizedHandle, input.uid)) {
        throw new Error('Username taken. Choose another one.');
      }

      const nextUser: User = {
        ...existingUser,
        handle: normalizedHandle,
        displayName: normalizedHandle,
        bio: input.bio.trim(),
        avatarUrl: input.avatarUrl ?? existingUser.avatarUrl,
        links: input.links ?? existingUser.links,
        updatedAt: new Date(),
      };

      const savedUser = await upsertUserProfile(nextUser);

      const handleChanged = savedUser.handle !== existingUser.handle;
      const avatarChanged = savedUser.avatarUrl !== existingUser.avatarUrl;

      if (handleChanged || avatarChanged) {
        await syncAuthorIdentityOnContent({
          uid: savedUser.uid,
          handle: handleChanged ? savedUser.handle : undefined,
          avatarUrl: avatarChanged ? savedUser.avatarUrl : undefined,
        });
      }

      writeLocalAuthUser(savedUser);
      emitAuthUser(savedUser);
      return cloneUser(savedUser);
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
          displayName: existingUser?.displayName || uniqueHandle,
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
  supabaseConfigured: isSupabaseConfigured,
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
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.users),
        orderBy('followers', 'desc'),
        limit(QUERY_LIMITS.users),
      ),
    );
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

export const followsApi = {
  async getFollowingUserIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.userFollows), where('followerUid', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().followingUid ?? ''))
      .filter(Boolean);
  },

  async getFollowerCount(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }

    if (!firebaseEnabled) {
      return 0;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.userFollows), where('followingUid', '==', userId)),
    );

    return snapshot.size;
  },

  async getFollowingCount(userId: string): Promise<number> {
    if (!userId) {
      return 0;
    }

    if (!firebaseEnabled) {
      return 0;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.userFollows), where('followerUid', '==', userId)),
    );

    return snapshot.size;
  },

  async isFollowing(followerUid: string, followingUid: string): Promise<boolean> {
    if (!followerUid || !followingUid) {
      return false;
    }

    if (!firebaseEnabled) {
      return false;
    }

    const firestore = requireDb();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.userFollows, `${followerUid}_${followingUid}`));
    return snapshot.exists();
  },

  async toggleFollow(followerUid: string, followingUid: string): Promise<{ following: boolean }> {
    if (!followerUid) {
      throw new Error('Log in to follow creators.');
    }

    if (!followingUid || followerUid === followingUid) {
      throw new Error('Invalid follow target.');
    }

    if (!firebaseEnabled) {
      return { following: true };
    }

    const firestore = requireDb();
    const followRef = doc(firestore, COLLECTIONS.userFollows, `${followerUid}_${followingUid}`);
    const followSnapshot = await getDoc(followRef);

    if (followSnapshot.exists()) {
      await deleteDoc(followRef);
      return { following: false };
    }

    await setDoc(followRef, {
      followerUid,
      followingUid,
      createdAt: new Date(),
    });

    try {
      const follower = await getUserByUid(followerUid);
      const followerHandle = follower?.handle || 'creator';
      await createNotification({
        userId: followingUid,
        type: 'follow',
        fromUid: followerUid,
        fromHandle: followerHandle,
        fromAvatar: follower?.avatarUrl,
        message: `@${followerHandle} started following you`,
      });
    } catch (error) {
      console.error('Could not enqueue follow notification:', error);
    }

    return { following: true };
  },
};

export const promptsApi = {
  async getFeedPrompts(): Promise<Prompt[]> {
    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.prompts),
        orderBy('createdAt', 'desc'),
        limit(QUERY_LIMITS.feedPrompts),
      ),
    );
    return snapshot.docs.map((entry) => deserializePrompt(entry.id, entry.data() as Record<string, unknown>));
  },

  async getPromptById(promptId: string): Promise<Prompt | null> {
    if (!promptId) {
      return null;
    }

    if (!firebaseEnabled) {
      const prompt = mockPrompts.find((entry) => entry.id === promptId) ?? null;
      return prompt ? clonePrompt(prompt) : null;
    }

    const firestore = requireDb();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.prompts, promptId));
    if (!snapshot.exists()) {
      return null;
    }

    return deserializePrompt(snapshot.id, snapshot.data() as Record<string, unknown>);
  },

  async getPromptsByAuthorUid(authorUid: string): Promise<Prompt[]> {
    if (!firebaseEnabled) {
      return [];
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
      ...stripUndefinedFields(promptDocument),
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

  async getSavedPromptIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.promptSaves), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().promptId ?? ''))
      .filter(Boolean);
  },

  async getCopiedPromptIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.promptCopies), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().promptId ?? ''))
      .filter(Boolean);
  },

  async recordCopy(promptId: string, userId: string): Promise<{ counted: boolean; copies: number }> {
    if (!userId) {
      throw new Error('Log in to copy prompts.');
    }

    if (!firebaseEnabled) {
      return { counted: true, copies: 0 };
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const copyRef = doc(firestore, COLLECTIONS.promptCopies, `${promptId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, copySnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(copyRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const currentCopies = Number(promptSnapshot.data().copies ?? 0);
      if (copySnapshot.exists()) {
        return {
          counted: false,
          copies: currentCopies,
        };
      }

      transaction.set(copyRef, {
        promptId,
        userId,
        authorUid: String(promptSnapshot.data().authorUid ?? ''),
        createdAt: new Date(),
      });
      transaction.update(promptRef, { copies: currentCopies + 1 });
      return {
        counted: true,
        copies: currentCopies + 1,
      };
    });
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

    const result = await runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(likeRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const promptData = promptSnapshot.data();
      const currentLikes = Number(promptSnapshot.data().likes ?? 0);
      const authorUid = String(promptData.authorUid ?? '');

      if (likeSnapshot.exists()) {
        transaction.delete(likeRef);
        transaction.update(promptRef, { likes: Math.max(0, currentLikes - 1) });
        return {
          liked: false,
          likes: Math.max(0, currentLikes - 1),
          authorUid,
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
        authorUid,
      };
    });

    if (result.liked && result.authorUid && result.authorUid !== userId) {
      try {
        const actor = await getUserByUid(userId);
        const actorHandle = actor?.handle || 'creator';
        await createNotification({
          userId: result.authorUid,
          type: 'like',
          fromUid: userId,
          fromHandle: actorHandle,
          fromAvatar: actor?.avatarUrl,
          promptId,
          message: `@${actorHandle} liked your prompt`,
        });
      } catch (error) {
        console.error('Could not enqueue prompt-like notification:', error);
      }
    }

    return {
      liked: result.liked,
      likes: result.likes,
    };
  },

  async toggleSave(promptId: string, userId: string): Promise<{ saved: boolean; saves: number }> {
    if (!userId) {
      throw new Error('Log in to save prompts.');
    }

    if (!firebaseEnabled) {
      return { saved: true, saves: 0 };
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const saveRef = doc(firestore, COLLECTIONS.promptSaves, `${promptId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [promptSnapshot, saveSnapshot] = await Promise.all([
        transaction.get(promptRef),
        transaction.get(saveRef),
      ]);

      if (!promptSnapshot.exists()) {
        throw new Error('Prompt not found.');
      }

      const currentSaves = Number(promptSnapshot.data().saves ?? 0);

      if (saveSnapshot.exists()) {
        transaction.delete(saveRef);
        transaction.update(promptRef, { saves: Math.max(0, currentSaves - 1) });
        return {
          saved: false,
          saves: Math.max(0, currentSaves - 1),
        };
      }

      transaction.set(saveRef, {
        promptId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(promptRef, { saves: currentSaves + 1 });
      return {
        saved: true,
        saves: currentSaves + 1,
      };
    });
  },

  async deletePrompt(promptId: string, userId: string): Promise<void> {
    if (!userId) {
      throw new Error('Log in to delete prompts.');
    }

    if (!firebaseEnabled) {
      return;
    }

    const firestore = requireDb();
    const promptRef = doc(firestore, COLLECTIONS.prompts, promptId);
    const promptSnapshot = await getDoc(promptRef);

    if (!promptSnapshot.exists()) {
      throw new Error('Prompt not found.');
    }

    const promptData = promptSnapshot.data() as Record<string, unknown>;
    if (String(promptData.authorUid ?? '') !== userId) {
      throw new Error('Only the author can delete this prompt.');
    }

    const mediaPaths = new Set<string>();
    const videoPath = extractSupabaseStoragePathFromPublicUrl(promptData.videoUrl);
    const thumbnailPath = extractSupabaseStoragePathFromPublicUrl(promptData.thumbnailUrl);
    if (videoPath) {
      mediaPaths.add(videoPath);
    }
    if (thumbnailPath) {
      mediaPaths.add(thumbnailPath);
    }

    if (mediaPaths.size > 0) {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase Storage is required to delete prompt media.');
      }

      const { error: storageDeleteError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove(Array.from(mediaPaths));

      if (storageDeleteError) {
        if (/row-level security/i.test(storageDeleteError.message)) {
          throw new Error(
            `Supabase Storage policy blocked prompt media deletion for bucket "${SUPABASE_BUCKET}". Add DELETE policies for this bucket.`,
          );
        }
        throw new Error(storageDeleteError.message || 'Could not delete prompt media from Supabase Storage.');
      }
    }

    const [likeSnapshots, saveSnapshots, copySnapshots] = await Promise.all([
      getDocs(
        query(collection(firestore, COLLECTIONS.promptLikes), where('promptId', '==', promptId)),
      ),
      getDocs(
        query(collection(firestore, COLLECTIONS.promptSaves), where('promptId', '==', promptId)),
      ),
      getDocs(
        query(collection(firestore, COLLECTIONS.promptCopies), where('promptId', '==', promptId)),
      ),
    ]);

    await Promise.all([
      ...likeSnapshots.docs.map((likeDoc) => deleteDoc(likeDoc.ref)),
      ...saveSnapshots.docs.map((saveDoc) => deleteDoc(saveDoc.ref)),
      ...copySnapshots.docs.map((copyDoc) => deleteDoc(copyDoc.ref)),
    ]);
    await deleteDoc(promptRef);
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
      aspectRatio: input.aspectRatio ?? sourcePrompt.aspectRatio,
      videoUrl: input.videoUrl ?? sourcePrompt.videoUrl,
      thumbnailUrl: input.thumbnailUrl ?? sourcePrompt.thumbnailUrl,
      mediaWidth: input.mediaWidth ?? sourcePrompt.mediaWidth,
      mediaHeight: input.mediaHeight ?? sourcePrompt.mediaHeight,
    });

    const result: Prompt = {
      ...forked,
      isForked: true,
      forkedFromId: sourcePrompt.id,
      forkedFromAuthorHandle: sourcePrompt.authorHandle,
    };

    if (!firebaseEnabled) {
      const sourcePromptInMock = mockPrompts.find((prompt) => prompt.id === sourcePrompt.id);
      if (sourcePromptInMock) {
        sourcePromptInMock.forks += 1;
      }

      if (sourcePrompt.authorUid !== input.authorUid) {
        try {
          const actor = await getUserByUid(input.authorUid);
          const actorHandle = actor?.handle || 'creator';
          await createNotification({
            userId: sourcePrompt.authorUid,
            type: 'fork',
            fromUid: input.authorUid,
            fromHandle: actorHandle,
            fromAvatar: actor?.avatarUrl,
            promptId: sourcePrompt.id,
            message: `@${actorHandle} forked your prompt`,
          });
        } catch (error) {
          console.error('Could not enqueue fork notification:', error);
        }
      }
      return result;
    }

    const firestore = requireDb();
    await updateDoc(doc(firestore, COLLECTIONS.prompts, result.id), {
      isForked: true,
      forkedFromId: sourcePrompt.id,
      forkedFromAuthorHandle: sourcePrompt.authorHandle,
    });

    if (sourcePrompt.authorUid !== input.authorUid) {
      try {
        const actor = await getUserByUid(input.authorUid);
        const actorHandle = actor?.handle || 'creator';
        await createNotification({
          userId: sourcePrompt.authorUid,
          type: 'fork',
          fromUid: input.authorUid,
          fromHandle: actorHandle,
          fromAvatar: actor?.avatarUrl,
          promptId: sourcePrompt.id,
          message: `@${actorHandle} forked your prompt`,
        });
      } catch (error) {
        console.error('Could not enqueue fork notification:', error);
      }
    }

    return result;
  },
};

export const workflowsApi = {
  async getFeedWorkflows(): Promise<Workflow[]> {
    if (!firebaseEnabled) {
      return mockWorkflows.map(cloneWorkflow);
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(
        collection(firestore, COLLECTIONS.workflows),
        orderBy('createdAt', 'desc'),
        limit(QUERY_LIMITS.feedWorkflows),
      ),
    );
    return snapshot.docs.map((entry) => deserializeWorkflow(entry.id, entry.data() as Record<string, unknown>));
  },

  async getWorkflowById(workflowId: string): Promise<Workflow | null> {
    if (!firebaseEnabled) {
      const workflow = mockWorkflows.find((entry) => entry.id === workflowId) ?? null;
      return workflow ? cloneWorkflow(workflow) : null;
    }

    const firestore = requireDb();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.workflows, workflowId));
    if (!snapshot.exists()) {
      return null;
    }
    return deserializeWorkflow(snapshot.id, snapshot.data() as Record<string, unknown>);
  },

  async createWorkflow(input: WorkflowCreateInput): Promise<Workflow> {
    const author = (await getUserByUid(input.authorUid)) ?? mockUsers.find((user) => user.uid === input.authorUid) ?? null;

    if (!author) {
      throw new Error(`Could not find author "${input.authorUid}" for workflow creation.`);
    }

    const workflow: Workflow = {
      id: crypto.randomUUID(),
      authorUid: author.uid,
      authorHandle: author.handle,
      authorAvatar: author.avatarUrl,
      title: input.title.trim(),
      tool: input.tool.trim(),
      description: input.description.trim(),
      coverVideoUrl: input.coverVideoUrl,
      coverThumbnailUrl: input.coverThumbnailUrl,
      tags: input.tags,
      stepCount: input.steps.length,
      likes: 0,
      saves: 0,
      mediaAspectRatio: input.mediaAspectRatio ?? 'landscape',
      createdAt: new Date(),
      steps: input.steps.map((step, index) => ({
        id: `step-${index + 1}`,
        stepNumber: index + 1,
        label: step.label.trim() || `Step ${index + 1}`,
        model: step.model.trim() || input.tool.trim(),
        generationType: step.generationType,
        promptText: step.promptText?.trim() || undefined,
        note: step.note?.trim() || undefined,
        inputImageUrl: step.inputImageUrl,
        ingredientsImageUrls: step.ingredientsImageUrls,
        startFrameUrl: step.startFrameUrl,
        endFrameUrl: step.endFrameUrl,
        resultMediaUrl: step.resultMediaUrl,
        resultThumbnailUrl: step.resultThumbnailUrl,
        resultContentType: step.resultContentType,
      })),
    };

    if (!firebaseEnabled) {
      return cloneWorkflow(workflow);
    }

    const firestore = requireDb();
    const workflowDocument = { ...workflow } as Omit<Workflow, 'id'> & { id?: string };
    delete workflowDocument.id;
    const created = await addDoc(collection(firestore, COLLECTIONS.workflows), {
      ...stripUndefinedFields(workflowDocument),
    });

    return {
      ...workflow,
      id: created.id,
    };
  },

  async getLikedWorkflowIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.workflowLikes), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().workflowId ?? ''))
      .filter(Boolean);
  },

  async getSavedWorkflowIds(userId: string): Promise<string[]> {
    if (!userId) {
      return [];
    }

    if (!firebaseEnabled) {
      return [];
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.workflowSaves), where('userId', '==', userId)),
    );

    return snapshot.docs
      .map((entry) => String(entry.data().workflowId ?? ''))
      .filter(Boolean);
  },

  async toggleLike(workflowId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
    if (!userId) {
      throw new Error('Log in to like workflows.');
    }

    if (!firebaseEnabled) {
      return { liked: true, likes: 0 };
    }

    const firestore = requireDb();
    const workflowRef = doc(firestore, COLLECTIONS.workflows, workflowId);
    const likeRef = doc(firestore, COLLECTIONS.workflowLikes, `${workflowId}_${userId}`);

    const result = await runTransaction(firestore, async (transaction) => {
      const [workflowSnapshot, likeSnapshot] = await Promise.all([
        transaction.get(workflowRef),
        transaction.get(likeRef),
      ]);

      if (!workflowSnapshot.exists()) {
        throw new Error('Workflow not found.');
      }

      const workflowData = workflowSnapshot.data();
      const currentLikes = Number(workflowSnapshot.data().likes ?? 0);
      const authorUid = String(workflowData.authorUid ?? '');
      const workflowTitle = String(workflowData.title ?? '');

      if (likeSnapshot.exists()) {
        transaction.delete(likeRef);
        transaction.update(workflowRef, { likes: Math.max(0, currentLikes - 1) });
        return {
          liked: false,
          likes: Math.max(0, currentLikes - 1),
          authorUid,
          workflowTitle,
        };
      }

      transaction.set(likeRef, {
        workflowId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(workflowRef, { likes: currentLikes + 1 });
      return {
        liked: true,
        likes: currentLikes + 1,
        authorUid,
        workflowTitle,
      };
    });

    if (result.liked && result.authorUid && result.authorUid !== userId) {
      try {
        const actor = await getUserByUid(userId);
        const actorHandle = actor?.handle || 'creator';
        await createNotification({
          userId: result.authorUid,
          type: 'like',
          fromUid: userId,
          fromHandle: actorHandle,
          fromAvatar: actor?.avatarUrl,
          workflowId,
          message: result.workflowTitle
            ? `@${actorHandle} liked your workflow "${result.workflowTitle}"`
            : `@${actorHandle} liked your workflow`,
        });
      } catch (error) {
        console.error('Could not enqueue workflow-like notification:', error);
      }
    }

    return {
      liked: result.liked,
      likes: result.likes,
    };
  },

  async toggleSave(workflowId: string, userId: string): Promise<{ saved: boolean; saves: number }> {
    if (!userId) {
      throw new Error('Log in to save workflows.');
    }

    if (!firebaseEnabled) {
      return { saved: true, saves: 0 };
    }

    const firestore = requireDb();
    const workflowRef = doc(firestore, COLLECTIONS.workflows, workflowId);
    const saveRef = doc(firestore, COLLECTIONS.workflowSaves, `${workflowId}_${userId}`);

    return runTransaction(firestore, async (transaction) => {
      const [workflowSnapshot, saveSnapshot] = await Promise.all([
        transaction.get(workflowRef),
        transaction.get(saveRef),
      ]);

      if (!workflowSnapshot.exists()) {
        throw new Error('Workflow not found.');
      }

      const currentSaves = Number(workflowSnapshot.data().saves ?? 0);

      if (saveSnapshot.exists()) {
        transaction.delete(saveRef);
        transaction.update(workflowRef, { saves: Math.max(0, currentSaves - 1) });
        return {
          saved: false,
          saves: Math.max(0, currentSaves - 1),
        };
      }

      transaction.set(saveRef, {
        workflowId,
        userId,
        createdAt: new Date(),
      });
      transaction.update(workflowRef, { saves: currentSaves + 1 });
      return {
        saved: true,
        saves: currentSaves + 1,
      };
    });
  },

  async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
    if (!userId) {
      throw new Error('Log in to delete workflows.');
    }

    if (!firebaseEnabled) {
      return;
    }

    const firestore = requireDb();
    const workflowRef = doc(firestore, COLLECTIONS.workflows, workflowId);
    const workflowSnapshot = await getDoc(workflowRef);

    if (!workflowSnapshot.exists()) {
      throw new Error('Workflow not found.');
    }

    const workflowData = workflowSnapshot.data() as Record<string, unknown>;
    if (String(workflowData.authorUid ?? '') !== userId) {
      throw new Error('Only the author can delete this workflow.');
    }

    const steps = Array.isArray(workflowData.steps)
      ? workflowData.steps.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object',
        )
      : [];

    const mediaUrls: Array<string | null | undefined> = [
      typeof workflowData.coverVideoUrl === 'string' ? workflowData.coverVideoUrl : undefined,
      typeof workflowData.coverThumbnailUrl === 'string' ? workflowData.coverThumbnailUrl : undefined,
    ];

    for (const step of steps) {
      mediaUrls.push(
        typeof step.inputImageUrl === 'string' ? step.inputImageUrl : undefined,
        ...(Array.isArray(step.ingredientsImageUrls)
          ? step.ingredientsImageUrls.filter((url): url is string => typeof url === 'string')
          : []),
        typeof step.startFrameUrl === 'string' ? step.startFrameUrl : undefined,
        typeof step.endFrameUrl === 'string' ? step.endFrameUrl : undefined,
        typeof step.resultMediaUrl === 'string' ? step.resultMediaUrl : undefined,
        typeof step.resultThumbnailUrl === 'string' ? step.resultThumbnailUrl : undefined,
      );
    }

    await uploadsApi.deletePublicMediaUrls(mediaUrls);

    const [likeSnapshots, saveSnapshots] = await Promise.all([
      getDocs(
        query(collection(firestore, COLLECTIONS.workflowLikes), where('workflowId', '==', workflowId)),
      ),
      getDocs(
        query(collection(firestore, COLLECTIONS.workflowSaves), where('workflowId', '==', workflowId)),
      ),
    ]);

    await Promise.all([
      ...likeSnapshots.docs.map((likeDoc) => deleteDoc(likeDoc.ref)),
      ...saveSnapshots.docs.map((saveDoc) => deleteDoc(saveDoc.ref)),
    ]);
    await deleteDoc(workflowRef);
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
      for (const notification of mockNotifications) {
        if (notification.userId === userId) {
          notification.read = true;
        }
      }
      return;
    }

    const firestore = requireDb();
    const snapshot = await getDocs(
      query(collection(firestore, COLLECTIONS.notifications), where('userId', '==', userId), where('read', '==', false)),
    );

    await Promise.all(snapshot.docs.map((entry) => updateDoc(doc(firestore, COLLECTIONS.notifications, entry.id), { read: true })));
  },

  async markRead(notificationId: string, userId: string): Promise<void> {
    if (!notificationId || !userId) {
      return;
    }

    if (!firebaseEnabled) {
      const target = mockNotifications.find((entry) => entry.id === notificationId && entry.userId === userId);
      if (target) {
        target.read = true;
      }
      return;
    }

    const firestore = requireDb();
    await updateDoc(doc(firestore, COLLECTIONS.notifications, notificationId), { read: true });
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
      ...stripUndefinedFields(collectionDocument),
    });

    return {
      ...collectionItem,
      id: created.id,
    };
  },
};

export const uploadsApi = {
  async uploadPromptMedia(file: File, userId: string) {
    // Supabase buckets are the single media storage backend.
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase Storage is required for media uploads. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SUPABASE_BUCKET.',
      );
    }

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `prompts/${userId}/${fileName}`;

    try {
      const { data: _data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        if (/row-level security/i.test(error.message)) {
          throw new Error(
            `Supabase Storage policy blocked the upload for bucket "${SUPABASE_BUCKET}". Add least-privilege INSERT policy for allowed paths (and avoid broad SELECT/list policies).`,
          );
        }
        console.error('Supabase upload error:', error);
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/failed to fetch/i.test(message)) {
        throw new Error(
          `Upload could not reach Supabase (${SUPABASE_URL}). Check internet/VPN, disable ad blockers for localhost, and confirm the Supabase project is active.`,
        );
      }
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      downloadUrl: publicUrl,
    };
  },

  async uploadProfileAvatar(file: File, userId: string) {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase Storage is required for media uploads. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SUPABASE_BUCKET.',
      );
    }

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `avatars/${userId}/${fileName}`;

    try {
      const { data: _data, error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        if (/row-level security/i.test(error.message)) {
          throw new Error(
            `Supabase Storage policy blocked the upload for bucket "${SUPABASE_BUCKET}". Add least-privilege INSERT policy for allowed paths (and avoid broad SELECT/list policies).`,
          );
        }
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/failed to fetch/i.test(message)) {
        throw new Error(
          `Upload could not reach Supabase (${SUPABASE_URL}). Check internet/VPN, disable ad blockers for localhost, and confirm the Supabase project is active.`,
        );
      }
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      downloadUrl: publicUrl,
    };
  },

  async deletePublicMediaUrls(urls: Array<string | null | undefined>) {
    const storagePaths = Array.from(
      new Set(
        urls
          .map((entry) => extractSupabaseStoragePathFromPublicUrl(entry))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    );

    if (storagePaths.length === 0) {
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase Storage is required for media deletion. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SUPABASE_BUCKET.',
      );
    }

    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove(storagePaths);

    if (error) {
      if (/row-level security/i.test(error.message)) {
        throw new Error(
          `Supabase Storage policy blocked media deletion for bucket "${SUPABASE_BUCKET}". Add DELETE policies for this bucket.`,
        );
      }
      throw new Error(error.message || 'Could not delete media from Supabase Storage.');
    }
  },
};

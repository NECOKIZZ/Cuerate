import { getFirestore } from 'firebase-admin/firestore';

function db() {
  return getFirestore();
}

const FETCH_LIMIT = 200;

export type PromptMatch = {
  id: string;
  authorUid: string;
  authorHandle: string;
  promptText: string;
  model: string;
  thumbnailUrl: string;
  styleTags: string[];
  moodLabel: string;
  score: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

/**
 * Keyword-overlap search over the prompt library. No embeddings — bounded read of the most
 * recent prompts, scored by term frequency against the prompt text, model, style tags, and mood.
 * Hackathon scope per spec §2.2; swap in vector search later behind the same signature.
 */
export async function searchPrompts(query: string): Promise<PromptMatch | null> {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return null;
  }

  let snapshot;
  try {
    snapshot = await db()
      .collection('prompts')
      .orderBy('createdAt', 'desc')
      .limit(FETCH_LIMIT)
      .get();
  } catch {
    // Fallback if createdAt isn't indexed/orderable on every doc.
    snapshot = await db().collection('prompts').limit(FETCH_LIMIT).get();
  }

  let best: PromptMatch | null = null;

  for (const doc of snapshot.docs) {
    const data = doc.data() ?? {};
    const promptText = String(data.promptText ?? '');
    const model = String(data.model ?? '');
    const styleTags = Array.isArray(data.styleTags) ? data.styleTags.map(String) : [];
    const moodLabel = String(data.moodLabel ?? '');

    // Weighted haystack: tags and model count extra because they're high-signal.
    const haystack = [
      promptText,
      model,
      model,
      styleTags.join(' '),
      styleTags.join(' '),
      moodLabel,
    ].join(' ');
    const hay = new Set(tokenize(haystack));

    let score = 0;
    for (const term of terms) {
      if (hay.has(term)) {
        score += 1;
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = {
        id: doc.id,
        authorUid: String(data.authorUid ?? ''),
        authorHandle: String(data.authorHandle ?? ''),
        promptText,
        model,
        thumbnailUrl: String(data.thumbnailUrl ?? ''),
        styleTags,
        moodLabel,
        score,
      };
    }
  }

  return best;
}

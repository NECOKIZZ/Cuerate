# Feed Algorithm & Personalization Plan

## Problem Statement

Users should not see:
- Posts they already liked
- Posts they already saved
- Posts they already viewed (impressions)
- Their own posts (unless on their profile)

Plus we want ranking: what to show first among unseen content.

---

## Phase 1: Interaction Tracking (Foundation)

### 1.1 New Collection: `userInteractions/{userId}/interactions/{postId}`

```json
{
  "postId": "post_123",
  "type": "like" | "save" | "impression" | "dismiss",
  "createdAt": "timestamp",
  "scoreImpact": 1 // used for collaborative filtering later
}
```

Alternative (more efficient for Firebase): Store as arrays in `users/{userId}`:

```json
{
  "likedPosts": ["post_1", "post_2"],
  "savedPosts": ["post_3"],
  "seenPosts": ["post_1", "post_2", "post_3", "post_4"],
  "dismissedPosts": ["post_5"],
  "lastFeedFetch": "timestamp"
}
```

**Why arrays:** Firestore `not-in` queries can exclude up to 10 items. For larger exclusion lists, we need a different strategy.

### 1.2 Impression Tracking (Seen but not interacted)

Option A — Client-side:
- When PostCard scrolls into viewport (IntersectionObserver), fire `recordImpression(postId)`
- Debounced: only record if user pauses for >1 second on the card

Option B — Lazy:
- Don't track impressions initially
- Just exclude liked + saved + own posts
- Add impressions later when needed

**Recommendation: Start with Option B.** Impressions are expensive to track at scale.

---

## Phase 2: Feed Query Strategy

### 2.1 The Core Problem

Firestore limitations:
- `not-in` supports max 10 values
- Cannot do `where('id', 'not-in', [100+ postIds])`
- Cannot do complex joins or subqueries

### 2.2 Practical Solutions (in order of complexity)

#### Solution A: Client-Side Filtering (Start Here)

1. Query top 50 posts by `createdAt desc` (or `score desc`)
2. Client filters out posts in `user.likedPosts`, `user.savedPosts`, `user.ownPosts`
3. If filtered results < 10, fetch next 50
4. Repeat until feed is full or no more posts

**Pros:** Dead simple, works immediately
**Cons:** Wasted reads (fetching posts we discard), doesn't scale to huge exclusion lists

#### Solution B: Feed Precomputation (Recommended for Scale)

1. Cloud Function `generateUserFeed` runs every 5 minutes or on-demand
2. For each user, compute their personalized feed:
   - Query all posts from last 7 days
   - Exclude liked/saved/own posts
   - Score remaining posts by relevance
   - Write top 100 post IDs to `userFeeds/{userId}` doc

3. Client fetches `userFeeds/{userId}` then hydrates post data

```json
// userFeeds/{userId}
{
  "feed": ["post_5", "post_9", "post_2", "post_11"],
  "lastUpdated": "timestamp",
  "version": 3
}
```

**Pros:** Fast client reads, complex scoring possible server-side
**Cons:** Slight delay before new posts appear (~5 min), more function compute

#### Solution C: Hybrid Approach (Best of Both)

- Use Solution B for the main feed (precomputed)
- Use Solution A for "fresh" content (last 1 hour not yet in precomputed feed)
- Merge client-side: show precomputed first, then append fresh

---

## Phase 3: Scoring & Ranking

### 3.1 Post Score Formula

```
score = (
  timeDecay * 40 +
  engagementScore * 30 +
  creatorQuality * 20 +
  recencyBoost * 10
)
```

**Time Decay:**
```javascript
const hoursOld = (now - post.createdAt) / 3600000;
const timeDecay = Math.max(0, 1 - (hoursOld / 168)); // linear decay over 7 days
```

**Engagement Score:**
```javascript
const engagementScore = Math.min(1, (
  post.likes * (tier2Weight ? 10 : 1) +
  post.saves * 3 +
  post.forks * 5
) / 100); // normalize to ~100 interactions = full score
```

**Creator Quality:**
```javascript
const creatorQuality = Math.min(1, creator.totalEarned / 10); // $10 earned = full score
```

**Recency Boost:**
```javascript
const recencyBoost = hoursOld < 1 ? 1 : 0; // brand new posts get a bump
```

### 3.2 Personalized Boost (Future)

Once you have interaction history, add:
- **Tag affinity:** User likes posts tagged "cinematic" → boost cinematic posts
- **Creator affinity:** User likes @creator's posts → boost that creator's new posts
- **Diversity injection:** Every 5th post is from a new/unfollowed creator to prevent echo chambers

---

## Phase 4: Specific Feed Types

### 4.1 Main Feed (Home)
- Exclude: liked, saved, own, dismissed
- Sort: score descending
- Mix: 80% algorithmic, 20% "trending now" (highest engagement last 24h)

### 4.2 Following Feed (if you add follows)
- Only posts from creators user follows
- Same exclusion rules
- Chronological + engagement blend

### 4.3 Trending Feed
- No exclusions (let users see popular stuff again)
- Sort: engagementScore only
- Time window: last 24 hours

### 4.4 Profile Feed
- Only that user's posts
- No exclusions (show everything)
- Chronological

---

## Phase 5: Infinite Scroll / Pagination

### 5.1 Cursor-Based Pagination

```javascript
// First page
query = db.collection('posts')
  .orderBy('score', 'desc')
  .orderBy('createdAt', 'desc')
  .limit(10);

// Next page
query = db.collection('posts')
  .orderBy('score', 'desc')
  .orderBy('createdAt', 'desc')
  .startAfter(lastDoc.score, lastDoc.createdAt)
  .limit(10);
```

### 5.2 The Filtering Problem with Pagination

If we filter client-side, page 2 might return only 2 valid posts after filtering.

**Solution:** Over-fetch + hydrate
- Fetch 20 posts per "page"
- Filter client-side
- If < 10 remain, auto-fetch next batch
- Show loading skeleton while fetching more

---

## Phase 6: Deduplication Across Sessions

### 6.1 Short-Term (Same Session)
- Keep `seenPostIds` in React state
- Don't query again — filter from existing pool

### 6.2 Medium-Term (Last 24 Hours)
- Store `seenPosts` array in `users` doc
- Cleared daily by a scheduled function
- Prevents "I saw this yesterday" fatigue

### 6.3 Long-Term (Liked/Saved)
- Permanent exclusion from main feed
- Still show in Trending (if user wants)
- Show in "Liked Posts" dedicated tab

---

## Implementation Order

| Order | Task | Effort | Impact |
|-------|------|--------|--------|
| 1 | Track liked/saved posts in `users` doc | 30 min | Foundation |
| 2 | Client-side filter from `likedPosts` + `savedPosts` | 1 hr | Immediate UX win |
| 3 | Add `score` field to posts + update on interaction | 1 hr | Better ranking |
| 4 | Implement cursor pagination with over-fetch | 2 hrs | Smooth scroll |
| 5 | Cloud Function precomputed feed (Solution B) | 3 hrs | Scale |
| 6 | Tag/creator affinity scoring | 2 hrs | Personalization |

---

## What Big Platforms Actually Do

**Twitter/X:**
- Heavy ML ranking ( embedding models, user embedding + tweet embedding similarity)
- "For You" = algorithmic, "Following" = chronological
- Tracks every impression, dwell time, engagement
- Re-ranks in real-time based on session behavior

**TikTok:**
- Completely algorithmic, no follows required
- Tracks watch time (dwell) more than likes
- A/B tests content continuously

**Instagram:**
- Mix of followed + suggested content
- Reels heavily weighted toward engagement
- Stories chronological, feed algorithmic

**Our Practical Approach:**
We can't afford ML infrastructure yet. So:
1. Start with time-decay + engagement scoring (no ML)
2. Track basic interactions (like, save, view)
3. Use Firestore's strengths (fast document reads)
4. Add ML-based ranking only when you have 10k+ DAU

---

## Key Data Model Additions

```json
// posts/{postId}
{
  "score": 0.85,
  "engagementScore": 0.72,
  "likeWeightScore": 142,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}

// users/{userId}
{
  "likedPosts": ["p1", "p2"],
  "savedPosts": ["p3"],
  "seenPosts": ["p1", "p2", "p3", "p4"],
  "dismissedPosts": ["p5"],
  "tagAffinity": {
    "cinematic": 0.8,
    "runway": 0.3
  }
}

// userFeeds/{userId} (precomputed)
{
  "feed": ["p9", "p11", "p7", "p15"],
  "lastUpdated": "timestamp"
}
```

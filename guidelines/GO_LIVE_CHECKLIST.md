# Cuerate Go-Live Checklist

## 1) Environment And Secrets
- Verify `VITE_FIREBASE_*` values are set in production deployment.
- Verify `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_BUCKET` are set.
- Confirm no real secrets are committed in repo (`.env` should stay local-only).
- Confirm Supabase project and Firebase project match the production environment.

## 2) Firestore Rules Deployment
- Review and deploy Firestore rules:
  - `users` collection remains public profile only.
  - `usersPrivate` is owner-only.
  - `emailLookup` read is disabled.
  - prompt/workflow counter updates are anti-tamper constrained.
  - notification writes are validated and constrained.
- Deploy:
  - `npm run firebase:deploy-rules`

## 3) Supabase Storage Policies
- Ensure upload `INSERT` policy exists for bucket `cuerate-media` with least privilege path restrictions:
  - `prompts/<uid>/...`
  - `avatars/<uid>/...`
- Remove broad `SELECT` list policies on `storage.objects`.
- Confirm delete policy allows deleting owned/allowed objects your app needs to remove.

## 4) Build And Type Safety
- Run:
  - `npx tsc --noEmit`
  - `npm run build`
- Confirm no blocking errors.
- Track bundle size warning and plan chunk splitting post-launch.

## 5) Auth Flow Verification
- Test email-link sign up end-to-end.
- Test email-link login end-to-end.
- Test Google sign-in end-to-end.
- Confirm signed-out users are blocked from app screens and redirected to `/auth`.

## 6) Posting Verification
- Prompt post:
  - image post with `NanoBanana` only
  - video post with non-`NanoBanana` models
- Workflow post:
  - all generation modes including `ingredients`
  - ingredients supports 1-5 images
  - ingredients allows image/video output
  - saved workflow step data persists to profile and detail pages

## 7) Deletion And Cleanup Verification
- Delete prompt and confirm associated media files are deleted from Supabase.
- Delete workflow and confirm:
  - cover media deleted
  - step media deleted
  - `ingredientsImageUrls` media deleted

## 8) Security Regression Checks
- Confirm user public profile reads do not expose email/private auth metadata.
- Confirm signed-in users cannot freely edit like/save/copy counters.
- Confirm notifications cannot be spoofed with arbitrary `fromHandle/fromAvatar`.

## 9) Core UX Smoke Test
- Feed, Explore, Prompt detail, Workflow detail, Profile, User profile, Settings.
- Save/unsave, like/unlike, follow/unfollow, copy prompt, fork prompt.
- Mobile and desktop nav checks.

## 10) Rollback Plan
- Keep a tagged pre-launch commit.
- Keep prior Firestore rules snapshot.
- If issues occur:
  - rollback app deploy
  - rollback Firestore rules
  - re-run smoke tests.

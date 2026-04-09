
  # cuerate

  This is a code bundle for cuerate. The original project is available at https://www.figma.com/design/ZKcHrhvpcXDJFv9Qv1tJ1R/cuerate.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Firebase Setup

  Copy `.env.example` to `.env` and fill in your Firebase web app values.
  Also set Supabase vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_BUCKET`) because media uploads use Supabase Storage buckets.

  The app now reads through `src/lib/backend.ts`, which uses Firebase when env vars are present and falls back to local stubs/mock data when they are not.

  Firebase config scaffolding is included in `firebase.json`, `firestore.rules`, `firestore.indexes.json`, and `storage.rules`.

  Authentication is wired through the `/auth` route and the shared auth provider in `src/lib/auth-context.tsx`.

  ## Firebase Commands

  These scripts are shortcuts so you do not have to remember the full Firebase commands.

  `npm run firebase:login`
  Signs your computer into Firebase.

  `npm run firebase:use`
  Tells Firebase to use the `cuerate-e31b5` project for this repo.

  `npm run firebase:deploy-rules`
  Uploads your Firestore and Storage rules to Firebase.

  `npm run firebase:emulators`
  Starts a local fake Firebase on your machine so you can test safely without touching production.

  In plain English:
  The app is already wired to talk to Firebase. These commands just help you turn the connection on, point it at the right project, and test or publish the rules safely.
  

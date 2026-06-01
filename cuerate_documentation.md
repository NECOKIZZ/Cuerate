# Cuerate Application Documentation

> [!NOTE]
> This document provides a comprehensive overview of the Cuerate application, its architecture, data models, and features.

## 1. Executive Summary
**Cuerate** is a mobile-first social media platform designed for AI video creators. It allows users to share, discover, and remix AI-generated video prompts. The application mimics the experience of popular social networks like Instagram or TikTok but is tailored specifically for generative AI content, offering features like prompt copying, forking (remixing), and model-specific metadata filtering.

## 2. Tech Stack & Architecture

### Core Technologies
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **Styling**: Tailwind CSS v4, Custom CSS Variables, Radix UI Primitives, Lucide React icons
- **Backend Infrastructure**: Firebase (Firestore, Authentication, Storage), Supabase (optional storage integration)
- **State Management**: React Context, custom hooks (`useBackendQuery.ts`), and local state.

### Backend Strategy
The application employs a hybrid backend strategy:
- **Firebase Mode**: When configured with valid Firebase credentials in `.env`, the app connects to Firestore for data persistence, Firebase Auth for user management, and Firebase Storage for media.
- **Mock Mode (Fallback)**: When Firebase is disabled or unconfigured, the app seamlessly falls back to using local storage and in-memory mock data (`src/lib/mockData.ts`). This allows for immediate local development and UI testing without backend setup.

## 3. Data Models

The core entities are defined in `src/lib/types.ts`.

### User
Represents a platform user.
- **Key Fields**: `uid`, `handle`, `displayName`, `avatarUrl`, `bio`, `links`, `primaryModels`.
- **Metrics**: `followers`, `following`, `totalCopies`, `totalPrompts`.

### Prompt
Represents an individual AI generation shared on the feed.
- **Content Fields**: `promptText`, `model` (e.g., Sora, Runway, Kling), `contentType` (image/video), `aspectRatio`, `styleTags`, `moodLabel`.
- **Media**: `videoUrl`, `thumbnailUrl`.
- **Social & Remix Fields**: `likes`, `saves`, `copies`, `forks`, `isForked`, `forkedFromId`.

### Workflow
Represents a multi-step generation process, acting as a tutorial or complex prompt chain.
- **Fields**: `title`, `tool`, `description`, `coverVideoUrl`, `steps` (Array of `WorkflowStep`).
- **Steps**: Each step details the `generationType` (e.g., `prompt_to_video`, `image_to_video`), `promptText`, `inputImageUrl`, and the result media.

### Auxiliary Models
- **Notification**: Tracks events like `follow`, `like`, `copy`, `fork`, `chain_fork`.
- **Collection**: Allows users to group saved prompts.
- **AuthLog**: Tracks authentication events for analytics/security.

## 4. User Interface & Routing

The application is structured around a central `Layout` component that provides a bottom navigation bar for mobile-first interaction.

### Core Routes (`src/app/routes.tsx`)
- `/` (`Feed.tsx`): The main timeline showing prompts from followed users or trending content.
- `/post` (`Post.tsx`): Interface for creating new prompts or workflows. Includes UI for AI Auto-fill assistance.
- `/explore` (`Explore.tsx`): Discovery page for trending tags, models, and top creators.
- `/profile` (`MyProfile.tsx`): The current user's profile, showing their creations, saves, and collections.
- `/user/:handle` (`UserProfile.tsx`): Public profile view for other creators.
- `/notifications` (`Notifications.tsx`): Activity feed for likes, follows, and remixes.
- `/prompt/:promptId` (`PromptDetail.tsx`): Dedicated view for a single prompt, showing full metadata and copy actions.
- `/workflow/:workflowId` (`WorkflowDetail.tsx`): Dedicated view for a multi-step workflow.

### Auth & Onboarding
- `/auth` (`Auth.tsx`): Handles sign-in/sign-up (Email link, Google OAuth, or Mock login).
- `/onboarding` (`Onboarding.tsx`): A multi-step flow capturing a new user's handle, bio, and preferred AI models.

## 5. Key Features & Workflows

### 5.1 The Forking System
Cuerate treats prompts like open-source code.
- **Copy**: Users can one-tap copy a prompt's text to their clipboard. This increments the original creator's "copies" metric.
- **Fork**: Users can create a new prompt based on an existing one. The new prompt retains a `forkedFromId` and `forkedFromAuthorHandle`, creating an attribution chain back to the original creator.

### 5.2 Collections & Saves
Users can save prompts to their private profile and organize them into curated `Collections` (e.g., "Cinematic Lighting", "Character Design").

### 5.3 Filtering & Discovery
The feed and explore pages heavily utilize metadata filtering. Users can filter content by the AI `model` used (Sora, Runway, Pika, etc.) or by `styleTags` (cinematic, surreal, neon, etc.).

## 6. Design System & Theming

> [!TIP]
> The app is strictly designed with a mobile-first, "glassmorphism" aesthetic optimized for a 430px viewport on desktop.

- **Variables**: Driven by CSS variables in `styles/cuerate-theme.css`.
- **Colors**: Dark mode by default (`#000000` background). Accent colors include Action Blue (`#1877F2`) and Identity Indigo (`#6F00FF`).
- **Shapes**: Extensive use of pill-shaped buttons (999px border-radius) and heavily rounded corners on cards. No sharp edges.
- **Effects**: Backdrop blurs (`rgba(255,255,255,0.035)`) and ambient indigo glows create a premium, immersive feel.
- **Typography**: Primary UI uses `Bricolage Grotesque`, while technical data (like prompt text) uses `Inter`.

## 7. Security Rules (Firebase)
Firestore rules ensure data integrity:
- **Public Read**: Prompts, User Profiles, Copies, Follows.
- **Authenticated Write**: Users can only edit/delete their own prompts and profile data. Notifications are strictly locked to the recipient user ID. Storage rules restrict uploads to the user's specific directory path.

## 8. Future Roadmap
As documented in the project's foundational README, planned enhancements include:
- Native share functionality
- Direct API integration with models (Sora, Runway) for "Try on" features
- Trending analytics with 24hr decay
- Creator tipping via crypto wallet integration
- Decentralized storage options

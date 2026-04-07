# Cuerate - AI Video Prompt Social Platform

Cuerate is a mobile-first social media platform for AI video creators to share, discover, and remix AI video prompts. Think Instagram × GitHub for AI video generation.

## Features

### 8 Core Screens

1. **Feed** - Browse prompts from creators you follow with model/style filters
2. **Post** - Create new prompts with AI auto-fill assistance
3. **Explore** - Discover trending tags, top creators, and popular prompts
4. **Saves** - Organize saved prompts into collections
5. **My Profile** - View and edit your profile, stats, and content
6. **User Profile** - Browse other creators' profiles and content
7. **Notifications** - Stay updated on likes, copies, forks, and follows
8. **Onboarding** - 3-step onboarding flow for new users

### Key Features

- **Prompt Cards** with video thumbnails, metadata, and social actions
- **Copy System** - One-tap prompt copying with analytics
- **Fork System** - Remix and attribute prompts to original creators
- **Filter System** - Filter by AI model (Sora, Runway, Kling, Pika, Hailuo) or style tags
- **Collections** - Organize saved prompts into custom collections
- **AI Auto-Fill** - Automatically generate metadata from prompt text (ready for Claude API integration)
- **Social Features** - Follow creators, like, save, and fork prompts

## Design System

### Colors
- **Blue** (#1877F2) - Action color (play buttons, likes, logo accent)
- **Indigo** (#6F00FF) - Identity color (selections, active states, glows)
- **Background** - Pure black (#000000)
- **Glass Surface** - rgba(255,255,255,0.035) with backdrop blur

### Typography
- **Primary UI** - Bricolage Grotesque (400, 500, 600, 700)
- **Accent/Technical** - Inter (400, 500, 600)

### Border Radius
- Everything uses rounded corners - no sharp edges
- Pill shape (999px) for all buttons, chips, and badges

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Routing**: React Router v7
- **Styling**: Tailwind CSS v4 + Custom CSS Variables
- **Icons**: Lucide React
- **Backend** (To be configured): Firebase
  - Firestore for data
  - Firebase Auth for authentication
  - Firebase Storage for videos/images

## Setup Instructions

### 1. Install Dependencies

Dependencies are already installed. The project includes:
- React Router for navigation
- Lucide React for icons
- Date-fns for date formatting
- Firebase SDK (to be configured)

### 2. Configure Firebase

To enable full functionality, you need to set up Firebase:

1. Create a Firebase project at https://firebase.google.com
2. Enable Firestore Database
3. Enable Authentication (Email/Password and Google OAuth)
4. Enable Storage
5. Get your Firebase configuration from Project Settings
6. Update `/src/lib/firebase.ts` with your Firebase config:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Firebase Security Rules

Set up Firestore security rules to allow authenticated users to read/write their data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /prompts/{promptId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.authorUid;
    }
    
    match /follows/{followId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    match /likes/{likeId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    match /saves/{saveId} {
      allow read, write: if request.auth != null;
    }
    
    match /copies/{copyId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    match /notifications/{notificationId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow write: if request.auth != null;
    }
  }
}
```

Set up Storage rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /videos/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /thumbnails/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /avatars/{userId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. AI Auto-Fill (Optional)

The app includes a placeholder for AI auto-fill functionality. To enable it, you'll need to:

1. Set up a serverless function or API endpoint
2. Integrate with Claude API (claude-sonnet-4-20250514)
3. Update the `handleAutoFill` function in `/src/app/screens/Post.tsx`

Example API call structure:
```typescript
const response = await fetch('/api/autofill', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ promptText, thumbnailBase64 })
});
const data = await response.json();
// Returns: { styleTags, cameraNotes, moodLabel, difficulty, suggestedModel }
```

## Mock Data

The app currently uses mock data from `/src/lib/mockData.ts` for development and demonstration. This includes:
- Sample users
- Sample prompts with images from Unsplash
- Sample notifications

To transition to real data:
1. Configure Firebase as described above
2. Replace mock data calls with Firebase queries
3. Implement authentication flow
4. Add video upload functionality to Firebase Storage

## Project Structure

```
/src
  /app
    /components
      - Layout.tsx (Main layout with bottom nav)
      - PromptCard.tsx (Reusable prompt card component)
    /screens
      - Feed.tsx
      - Post.tsx
      - Explore.tsx
      - Saves.tsx
      - MyProfile.tsx
      - UserProfile.tsx
      - Notifications.tsx
      - Onboarding.tsx
    - App.tsx (Main app component)
    - routes.tsx (React Router configuration)
  /lib
    - firebase.ts (Firebase configuration)
    - mockData.ts (Mock data for development)
  /styles
    - fonts.css (Google Fonts imports)
    - cuerate-theme.css (Custom theme variables)
    - index.css (Main CSS file)
    - tailwind.css (Tailwind imports)
    - theme.css (Base theme)
```

## Future Features

The following features are planned for future implementation:

- Prompt rating system (1-5 stars)
- Native share functionality
- Version history with diff view
- Direct API integration with Sora, Runway, Kling ("Try on" feature)
- Trending page with 24hr analytics
- Following vs Discovery feed toggle
- Curated prompt collections/theme packs
- Prompt difficulty filters
- Prompt series grouping
- Fork attribution chain visualization
- Prompt quality scorer/linter
- AI-generated captions
- Multimodal video frame analysis
- Creator tipping (crypto wallet integration)
- Decentralized storage options
- Prompt marketplace

## Development Notes

- The app is mobile-first and fully responsive
- Uses CSS custom properties for theming
- All interactive elements use pill-shaped rounded corners
- Glass morphism effects throughout the UI
- Ambient indigo glow on all screens
- Optimized for 430px mobile viewport on desktop

## Contributing

This is a demonstration project based on the Cuerate founding prompt. To contribute or extend:

1. Set up Firebase configuration
2. Implement real authentication
3. Add video upload functionality
4. Integrate AI auto-fill API
5. Add analytics and metrics tracking

---

Built with React, Tailwind CSS, and Firebase

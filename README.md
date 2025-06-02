# ReelWorthy: AI-Powered YouTube Playlist Explorer

ReelWorthy helps you manage and explore your YouTube playlists, particularly your "Watch Later" list. It features a React frontend, a backend built with Google Cloud Functions and a Cloud Run service, and an AI-powered chat interface (using Google's Gemini model) for intelligent video suggestions based on your playlist content.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
  - [Authentication Flow](#authentication-flow)
  - [Playlist Synchronization](#playlist-synchronization)
  - [AI Chat](#ai-chat)
- [Datastore Data Model](#datastore-data-model)
- [Setup and Local Development](#setup-and-local-development)
  - [Prerequisites](#prerequisites)
  - [Google Cloud Project Setup](#google-cloud-project-setup)
  - [Firebase Project Setup](#firebase-project-setup)
  - [Secrets Configuration](#secrets-configuration)
  - [Frontend Setup](#frontend-setup)
  - [Backend Configuration Notes](#backend-configuration-notes)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)

## Features

*   **Firebase Authentication:** Secure user login via Google.
*   **YouTube Integration:** Connect your YouTube account using OAuth 2.0.
*   **Playlist Listing:** View your YouTube playlists.
*   **Playlist Video Fetching & Sync:** Fetch videos from a selected playlist and synchronize detailed video information (title, description, duration, stats, topics) with Google Cloud Datastore.
*   **AI-Powered Chat:** Interact with a Gemini-based AI to get video suggestions from your selected playlist based on natural language queries.
*   **Modular Frontend:** React frontend refactored into custom hooks for auth, YouTube interactions, and WebSocket chat.

## Tech Stack

*   **Frontend:** React, JavaScript, Custom Hooks, CSS
*   **Backend:**
    *   Google Cloud Functions (Node.js) for RESTful API endpoints.
    *   Google Cloud Run (Node.js, Docker) for WebSocket-based AI chat service.
*   **Database:** Google Cloud Datastore (NoSQL) for storing YouTube tokens and video metadata.
*   **Authentication:** Firebase Authentication (Google Sign-In).
*   **AI Model:** Google Gemini (via Generative Language API for chat).
*   **Deployment:**
    *   Frontend: Firebase Hosting.
    *   Backend Services: Google Cloud Functions, Google Cloud Run.
*   **Other Google Cloud Services:** Secret Manager.

## Project Structure

```
YTWatchLaterAI/
├── backend/
│   ├── checkUserAuthorization/ # Cloud Function: Checks user email against allow-list
│   │   ├── index.js
│   │   └── package.json
│   ├── getWatchLaterPlaylist/  # Cloud Function: Fetches/syncs playlist videos
│   │   ├── index.js
│   │   └── package.json
│   ├── handleYouTubeAuth/      # Cloud Function: Handles YouTube OAuth callback
│   │   ├── index.js
│   │   └── package.json
│   ├── listUserPlaylists/      # Cloud Function: Lists user's YouTube playlists
│   │   ├── index.js
│   │   └── package.json
├── gemini-chat-service/        # Cloud Run service: WebSocket AI chat
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.js              # Main React component
│   │   ├── firebase.js         # Firebase configuration
│   │   ├── hooks/              # Custom React hooks
│   │   │   ├── useAuth.js
│   │   │   ├── useYouTube.js
│   │   │   └── useWebSocketChat.js
│   │   ├── index.js
│   │   └── ... (other components, css)
│   ├── .env.example          # Example for frontend environment variables
│   ├── firebase.json         # Firebase hosting config
│   ├── package.json
│   └── README.md             # (Potentially outdated, refer to this main README)
├── DEPLOYMENT_INSTRUCTIONS.md  # Detailed deployment steps
├── index.yaml                  # Datastore index configuration
└── README.md                   # This file
```

## Core Concepts

### Authentication Flow
1.  User logs into the React frontend using Firebase Authentication (Google Sign-In).
2.  Frontend calls `checkUserAuthorization` Cloud Function to verify if the user's email is on an allow-list and if their YouTube account is already linked.
3.  If YouTube is not linked, user clicks "Connect YouTube Account".
4.  Frontend redirects to Google OAuth consent screen.
5.  User authorizes access. Google redirects to `handleYouTubeAuth` Cloud Function with an authorization code.
6.  `handleYouTubeAuth` exchanges the code for tokens, stores them in Datastore (keyed by Firebase UID), and redirects back to the frontend.
7.  Frontend (via `useYouTube` hook) detects the successful auth status from URL parameters and fetches user playlists.

### Playlist Synchronization
The `getWatchLaterPlaylist` Cloud Function is responsible for:
1.  Fetching all video items for a given `playlistId` from the YouTube Data API.
2.  Retrieving full video details (snippet, contentDetails, statistics, topicDetails) for each video.
3.  Storing/updating this information in the `Videos` kind in Datastore.
4.  Managing an `associatedPlaylistIds` array on each video entity to track which playlists a video belongs to. This allows for efficient querying and cleanup if a video is removed from all playlists.

### AI Chat
The `gemini-chat-service` (Cloud Run) provides a WebSocket endpoint:
1.  Frontend (via `useWebSocketChat` hook) connects to this service when a playlist is selected and its data is deemed ready.
2.  An `INIT_CHAT` message is sent with the `playlistId`.
3.  The service fetches video metadata for that playlist from Datastore to create a context for Gemini.
4.  User sends queries (`USER_QUERY`). The service forwards these to Gemini along with the context.
5.  Gemini's response (expected to be JSON with suggested video IDs and reasons) is streamed back to the frontend.

## Datastore Data Model

*   **Kind: `Tokens`**
    *   Key: Firebase User ID (UID) (String).
    *   Properties (from `google-auth-library` token object):
        *   `access_token` (String, excluded from indexes)
        *   `refresh_token` (String, excluded from indexes)
        *   `scope` (String)
        *   `token_type` (String)
        *   `expiry_date` (Integer/Timestamp)

*   **Kind: `Videos`**
    *   Key: YouTube `videoId` (String).
    *   Properties:
        *   `videoId` (String)
        *   `title` (String)
        *   `description` (String, excluded from indexes)
        *   `publishedAt` (Timestamp/String) - Video publication date by channel.
        *   `addedToPlaylistAt` (Timestamp/String) - When the video was added to the specific playlist by the user.
        *   `thumbnailUrl` (String, excluded from indexes)
        *   `channelId` (String)
        *   `channelTitle` (String)
        *   `durationSeconds` (Number) - Video duration in seconds.
        *   `viewCount` (Number|null)
        *   `likeCount` (Number|null)
        *   `topicCategories` (Array of Strings) - From YouTube's topicDetails.
        *   `associatedPlaylistIds` (Array of Strings, indexed) - List of playlist IDs this video belongs to.

*   **Kind: `AuthorizedEmail`**
    *   Key: User's email address (String).
    *   (No specific properties needed, existence of the key implies authorization).

## Setup and Local Development

### Prerequisites
*   Node.js (v18+ recommended for backend, v20 for Cloud Functions runtime) and npm.
*   Google Cloud SDK (`gcloud` CLI) installed and authenticated.
*   Firebase CLI installed (`npm install -g firebase-tools`) and authenticated.
*   Docker (if building/running `gemini-chat-service` locally).

### Google Cloud Project Setup
1.  Create or select a Google Cloud Project.
2.  **Enable APIs:**
    *   YouTube Data API v3
    *   Identity Platform API (for Firebase Auth)
    *   Secret Manager API
    *   Cloud Datastore API
    *   Cloud Functions API
    *   Cloud Run API
    *   Cloud Build API (if using Cloud Build for deployments)
    *   Generative Language API (used by `gemini-chat-service`).
3.  **OAuth Consent Screen:** Configure OAuth consent screen (User Type: External, Publishing status: Testing initially, add your test user emails).
4.  **OAuth Client ID:** Create an OAuth 2.0 Client ID (Application type: Web application).
    *   Note the Client ID and Client Secret.
    *   Add Authorized JavaScript origins (e.g., `http://localhost:3000`, your Firebase Hosting URL).
    *   Add Authorized redirect URIs: This will be the URL of your deployed `handleYouTubeAuth` Cloud Function. You'll get this after its first deployment.

### Firebase Project Setup
1.  Create a Firebase project (can be linked to your existing Google Cloud Project).
2.  **Authentication:** Enable the Google Sign-in provider.
3.  **Hosting:** Set up Firebase Hosting. Note your Firebase Hosting URL (e.g., `https://your-project-id.web.app`).
4.  **Web App Registration:** Register a web app in your Firebase project settings. Note the Firebase configuration object.

### Secrets Configuration
In Google Cloud Secret Manager, create the following secrets and grant appropriate service accounts the "Secret Manager Secret Accessor" role:
*   `YOUTUBE_CLIENT_ID`: Your Google OAuth 2.0 Client ID.
*   `YOUTUBE_CLIENT_SECRET`: Your Google OAuth 2.0 Client Secret.
*   `GEMINI_API_KEY`: Your API key for the Gemini API (used by `gemini-chat-service`).

### Frontend Setup
1.  Navigate to the `frontend/` directory.
2.  Create a `.env` file by copying `.env.example` (if it exists) or create it manually.
3.  Add your Firebase configuration and YouTube Client ID to `.env`:
    ```env
    REACT_APP_FIREBASE_API_KEY="your-firebase-api-key"
    REACT_APP_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
    REACT_APP_FIREBASE_PROJECT_ID="your-project-id"
    REACT_APP_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
    REACT_APP_FIREBASE_APP_ID="your-app-id"

    REACT_APP_YOUTUBE_CLIENT_ID="your-youtube-oauth-client-id"
    ```
    *(Note: The `firebase.js` currently has these hardcoded. It's highly recommended to move them to environment variables as shown above for security and flexibility.)*
4.  Install dependencies: `npm install`
5.  Start the development server: `npm start` (usually runs on `http://localhost:3000`).

### Backend Configuration Notes
*   **Cloud Function URLs & WebSocket URL:** The frontend hooks (`useAuth.js`, `useYouTube.js`, `useWebSocketChat.js`) currently have hardcoded URLs for backend services. For production/flexibility, these should be managed via environment variables or a configuration file loaded at runtime.
    *   `CLOUD_FUNCTIONS_BASE_URL.checkUserAuthorization` in `useAuth.js`.
    *   `CLOUD_FUNCTIONS_BASE_URL` (for `getWatchLaterPlaylist`, `listUserPlaylists`, `handleYouTubeAuth`) in `useYouTube.js`.
    *   `WEBSOCKET_SERVICE_URL` in `useWebSocketChat.js`.
*   **CORS:** Cloud Functions use `res.set('Access-Control-Allow-Origin', '*')` which is permissive; restrict this in production to your Firebase Hosting URL.
*   **Allow-List**: The `checkUserAuthorization` function uses a Datastore Kind `AuthorizedEmail` for an allow-list. You'll need to populate this manually in Datastore with emails of authorized users.

## Deployment
For detailed step-by-step commands and configurations for deploying each service (Cloud Functions, Cloud Run, Frontend to Firebase Hosting), please refer to **`DEPLOYMENT_INSTRUCTIONS.md`**.

## Environment Variables
A summary of key environment variables needed by different parts of the application:

*   **Frontend (`.env` file):**
    *   `REACT_APP_FIREBASE_API_KEY`
    *   `REACT_APP_FIREBASE_AUTH_DOMAIN`
    *   `REACT_APP_FIREBASE_PROJECT_ID`
    *   `REACT_APP_FIREBASE_STORAGE_BUCKET`
    *   `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
    *   `REACT_APP_FIREBASE_APP_ID`
    *   `REACT_APP_YOUTUBE_CLIENT_ID`
    *   (Ideally) `REACT_APP_CHECK_AUTH_URL`, `REACT_APP_LIST_PLAYLISTS_URL`, etc. for backend endpoints.
    *   (Ideally) `REACT_APP_WEBSOCKET_URL`.

*   **Cloud Functions (set during deployment or via Secret Manager):**
    *   `YOUTUBE_CLIENT_ID` (via Secret)
    *   `YOUTUBE_CLIENT_SECRET` (via Secret)
    *   `GOOGLE_CLOUD_PROJECT` (usually available automatically, but used in constructing redirect URIs)
    *   `FRONTEND_URL` (optional, for `handleYouTubeAuth` fallback redirect - should be updated from default).

*   **`gemini-chat-service` (Cloud Run - set as environment variables, can reference secrets):**
    *   `PORT` (defaults to 8080)
    *   `GEMINI_API_KEY` (from Secret Manager)
    *   `GOOGLE_CLOUD_PROJECT` (if needed by Datastore client, usually inferred)

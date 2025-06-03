# ReelWorthy: AI-Powered YouTube Playlist Explorer

ReelWorthy is a web application designed to help users manage, explore, and gain intelligent insights from their YouTube playlists, with a particular emphasis on the often-overlooked "Watch Later" list. It allows users to connect their YouTube account, view their playlists, and then leverage a sophisticated AI chat interface (powered by Google's Gemini model) to receive video suggestions and engage in contextual conversations about the content of a selected playlist.

The application aims to solve the problem of unwieldy playlists by providing a smart, interactive way to rediscover and engage with saved video content.

## Table of Contents

- [Key User Journeys & Flows](#key-user-journeys--flows)
  - [1. New User Onboarding & YouTube Account Connection](#1-new-user-onboarding--youtube-account-connection)
  - [2. Viewing Playlists & Selecting a Playlist for Chat](#2-viewing-playlists--selecting-a-playlist-for-chat)
  - [3. AI Chat Interaction for Video Suggestions](#3-ai-chat-interaction-for-video-suggestions)
  - [4. Playlist Data Synchronization (Background/On-Demand)](#4-playlist-data-synchronization-backgroundon-demand)
- [Technical Architecture Overview](#technical-architecture-overview)
- [Detailed Code Roadmap & Component Breakdown](#detailed-code-roadmap--component-breakdown)
  - [Frontend (`frontend/src/`)](#frontend-frontendsrc)
  - [Backend - Google Cloud Functions (`backend/`)](#backend---google-cloud-functions-backend)
  - [Backend - AI Chat Service (`gemini-chat-service/`)](#backend---ai-chat-service-gemini-chat-service)
- [Datastore Data Model](#datastore-data-model)
- [Setup and Local Development](#setup-and-local-development)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)

## Key User Journeys & Flows

Understanding these core user interactions provides insight into the application's structure and purpose.

### 1. New User Onboarding & YouTube Account Connection
   a.  **Login:** The user arrives at the application and is prompted to log in. They use Google Sign-In, handled by Firebase Authentication.
   b.  **Authorization Check:** Upon successful Firebase login, the frontend calls the `checkUserAuthorization` Cloud Function. This function verifies if the user's email is on a pre-approved allow-list (stored in Datastore) and also checks if their YouTube account has been previously linked by looking for existing OAuth tokens in Datastore.
   c.  **YouTube Connection Prompt:** If the user is authorized for the app but their YouTube account isn't linked (or tokens are invalid/missing), the UI prompts them to connect their YouTube account.
   d.  **OAuth Flow:**
       i.  Clicking "Connect YouTube Account" initiates the OAuth 2.0 flow. The frontend (`useYouTube` hook) redirects the user to Google's OAuth consent screen, requesting `youtube.readonly` scope. A CSRF nonce is generated and stored in `localStorage`, and the desired final frontend redirect URI is included in the `state` parameter.
       ii. The user grants permission.
       iii. Google redirects to the `handleYouTubeAuth` Cloud Function (the pre-configured OAuth redirect URI). This function receives an authorization `code` and the `state` parameter.
       iv. `handleYouTubeAuth` validates the `finalRedirectUri` from the state, exchanges the `code` for YouTube API access and refresh tokens, and securely stores these tokens in Datastore, keyed by the user's Firebase UID.
       v.  The user is then redirected back to the `finalRedirectUri` on the frontend, with status parameters (`youtube_auth_status`, `error_message`, `state`).
   e.  **Post-Connection:** The frontend (`useYouTube` hook) processes these redirect parameters, validates the nonce, and if successful, marks YouTube as linked and proceeds to fetch the user's playlists.

### 2. Viewing Playlists & Selecting a Playlist for Chat
   a.  **Fetch Playlists:** Once authenticated and YouTube-linked, the `useYouTube` hook calls the `listUserPlaylists` Cloud Function. This function uses the stored OAuth tokens to call the YouTube Data API and retrieve the user's playlists (title, ID, item count, thumbnail).
   b.  **Display Playlists:** The frontend (`PlaylistsScreen` component) displays the fetched playlists.
   c.  **Select Playlist:** The user selects a playlist. This action triggers the `getWatchLaterPlaylist` Cloud Function (note: it can fetch any playlist, not just "Watch Later") to fetch and synchronize detailed video data for that playlist with Datastore.
   d.  **Navigate to Chat:** Upon successful fetching/syncing of playlist items, the user is typically navigated to the chat screen, with the selected playlist's context now available for the AI.

### 3. AI Chat Interaction for Video Suggestions
   a.  **WebSocket Connection:** When the chat screen for a selected playlist is active and its data is ready, the frontend (`useWebSocketChat` hook) establishes a WebSocket connection to the `gemini-chat-service` (Cloud Run).
   b.  **Initialize Chat Context:** An `INIT_CHAT` message is sent over WebSocket, including the `selectedPlaylistId`. The `gemini-chat-service` then fetches all video metadata (titles, descriptions, durations, etc.) for this playlist from Datastore. This data forms the primary context for the Gemini AI.
   c.  **User Query:** The user types a query (e.g., "show me short comedy videos I haven't finished") into the chat interface.
   d.  **Query Processing (Server-side):** The query is sent as a `USER_QUERY` message. The `gemini-chat-service` appends this query to the established Gemini chat session (which already has the playlist video context). It instructs Gemini to recommend videos from the provided list and to respond in a specific JSON format: `{"suggestedVideos": [{"videoId": "...", "reason": "..."}]}`.
   e.  **Streaming Response:**
       i.  Gemini processes the request and starts streaming its response.
       ii. The `gemini-chat-service` forwards these chunks as `STREAM_CHUNK` messages to the frontend. The frontend displays this "thinking" process.
       iii. When the stream ends, the server parses the complete Gemini response, extracts the `suggestedVideos` array, enriches these suggestions with full video details from its in-memory context (fetched during `INIT_CHAT`), and sends a `STREAM_END` message to the frontend with the finalized suggestions.
   f.  **Display Results:** The frontend displays the suggested videos, along with the AI's reasoning for each suggestion.

### 4. Playlist Data Synchronization (Background/On-Demand)
   a.  **Trigger:** Occurs when a user selects a playlist for the first time or manually triggers a refresh. This is handled by the `getWatchLaterPlaylist` Cloud Function.
   b.  **Fetch from YouTube:** The function fetches the current list of video IDs and basic metadata from the specified YouTube playlist.
   c.  **Fetch/Update Video Details:** For each video in the YouTube playlist:
       i.  It checks if a detailed record for the video already exists in Datastore (`Videos` kind).
       ii. If not, or if crucial details like `durationSeconds` are missing, it fetches full video details (snippet, contentDetails, statistics, topicDetails) from the YouTube Data API (`youtube.videos.list`).
       iii. It updates/creates the video entity in Datastore.
   d.  **Manage Associations:** The `associatedPlaylistIds` array on each video entity in Datastore is updated to include the current `playlistId`.
   e.  **Cleanup Stale Data:** If a video previously associated with the current playlist (in Datastore) is no longer found in the YouTube playlist, its association is removed. If it's no longer in *any* playlist, the video entity itself might be deleted from Datastore.
   f.  **Frontend Update:** The function returns the list of videos (with key details) for the frontend to display.

## Technical Architecture Overview

ReelWorthy employs a decoupled architecture with a React frontend and a Google Cloud-based backend.

```
+---------------------+      +-------------------------+      +-----------------------+
|   React Frontend    |----->| Firebase Authentication |----->| Google Sign-In        |
| (Firebase Hosting)  |<-----| (Identity Platform)     |<-----|                       |
+---------------------+      +-------------------------+      +-----------------------+
          | ▲
          | | (ID Token)
          ▼ |
+-----------------------------------------------------------------------------------+
|                                Google Cloud Backend                               |
+---------------------+      +-------------------------+      +-----------------------+
| Cloud Functions     |<---->|   YouTube Data API v3   |<---->| User's YouTube Account|
| - checkUserAuth     |      +-------------------------+      +-----------------------+
| - handleYouTubeAuth |               ▲                                ▲
| - listUserPlaylists |               | (OAuth Tokens)                 | (User Data)
| - getPlaylistItems  |               ▼                                ▼
+---------------------+      +-------------------------+      +-----------------------+
          | ▲                |   Cloud Datastore       |      | Gemini Chat Service   |
          | |                | - Tokens (OAuth)        |<---->| (Cloud Run - WebSocket)|
          | | (REST API)     | - Videos (Metadata)     |      | - Gemini API          |
          ▼ |                | - AuthorizedEmail       |      +-----------------------+
+---------------------+      +-------------------------+               ▲
| User's Browser      |----------------------------------------------->| (WebSocket)
+---------------------+
```

**Component Interactions:**

1.  **Frontend (React on Firebase Hosting):**
    *   Handles all user interface elements and interactions.
    *   Uses Firebase SDK for Google Sign-In.
    *   Communicates with Cloud Functions via HTTPS requests (sending Firebase ID tokens for authentication).
    *   Establishes a WebSocket connection with the `gemini-chat-service` for real-time AI chat.
2.  **Firebase Authentication:**
    *   Manages user sign-up and sign-in using Google as an identity provider.
    *   Issues Firebase ID tokens used by the frontend to authenticate with backend Cloud Functions.
3.  **Google Cloud Functions (Node.js):**
    *   **`checkUserAuthorization`**: Verifies Firebase ID token, checks user email against an allow-list in Datastore, and reports initial YouTube link status.
    *   **`handleYouTubeAuth`**: The OAuth 2.0 redirect URI. Exchanges authorization code for YouTube API tokens and stores them securely in Datastore, keyed by Firebase UID.
    *   **`listUserPlaylists`**: Uses stored OAuth tokens to fetch the user's playlists from the YouTube Data API.
    *   **`getWatchLaterPlaylist`**: Fetches items for a specific playlist, retrieves detailed video metadata from YouTube Data API, and synchronizes this data with Cloud Datastore. Manages video-playlist associations.
4.  **Google Cloud Run (`gemini-chat-service` - Node.js, WebSocket):**
    *   Hosts the WebSocket server for AI chat.
    *   On `INIT_CHAT`, fetches relevant video data from Datastore to build context for the Gemini model.
    *   Forwards user queries and context to the Google Gemini API.
    *   Streams Gemini's "thinking" process and final JSON-formatted video suggestions back to the frontend.
5.  **Google Cloud Datastore (NoSQL Database):**
    *   `Tokens`: Securely stores users' YouTube OAuth access and refresh tokens.
    *   `Videos`: Stores detailed metadata for YouTube videos, including titles, descriptions, durations, statistics, and associations with user playlists.
    *   `AuthorizedEmail`: Acts as an allow-list for application access.
6.  **External APIs:**
    *   **YouTube Data API v3:** Used by Cloud Functions to fetch playlist information and video details.
    *   **Google Gemini API:** Used by the `gemini-chat-service` for generating video recommendations and chat responses.
7.  **Google Secret Manager:** Securely stores API keys and OAuth client secrets needed by backend services.

## Detailed Code Roadmap & Component Breakdown

### Frontend (`frontend/src/`)

The frontend is a React application structured with components and custom hooks for modularity.

*   **`App.js`**:
    *   The root component of the application.
    *   Orchestrates overall application state, including user authentication, current screen, selected playlist, and AI chat data.
    *   Integrates the custom hooks (`useAuth`, `useYouTube`, `useWebSocketChat`) to manage their respective functionalities.
    *   Handles routing/navigation between different screens (Login, Playlists, Chat, Settings).
    *   Renders the main layout, including headers, content screens, and the bottom navigation bar.

*   **`hooks/`**:
    *   **`useAuth.js`**:
        *   Manages Firebase authentication state (login, logout, current user).
        *   Communicates with `checkUserAuthorization` Cloud Function to verify application-level authorization and initial YouTube linkage status.
        *   Provides state like `currentUser`, `isLoggedIn`, `isAuthorizedUser`, `isYouTubeLinkedByAuthCheck`, and handlers like `handleFirebaseLogin`, `handleFirebaseLogout`.
    *   **`useYouTube.js`**:
        *   Manages all interactions related to YouTube data.
        *   Handles the OAuth 2.0 flow for connecting a YouTube account (initiating redirect to `handleYouTubeAuth` Cloud Function and processing the callback).
        *   Fetches user playlists via `listUserPlaylists` Cloud Function.
        *   Fetches and syncs items for a selected playlist via `getWatchLaterPlaylist` Cloud Function.
        *   Manages state like `userPlaylists`, `selectedPlaylistId`, `videos` (items of the selected playlist), `isYouTubeLinked`, `isLoadingYouTube`, and `youtubeSpecificError`.
    *   **`useWebSocketChat.js`**:
        *   Manages the WebSocket connection to the `gemini-chat-service`.
        *   Handles sending `INIT_CHAT` and `USER_QUERY` messages.
        *   Processes incoming messages from the WebSocket (`STREAM_CHUNK`, `STREAM_END`, `ERROR`).
        *   Manages chat-specific state like `suggestedVideos`, `lastQuery`, `thinkingOutput`, `activeOutputTab`, and `isStreaming`.

*   **`components/`**: Contains reusable UI components.
    *   `LoginScreen.js`, `LoginHeader.js`, `LoginContent.js`, `LoginFooter.js`, `LoginButton.js`: Compose the login page UI.
    *   `ConnectYouTubeView.js`: UI for prompting the user to connect their YouTube account.
    *   `UserStatusMessages.js`: Displays messages based on authorization status.
    *   `PlaylistsScreen.js`: Displays the list of user playlists.
    *   `PlaylistItem.js`: Renders a single item in the playlist list.
    *   `ChatScreen.js`: Main container for the chat interface.
    *   `ChatViewContent.js`: Displays the chat input, thinking output, and suggested video results.
    *   `VideoList.js`: Renders a list of videos (either playlist items or suggestions).
    *   `BottomNavigationBar.js`: Provides navigation between main app screens.
    *   `ScreenHeader.js`: A generic header component used by various screens.
    *   `LoadingOverlay.js`, `StatusPopup.js`: Utility components for user feedback.

*   **`firebase.js`**: Initializes the Firebase app instance using configuration (ideally from environment variables). Exports `auth` service.
*   **`index.js`**: The main entry point that renders the `<App />` component into the DOM.
*   **`reportWebVitals.js`**: Utility for measuring web performance metrics.

### Backend - Google Cloud Functions (`backend/`)

Each subdirectory in `backend/` typically contains an `index.js` for a single Cloud Function and a `package.json` for its dependencies.

*   **`checkUserAuthorization/index.js`**:
    *   **Purpose:** Verifies a Firebase ID token, checks if the user's email is in the `AuthorizedEmail` Datastore kind, and checks for existing YouTube tokens in the `Tokens` kind to determine initial YouTube linkage.
    *   **Trigger:** HTTP.
    *   **Input:** Firebase ID token in `Authorization: Bearer` header.
    *   **Output:** JSON `{ authorized: boolean, email: string, uid: string, youtubeLinked: boolean }` or error.

*   **`handleYouTubeAuth/index.js`**:
    *   **Purpose:** Acts as the OAuth 2.0 redirect URI for the YouTube connection flow. Exchanges the received authorization `code` for access and refresh tokens from Google. Stores these tokens securely in the `Tokens` Datastore kind, associated with the user's Firebase UID. Redirects the user back to the frontend.
    *   **Trigger:** HTTP.
    *   **Input:** `code` and `state` (containing Firebase UID, nonce, `finalRedirectUri`) as query parameters from Google OAuth redirect.
    *   **Output:** HTTP Redirect to the frontend application with status parameters.
    *   **Secrets Used:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.

*   **`listUserPlaylists/index.js`**:
    *   **Purpose:** Fetches the authenticated user's YouTube playlists.
    *   **Trigger:** HTTP.
    *   **Input:** Firebase ID token in `Authorization: Bearer` header.
    *   **Output:** JSON `{ playlists: Array<Object> }` where each object contains playlist details (id, title, itemCount, etc.).
    *   **Secrets Used:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` (for OAuth2Client initialization, used for token refresh if needed).

*   **`getWatchLaterPlaylist/index.js`**: (Handles any specified playlist, not just "Watch Later")
    *   **Purpose:** Fetches all video items for a given `playlistId`. Retrieves full video details (duration, stats, topics) from YouTube if not already in Datastore or if details are missing. Synchronizes this data with the `Videos` kind in Datastore, managing `associatedPlaylistIds` to track which playlists a video belongs to. Handles removal of stale associations or video entities.
    *   **Trigger:** HTTP.
    *   **Input:** Firebase ID token in `Authorization: Bearer` header. JSON body: `{ playlistId: string }`.
    *   **Output:** JSON `{ videos: Array<Object> }` containing key details for videos in the playlist.
    *   **Secrets Used:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.

### Backend - AI Chat Service (`gemini-chat-service/`)

This service is a Node.js application designed to be deployed on Cloud Run, providing a WebSocket interface for AI chat.

*   **`server.js`**:
    *   **Purpose:** Main WebSocket server logic.
    *   **WebSocket Setup:** Uses `ws` library to create a WebSocket server.
    *   **Session Management:** Maintains an in-memory `activeSessions` map (WebSocket connection to session data). Each session includes the Gemini chat instance, `playlistId`, `modelId`, and the `videosForPlaylist` data.
    *   **`INIT_CHAT` Message Handling:**
        *   Receives `playlistId` from the client.
        *   Fetches all video metadata for that `playlistId` from the `Videos` kind in Datastore.
        *   Constructs a detailed context string (JSON format) of these videos.
        *   Initializes a new chat session with the Gemini API (`@google/generative-ai`), providing the video context and a system prompt instructing the AI on its role and desired JSON output format (`{suggestedVideos: [{videoId, reason}]}`).
        *   Sends `CHAT_INITIALIZED` back to the client.
    *   **`USER_QUERY` Message Handling:**
        *   Receives user's `query` text.
        *   Sends the query to the established Gemini chat session.
        *   Streams Gemini's response back to the client using `STREAM_CHUNK` messages for the "thinking" process.
        *   On stream completion, parses the full response (expecting JSON), extracts suggested `videoId`s, enriches them with full video details from the session's context, and sends a `STREAM_END` message with the final suggestions.
        *   Includes robust parsing for potentially malformed or multi-part JSON from Gemini.
    *   **Ping/Pong:** Handles `PING` messages from clients to keep connections alive.
    *   **Error Handling:** Sends `ERROR` messages to clients for various issues.
    *   **Dependencies:** `express`, `ws`, `@google/generative-ai`, `@google-cloud/datastore`.
    *   **Secrets Used:** `GEMINI_API_KEY`.

*   **`Dockerfile`**: Defines the Docker image for deploying the service to Cloud Run.
*   **`package.json`**: Manages Node.js dependencies for the service.

## Datastore Data Model

*   **Kind: `Tokens`**
    *   **Key:** Firebase User ID (UID) (String).
    *   **Properties** (derived from Google OAuth2 token response):
        *   `access_token` (String, excluded from indexes)
        *   `refresh_token` (String, excluded from indexes)
        *   `scope` (String)
        *   `token_type` (String)
        *   `expiry_date` (Number/Timestamp) - Milliseconds since epoch.

*   **Kind: `Videos`**
    *   **Key:** YouTube `videoId` (String).
    *   **Properties:**
        *   `videoId` (String) - Same as key, for convenience.
        *   `title` (String)
        *   `description` (String, **excluded from indexes**)
        *   `publishedAt` (String/Timestamp) - Video's original YouTube publication date.
        *   `addedToPlaylistAt` (String/Timestamp) - When the video item was added to the *specific* playlist being synced (from `playlistItems.list` snippet).
        *   `thumbnailUrl` (String, **excluded from indexes**)
        *   `channelId` (String)
        *   `channelTitle` (String)
        *   `durationSeconds` (Number | null) - Video duration in seconds.
        *   `viewCount` (Number | null)
        *   `likeCount` (Number | null)
        *   `topicCategories` (Array of Strings | null) - e.g., "Music", "Gaming". Derived from YouTube's topicDetails.
        *   `associatedPlaylistIds` (Array of Strings, **indexed**) - List of playlist IDs this video is part of for the current user.
        *   `geminiCategories` (Array of Strings, optional) - Placeholder for categories assigned by Gemini.
        *   `lastCategorized` (Timestamp | null) - Placeholder for when Gemini last categorized this video.

*   **Kind: `AuthorizedEmail`**
    *   **Key:** User's email address (String).
    *   *(No specific properties needed; the existence of the key implies authorization).*

## Setup and Local Development

(Refer to `DEPLOYMENT_INSTRUCTIONS.md` for detailed setup steps, as the content below is a summary and might be slightly less detailed than the dedicated deployment document.)

### Prerequisites
*   Node.js (v18+ for backend Cloud Functions, v20 for Cloud Run service if using a newer base image) and npm.
*   Google Cloud SDK (`gcloud` CLI) installed and authenticated.
*   Firebase CLI installed (`npm install -g firebase-tools`) and authenticated.
*   Docker (if building/running `gemini-chat-service` locally or for Cloud Run deployment).

### Google Cloud Project Setup
1.  Create or select a Google Cloud Project.
2.  **Enable APIs:** YouTube Data API v3, Identity Platform API, Secret Manager API, Cloud Datastore API, Cloud Functions API, Cloud Run API, Cloud Build API, Artifact Registry API, Generative Language API.
3.  **OAuth Consent Screen:** Configure with `youtube.readonly` scope. Add test users.
4.  **OAuth Client ID:** Create a "Web application" client ID. Note Client ID & Secret. Configure Authorized JavaScript origins (frontend URLs) and Authorized redirect URIs (for `handleYouTubeAuth` Cloud Function).

### Firebase Project Setup
1.  Link to GCP project.
2.  **Authentication:** Enable Google Sign-in.
3.  **Hosting:** Setup Firebase Hosting.
4.  **Web App Registration:** Get Firebase config for the frontend.

### Secrets Configuration
In Secret Manager, store: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `GEMINI_API_KEY`. Grant accessor roles to service accounts.

### Frontend Setup
1.  In `frontend/`, create `.env` from `.env.example` (if available) or manually.
2.  Add Firebase config and `REACT_APP_YOUTUBE_CLIENT_ID`.
3.  **Strongly Recommended:** Update `firebase.js` and hooks (`useAuth.js`, `useYouTube.js`, `useWebSocketChat.js`) to use environment variables for Firebase config and all backend/WebSocket URLs instead of hardcoded values.
4.  `npm install` & `npm start`.

### Backend Configuration Notes
*   **URLs:** Abstract hardcoded backend URLs in frontend hooks to environment variables.
*   **CORS:** Restrict Cloud Function CORS origins in production.
*   **Allow-List:** Manually populate `AuthorizedEmail` Kind in Datastore.
*   **Service Account Permissions:** Ensure Cloud Function and Cloud Run service accounts have roles for Secret Manager (Secret Accessor) and Datastore (User).

## Deployment
For comprehensive, step-by-step deployment commands and configurations for all services, please refer to **`DEPLOYMENT_INSTRUCTIONS.md`**.

## Environment Variables
(Refer to `DEPLOYMENT_INSTRUCTIONS.md` for a detailed list of environment variables for frontend, Cloud Functions, and Cloud Run.)

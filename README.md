# ReelWorthy: AI-Powered YouTube Playlist Explorer

ReelWorthy is a web application designed to help users manage, explore, and gain intelligent insights from their YouTube playlists, with a particular emphasis on the often-overlooked "Watch Later" list. It allows users to connect their YouTube account, view their playlists, and then leverage a sophisticated AI chat interface (powered by Google's Gemini model) to receive video suggestions and engage in contextual conversations about the content of a selected playlist.

The application aims to solve the problem of unwieldy playlists by providing a smart, interactive way to rediscover and engage with saved video content.

## Table of Contents

- [Key User Journeys & Flows](#key-user-journeys--flows)
  - [1. New User Onboarding & YouTube Account Connection](#1-new-user-onboarding--youtube-account-connection)
  - [2. Viewing Playlists & Selecting a Playlist for Chat](#2-viewing-playlists--selecting-a-playlist-for-chat)
  - [3. AI Chat Interaction for Video Suggestions](#3-ai-chat-interaction-for-video-suggestions)
  - [4. Playlist Data Synchronization (Background/On-Demand)](#4-playlist-data-synchronization-backgroundon-demand)
  - [5. User Subscription Feed Synchronization (Background)](#5-user-subscription-feed-synchronization-background)
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
   - i.  Clicking "Connect YouTube Account" initiates the OAuth 2.0 flow. The frontend (`useYouTube` hook) redirects the user to Google's OAuth consent screen, requesting `youtube.readonly` scope. A CSRF nonce is generated and stored in `localStorage`, and the desired final frontend redirect URI is included in the `state` parameter.  
   - ii. The user grants permission.  
   - iii. Google redirects to the `handleYouTubeAuth` Cloud Function (the pre-configured OAuth redirect URI). This function receives an authorization `code` and the `state` parameter.  
   - iv. `handleYouTubeAuth` validates the `finalRedirectUri` from the state, exchanges the `code` for YouTube API access and refresh tokens, and securely stores these tokens in Datastore, keyed by the user's Firebase UID.  
   - v.  The user is then redirected back to the `finalRedirectUri` on the frontend, with status parameters (`youtube_auth_status`, `error_message`, `state`).  
   
e.  **Post-Connection:** The frontend (`useYouTube` hook) processes these redirect parameters, validates the nonce, and if successful, marks YouTube as linked and proceeds to fetch the user's playlists.  

### 2. Viewing Playlists & Selecting a Playlist for Chat
a.  **Fetch Playlists:** Once authenticated and YouTube-linked, the `useYouTube` hook calls the `listUserPlaylists` Cloud Function. This function uses the stored OAuth tokens to call the YouTube Data API and retrieve the user's playlists (title, ID, item count, thumbnail).  
b.  **Display Playlists:** The frontend (`PlaylistsScreen` component) displays the fetched playlists.  
c.  **Select Playlist:** The user selects a playlist. This action triggers the `getWatchLaterPlaylist` Cloud Function (note: it can fetch any playlist, not just "Watch Later") to fetch and synchronize detailed video data for that playlist with Datastore.  
d.  **Navigate to Chat:** Upon successful fetching/syncing of playlist items, the user is typically navigated to the chat screen, with the selected playlist's context now available for the AI.  

### 3. AI Chat Interaction for Video Suggestions
a.  **WebSocket Connection:** When the chat screen for a selected playlist is active and its data is ready, the frontend (`useWebSocketChat` hook) establishes a WebSocket connection to the `gemini-chat-service` (Cloud Run).  
b.  **Initialize Chat Context:** An `INIT_CHAT` message is sent over WebSocket, including the `selectedPlaylistId`, the user's chosen `selectedModelId` (from the Settings page), the `userId`, and the `includeSubscriptionFeed` preference. The `gemini-chat-service` then fetches all video metadata (titles, descriptions, durations, etc.) for this playlist from Datastore. If `includeSubscriptionFeed` is true, it also fetches cached videos from `UserSubscriptionFeedCache`, combines, and de-duplicates them. This data forms the primary context for the Gemini AI.
c.  **User Query:** The user types a query (e.g., "show me short comedy videos I haven't finished") into the chat interface.  
d.  **Query Processing (Server-side):** The query is sent as a `USER_QUERY` message. The `gemini-chat-service` appends this query to the established Gemini chat session. It instructs Gemini to recommend videos from the provided context and to respond in a specific JSON format: `{"suggestedVideos": [{"videoId": "...", "reason": "..."}]}`.  
e.  **Streaming Response:**  
   - Gemini processes the request and starts streaming its response.  
   - The `gemini-chat-service` forwards these chunks as `STREAM_CHUNK` messages to the frontend. The frontend displays this "thinking" process.  
   - When the stream ends, the server parses the complete Gemini response, extracts the `suggestedVideos` array, enriches these suggestions with full video details from its in-memory context (fetched during `INIT_CHAT`), and sends a `STREAM_END` message to the frontend with the finalized suggestions.  
f.  **Display Results:** The frontend displays the suggested videos, along with the AI's reasoning for each suggestion.  

### 4. Playlist Data Synchronization (Background/On-Demand)
a.  **Trigger:** Occurs when a user selects a playlist for the first time or manually triggers a refresh. This is handled by the `getWatchLaterPlaylist` Cloud Function.  

b.  **Fetch from YouTube:** The function fetches the current list of video IDs and basic metadata from the specified YouTube playlist.  

c.  **Fetch/Update Video Details:** For each video in the YouTube playlist:  
   - It checks if a detailed record for the video already exists in Datastore (`Videos` kind).  
   - If not, or if crucial details like `durationSeconds` are missing, it fetches full video details (snippet, contentDetails, statistics, topicDetails) from the YouTube Data API (`youtube.videos.list`).  
   - It updates/creates the video entity in Datastore.  

d.  **Manage Associations:** The `associatedPlaylistIds` array on each video entity in Datastore is updated to include the current `playlistId`.  

e.  **Cleanup Stale Data:** If a video previously associated with the current playlist (in Datastore) is no longer found in the YouTube playlist, its association is removed. If it's no longer in *any* playlist, the video entity itself might be deleted from Datastore.  

f.  **Frontend Update:** The function returns the list of videos (with key details) for the frontend to display.  

### 5. User Subscription Feed Synchronization (Background)  

a.  **Trigger (Scheduled):** A Cloud Scheduler job ("TriggerSubscriptionFeedUpdates") runs twice daily (e.g., 03:00 and 15:00 UTC). It invokes the `scheduleAllUserFeedUpdates` Cloud Function using an OIDC token for authentication.  
    *   `scheduleAllUserFeedUpdates` queries Datastore for all users with linked YouTube accounts and publishes a message for each user to the `user-feed-update-requests` Pub/Sub topic.  

b.  **Trigger (On-Demand/Initial):**  
    *   When a user successfully links their YouTube account for the first time (handled in `useYouTube.js` after OAuth callback).  
    *   When a logged-in, YouTube-linked user's `checkUserAuthorization` response indicates their subscription feed is not ready (handled in `useAuth.js`).  
    *   In these cases, the frontend calls the `requestSubscriptionFeedUpdate` Cloud Function, which then publishes a message for that specific user to the `user-feed-update-requests` Pub/Sub topic.  

c.  **Processing (`fetchUserSubscriptionFeed` Pub/Sub-triggered Function):**  
      *   i.  Receives a message from `user-feed-update-requests` containing a `userId`.  
      *   ii. Retrieves and refreshes (if necessary) the user's OAuth tokens from Datastore using `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.  
      *   iii. Fetches all of the user's YouTube channel subscriptions (`subscriptions.list`).  
      *   iv. For each subscribed channel:  
            *   Gets the channel's "uploads" playlist ID (`channels.list`).  
            *   Fetches up to 10 most recent video items from that uploads playlist (`playlistItems.list`).  
      *   v.  Aggregates all collected video items.  
      *   vi. Sorts these videos globally by publication date (newest first).  
      *   vii. Selects the top 100 most recent video items.  
      *   viii. Fetches full video details (including `contentDetails` for duration) for these 100 videos using `youtube.videos.list`.  
      *   ix. Filters out YouTube Shorts (e.g., videos with duration <= 61 seconds).  
      *   x. Stores these filtered, non-Short video details (ID, title, description, durationSeconds, etc.) and a `lastUpdated` timestamp in the `UserSubscriptionFeedCache` Datastore kind, keyed by `userId`. The video `description` field is explicitly excluded from Datastore indexes.  

d.  **AI Chat Context Enhancement (User-Controlled):**
    *   The user can toggle a setting on the Settings page ("Include recent videos from my subscriptions in AI suggestions"). This preference is managed in `App.js` state and persisted in `localStorage`.  
    *   Changing this setting triggers a reset of the WebSocket chat session to ensure the new preference is immediately applied.  
    *   When `useWebSocketChat.js` sends the `INIT_CHAT` message to `gemini-chat-service`, it includes the `userId` and this preference flag.  
    *   If the flag is true, `gemini-chat-service` fetches the user's cached subscription videos from `UserSubscriptionFeedCache` (in addition to the selected playlist's videos), combines and de-duplicates them, and uses this richer dataset as context for Gemini.  

## Technical Architecture Overview

ReelWorthy employs a decoupled architecture with a React frontend and a Google Cloud-based backend.

```
+---------------------+      +-------------------------+      +-----------------------+
|   React Frontend    |----->| Firebase Authentication |----->| Google Sign-In        |
| (Firebase Hosting)  |<-----| (Identity Platform)     |<-----|                       |
+---------------------+      +-------------------------+      +-----------------------+
          | ▲                            |
          | | (ID Token)                 | (User Info)
          ▼ |                            ▼
+-------------------------------------------------------------------------------------------------+
|                                      Google Cloud Backend                                       |
+-------------------------+      +-------------------------+      +-------------------------------+
|   Cloud Functions (HTTP)|<---->|   YouTube Data API v3   |<---->| User's YouTube Account        |
|   - checkUserAuth       |      +-------------------------+      +-------------------------------+
|   - handleYouTubeAuth   |               ▲         ▲
|   - listUserPlaylists   |               |         | (OAuth Tokens, User Data)
|   - getPlaylistItems    |               |         ▼
|   - requestSubFeedUpd   |----->+-------------------------+      +-------------------------------+
|   - scheduleAllFeeds    |----->|   Cloud Pub/Sub         |      | Gemini Chat Service           |
+-------------------------+      | - user-feed-update-req  |<---->| (Cloud Run - WebSocket)       |
          | ▲                      +-------------------------+      | - Gemini API                  |
          | | (REST API)                     | ▲                     +-------------------------------+
          | |                                | | (Trigger)                                ▲
          | |                                ▼ |                                         |
+-------------------------+      +-------------------------+      +-------------------------------+
| Cloud Functions (PubSub)|      |   Cloud Datastore       |      | Cloud Scheduler               |
| - fetchUserSubFeed      |<---->| - Tokens (OAuth)        |      | - TrigSubFeedUpdates          |
+-------------------------+      | - Videos (Metadata)     |----->+-------------------------------+
                                 | - AuthorizedEmail       |               |
                                 | - UserSubFeedCache      |               | (Invokes scheduleAllFeeds)
                                 +-------------------------+               ▼
+---------------------+                                                    |
| User's Browser      |--------------------------------------------------->| (WebSocket to Gemini Chat Service)
+---------------------+
```

**Component Interactions:**

1.  **Frontend (React on Firebase Hosting):**
    *   Handles all user interface elements and interactions, including a "Settings" page for AI model selection and toggling subscription feed inclusion.
    *   Uses Firebase SDK for Google Sign-In.
    *   Communicates with Cloud Functions via HTTPS requests (sending Firebase ID tokens for authentication).
    *   Calls `requestSubscriptionFeedUpdate` Cloud Function to trigger on-demand/initial population of the user's subscription video feed.
    *   Establishes a WebSocket connection with the `gemini-chat-service` for real-time AI chat, passing the selected AI model ID, `userId`, and the `includeSubscriptionFeed` preference.
2.  **Firebase Authentication:**
    *   Manages user sign-up and sign-in using Google as an identity provider.
    *   Issues Firebase ID tokens used by the frontend to authenticate with backend Cloud Functions.
3.  **Google Cloud Functions (Node.js):**
    *   **`checkUserAuthorization`**: Verifies Firebase ID token, checks user email against an allow-list in Datastore, reports initial YouTube link status, checks if the user's subscription feed cache (`UserSubscriptionFeedCache`) is ready, and fetches/returns a list of available AI models.
    *   **`handleYouTubeAuth`**: The OAuth 2.0 redirect URI. Exchanges authorization code for YouTube API tokens and stores them securely in Datastore, keyed by Firebase UID.
    *   **`listUserPlaylists`**: Uses stored OAuth tokens to fetch the user's playlists from the YouTube Data API.
    *   **`getWatchLaterPlaylist`**: Fetches items for a specific playlist, retrieves detailed video metadata from YouTube Data API, and synchronizes this data with Cloud Datastore (`Videos` kind). Manages video-playlist associations.
    *   **`requestSubscriptionFeedUpdate` (New - HTTP):** Authenticates the user via Firebase ID token. Publishes a message containing the `userId` to the `user-feed-update-requests` Pub/Sub topic to trigger an asynchronous update of that user's subscription feed.
    *   **`scheduleAllUserFeedUpdates` (New - HTTP, Scheduler Target):** Queries Datastore for all users with linked YouTube accounts (from `Tokens` kind). For each user, publishes a message with their `userId` to the `user-feed-update-requests` Pub/Sub topic.
    *   **`fetchUserSubscriptionFeed` (New - Pub/Sub Triggered):** Triggered by messages on the `user-feed-update-requests` topic. For the given `userId` in the message:
        *   Retrieves and refreshes (if necessary) the user's OAuth tokens using `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
        *   Fetches all YouTube channel subscriptions for the user.
        *   For each subscription, gets the channel's uploads playlist and fetches up to 10 most recent video items (basic details).
        *   Aggregates all collected video items, sorts them by publication date (newest first).
        *   Selects the top 100 most recent video items.
        *   Fetches full video details (including `contentDetails` for duration) for these 100 videos using `youtube.videos.list`.
        *   Filters out YouTube Shorts (e.g., videos <= 61 seconds).
        *   Stores the remaining non-Short video details (including `durationSeconds`) and a `lastUpdated` timestamp in the `UserSubscriptionFeedCache` Datastore kind for that `userId`. The video `description` field is explicitly excluded from Datastore indexes to allow for longer descriptions.
4.  **Google Cloud Pub/Sub (New):**
    *   **`user-feed-update-requests` topic:** A central topic used to queue requests for individual user subscription feed updates. Messages contain `{ "userId": "USER_FIREBASE_UID" }`. This decouples the request for an update from the actual processing.
5.  **Google Cloud Scheduler (New):**
    *   **`TriggerSubscriptionFeedUpdates` job:** A scheduled job (twice daily) that invokes the `scheduleAllUserFeedUpdates` HTTP Cloud Function using an OIDC token for authentication. This initiates the batch process for updating subscription feeds for all relevant users.
6.  **Google Cloud Run (`gemini-chat-service` - Node.js, WebSocket):**
    *   Hosts the WebSocket server for AI chat.
    *   On `INIT_CHAT` message from the client, receives `playlistId`, `modelId`, `userId`, and the `includeSubscriptionFeed` boolean preference.
    *   Fetches video data for the `selectedPlaylistId` from the `Videos` kind in Datastore.
    *   If `includeSubscriptionFeed` is true and `userId` is provided, it also fetches the user's cached recent subscription videos from `UserSubscriptionFeedCache` in Datastore.
    *   Combines and de-duplicates these two sets of videos.
    *   Constructs a detailed context string from this combined video list.
    *   Initializes a new chat session with the Gemini API using the `selectedModelId`, the combined video context, and an updated system prompt that acknowledges the potentially mixed video sources.
    *   Stores the combined video list (`videosForContext`) and `userId` in the active session map.
    *   Forwards user queries to the Gemini API.
    *   Enriches suggested video IDs from Gemini's response with full video details from the session's `videosForContext` before sending to the client.
    *   Streams Gemini's "thinking" process and final JSON-formatted video suggestions back to the frontend.
7.  **Google Cloud Datastore (NoSQL Database):**
    *   `Tokens`: Securely stores users' YouTube OAuth access and refresh tokens.
    *   `Videos`: Stores detailed metadata for YouTube videos, including titles, descriptions, durations, statistics, and associations with user playlists.
    *   `AuthorizedEmail`: Acts as an allow-list for application access.
    *   `UserSubscriptionFeedCache` (New): Stores up to 100 of the most recent non-Short videos from a user's subscriptions, keyed by `userId`. Includes `videos` (array of video detail objects with fields like `videoId`, `title`, `description`, `channelTitle`, `publishedAt`, `thumbnailUrl`, `durationSeconds`) and `lastUpdated` (timestamp). The `videos[].description` path is excluded from Datastore indexes.
8.  **External APIs:**
    *   **YouTube Data API v3:** Used by Cloud Functions to fetch playlist information and video details.
    *   **Google Gemini API:** Used by the `gemini-chat-service` for generating video recommendations and chat responses.
9.  **Google Secret Manager:** Securely stores API keys and OAuth client secrets (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `GEMINI_API_KEY`) needed by backend services.

## Detailed Code Roadmap & Component Breakdown

### Frontend (`frontend/src/`)

The frontend is a React application structured with components and custom hooks for modularity.

*   **`App.js`**:
    *   The root component of the application.
    *   Orchestrates overall application state, including user authentication, current screen, selected playlist, AI chat data, and the `includeSubscriptionFeed` preference.
    *   Manages the `includeSubscriptionFeed` state, initializing it from `localStorage` and passing it and its setter to `SettingsScreen`.
    *   Passes the `includeSubscriptionFeed` state to the `useWebSocketChat` hook.
    *   Integrates the custom hooks (`useAuth`, `useYouTube`, `useWebSocketChat`) to manage their respective functionalities.
    *   Handles routing/navigation between different screens (Login, Playlists, Chat, Settings).
    *   Renders the main layout, including headers, content screens, and the bottom navigation bar.

*   **`hooks/`**:
    *   **`useAuth.js`**:
        *   Manages Firebase authentication state.
        *   Communicates with `checkUserAuthorization` Cloud Function to verify app authorization, initial YouTube linkage, subscription feed readiness, and fetch available AI models.
        *   If YouTube is linked but subscription feed is not ready, calls `requestSubscriptionFeedUpdate` Cloud Function.
        *   Provides state like `currentUser`, `isLoggedIn`, `isAuthorizedUser`, `isYouTubeLinkedByAuthCheck`, `isSubscriptionFeedReady`, `availableModels`.
    *   **`useYouTube.js`**:
        *   Manages YouTube data interactions and OAuth flow.
        *   After successful new YouTube connection and initial playlist fetch, calls `requestSubscriptionFeedUpdate` Cloud Function.
        *   Fetches user playlists (`listUserPlaylists` CF) and playlist items (`getWatchLaterPlaylist` CF).
        *   Manages state like `userPlaylists`, `selectedPlaylistId`, `videos`, `isYouTubeLinked`.
    *   **`useWebSocketChat.js`**:
        *   Manages WebSocket connection to `gemini-chat-service`.
        *   Accepts `currentIncludeSubscriptionFeed` as a prop from `App.js`.
        *   Uses this prop to manage an internal state for the preference, which is included in the `INIT_CHAT` message.
        *   The WebSocket connection is reset if this preference prop changes, ensuring the chat context reflects the new setting.
        *   Handles chat messages and state (`suggestedVideos`, `thinkingOutput`, etc.).

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
    *   `SettingsScreen.js`: Allows user to select AI model, manage default playlist.
        *   Receives `includeSubscriptionFeed` and `onIncludeSubscriptionFeedChange` props from `App.js` to manage the "Include subscription feed" preference.
        *   Updates `localStorage` and calls the prop callback when the preference is changed by the user.
    *   `LoadingOverlay.js`, `StatusPopup.js`: Utility components for user feedback.

*   **`firebase.js`**: Initializes the Firebase app instance using configuration (ideally from environment variables). Exports `auth` service.
*   **`index.js`**: The main entry point that renders the `<App />` component into the DOM.
*   **`reportWebVitals.js`**: Utility for measuring web performance metrics.

### Backend - Google Cloud Functions (`backend/`)

Each subdirectory in `backend/` typically contains an `index.js` for a single Cloud Function and a `package.json` for its dependencies.

*   **`checkUserAuthorization/index.js`**:
    *   **Purpose:** Verifies Firebase ID token, checks user email against `AuthorizedEmail` Datastore kind, checks for existing YouTube tokens in `Tokens` kind, checks `UserSubscriptionFeedCache` for readiness of subscription feed, and fetches available Gemini AI models.
    *   **Trigger:** HTTP.
    *   **Input:** Firebase ID token in `Authorization: Bearer` header.
    *   **Output:** JSON `{ authorized: boolean, email: string, uid: string, youtubeLinked: boolean, isSubscriptionFeedReady: boolean, availableModels: Array<string> }` or error.
    *   **Secrets Used:** `GEMINI_API_KEY`.

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

*   **`requestSubscriptionFeedUpdate/index.js` (New):**
    *   **Purpose:** Authenticates user via Firebase ID token and publishes a message with the `userId` to the `user-feed-update-requests` Pub/Sub topic. Handles CORS for local development and production.
    *   **Trigger:** HTTP.
    *   **Input:** Firebase ID token in `Authorization: Bearer` header.
    *   **Output:** 202 Accepted or error.

*   **`scheduleAllUserFeedUpdates/index.js` (New):**
    *   **Purpose:** HTTP-triggered function intended to be called by Cloud Scheduler. Queries Datastore for all users with linked YouTube accounts and publishes a message for each to the `user-feed-update-requests` Pub/Sub topic.
    *   **Trigger:** HTTP (target for Cloud Scheduler).
    *   **Input:** Standard HTTP request (no specific body payload needed from scheduler).
    *   **Output:** Success/error message.

*   **`fetchUserSubscriptionFeed/index.js` (New):**
    *   **Purpose:** Processes messages from the `user-feed-update-requests` Pub/Sub topic. For a given `userId`:
        *   Retrieves and refreshes user's OAuth tokens (using `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`).
        *   Fetches subscriptions, then recent videos from each subscription's uploads playlist.
        *   Aggregates, sorts, and selects the top 100 most recent videos.
        *   Fetches full details (including duration) for these 100 videos.
        *   Filters out YouTube Shorts (videos <= 61 seconds).
        *   Stores the remaining non-Short videos in `UserSubscriptionFeedCache` (with `videos[].description` excluded from indexes).
    *   **Trigger:** Pub/Sub topic `user-feed-update-requests`.
    *   **Input:** Pub/Sub message `{ data: { userId: "USER_FIREBASE_UID" } }`.
    *   **Permissions:** Datastore User. (YouTube API access via user's tokens and client credentials for refresh).

### Backend - AI Chat Service (`gemini-chat-service/`)

This service is a Node.js application designed to be deployed on Cloud Run, providing a WebSocket interface for AI chat.

*   **`server.js`**:
    *   **Purpose:** Main WebSocket server logic.
    *   **WebSocket Setup:** Uses `ws` library to create a WebSocket server.
    *   **Session Management:** Maintains an in-memory `activeSessions` map. Each session includes the Gemini chat instance, `playlistId`, `modelId`, `userId`, and the combined `videosForContext` (playlist videos + potentially subscription feed videos).
    *   **`INIT_CHAT` Message Handling:**
        *   Receives `playlistId`, `modelId`, `userId`, and `includeSubscriptionFeed` preference from the client.
        *   Fetches video metadata for `playlistId` from `Videos` kind.
        *   If `includeSubscriptionFeed` is true and `userId` is provided, fetches cached videos from `UserSubscriptionFeedCache`.
        *   Combines and de-duplicates these video sets.
        *   Constructs a detailed context string from the combined video list.
        *   Initializes a Gemini chat session with an updated system prompt reflecting mixed video sources and the desired JSON output.
        *   Stores `videosForContext` and `userId` in the session.
        *   Sends `CHAT_INITIALIZED` back to the client.
    *   **`USER_QUERY` Message Handling:**
        *   Receives user's `query`.
        *   Sends the query to the established Gemini chat session.
        *   Streams Gemini's response.
        *   On stream completion, parses the response, extracts suggested `videoId`s, enriches them with full video details from the session's `videosForContext`, and sends `STREAM_END`.
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

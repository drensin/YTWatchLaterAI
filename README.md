# ReelWorthy: AI-Powered YouTube Playlist Explorer

![ReelWorthy Logo](frontend/public/ReelWorthyLogo.png)

For a comprehensive guide on using ReelWorthy, please see the [User Manual](USER_MANUAL.md).

ReelWorthy is a smart web application designed to help you make the most of your YouTube playlists. If you have a long "Watch Later" list or many saved playlists, ReelWorthy provides an interactive way to rediscover and engage with your saved video content using a powerful AI chat interface powered by Google's Gemini models. Furthermore, you can optionally expand the AI's knowledge base to include recent videos from your YouTube channel subscriptions, offering an even broader range of suggestions.

The application aims to solve the problem of unwieldy playlists by providing a smart, interactive way to rediscover and engage with saved video content. A key feature is the real-time streaming of the AI's "thinking" process, allowing users to see how the AI is working towards its suggestions.

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
d.  **Query Processing (Server-side):** The query is sent as a `USER_QUERY` message. The `gemini-chat-service` (using the `@google/generative-ai` SDK) sends this query along with the established context to the selected Gemini model. It instructs Gemini to recommend videos from the provided context and to respond in a specific JSON format: `{"suggestedVideos": [{"videoId": "...", "reason": "..."}]}`. The service also requests the model to include its "thinking" process.  
e.  **Streaming Response:**  
    - The Gemini model processes the request and starts streaming its response, which includes both "thinking" chunks and the main content (the JSON).  
    - The `gemini-chat-service` identifies "thinking" chunks and forwards them as `THINKING_CHUNK` WebSocket messages to the frontend. The frontend displays this "thinking" process live in the "Thinking" tab.  
    - For the main content (JSON parts), the server sends `CONTENT_CHUNK_RECEIVED` messages to the frontend, allowing the UI to display an indicator (e.g., "Receiving Final Data: ###") showing that the final JSON response is being transmitted.  
    - When the stream ends, the server parses the complete accumulated JSON response from Gemini, extracts the `suggestedVideos` array, enriches these suggestions with full video details from its in-memory context (fetched during `INIT_CHAT`), and sends a `STREAM_END` message to the frontend with the finalized suggestions and a summary answer.  
f.  **Display Results:** The frontend displays the suggested videos in the "Results" tab, along with the AI's reasoning for each suggestion. The "Thinking" tab provides a view of the AI's thought process and data reception progress during the query.  

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
          | ▲                      +-------------------------+      | - @google/generative-ai SDK |
          | | (REST API)                     | ▲                     | - Gemini API                  |
          | |                                | | (Trigger)           +-------------------------------+
          | |                                ▼ |                                         ▲
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
    *   **`checkUserAuthorization`**: Verifies Firebase ID token, checks user email against an allow-list in Datastore, reports initial YouTube link status, checks if the user's subscription feed cache (`UserSubscriptionFeedCache`) is ready, and fetches/returns a list of available AI models (via Gemini API).
    *   **`handleYouTubeAuth`**: The OAuth 2.0 redirect URI. Exchanges authorization code for YouTube API tokens and stores them securely in Datastore, keyed by Firebase UID.
    *   **`listUserPlaylists`**: Uses stored OAuth tokens to fetch the user's playlists from the YouTube Data API.
    *   **`getWatchLaterPlaylist`**: Fetches items for a specific playlist, retrieves detailed video metadata from YouTube Data API, and synchronizes this data with Cloud Datastore (`Videos` kind). Manages video-playlist associations.
    *   **`requestSubscriptionFeedUpdate` (HTTP):** Authenticates the user via Firebase ID token. Publishes a message containing the `userId` to the `user-feed-update-requests` Pub/Sub topic to trigger an asynchronous update of that user's subscription feed.
    *   **`scheduleAllUserFeedUpdates` (HTTP, Scheduler Target):** Queries Datastore for all users with linked YouTube accounts (from `Tokens` kind). For each user, publishes a message with their `userId` to the `user-feed-update-requests` Pub/Sub topic.
    *   **`fetchUserSubscriptionFeed` (Pub/Sub Triggered):** Triggered by messages on the `user-feed-update-requests` topic. For the given `userId` in the message:
        *   Retrieves and refreshes user's OAuth tokens.
        *   Fetches YouTube channel subscriptions.
        *   For each subscription, gets recent videos.
        *   Aggregates, sorts, selects top 100, fetches full details, filters Shorts.
        *   Stores results in `UserSubscriptionFeedCache`.
4.  **Google Cloud Pub/Sub:**
    *   **`user-feed-update-requests` topic:** Queues requests for individual user subscription feed updates.
5.  **Google Cloud Scheduler:**
    *   **`TriggerSubscriptionFeedUpdates` job:** Periodically invokes `scheduleAllUserFeedUpdates`.
6.  **Google Cloud Run (`gemini-chat-service` - Node.js, WebSocket):**
    *   Hosts the WebSocket server for AI chat.
    *   Uses the `@google/generative-ai` SDK to interact directly with Gemini API models.
    *   On `INIT_CHAT`: Fetches playlist videos (and optionally subscription feed videos from `UserSubscriptionFeedCache`) from Datastore, prepares context, and initializes the model.
    *   On `USER_QUERY`: Sends query and context to Gemini, requesting JSON output and "thinking" process.
    *   Streams `THINKING_CHUNK` messages for AI's thought process.
    *   Streams `CONTENT_CHUNK_RECEIVED` messages as indicators while the main JSON response is being formed by Gemini.
    *   On `STREAM_END`: Parses the final JSON, enriches video data, and sends suggestions to the client.
    *   Configured with `thinkingBudget` and `safetySettings` for Gemini API calls.
7.  **Google Cloud Datastore (NoSQL Database):**
    *   `Tokens`: Stores users' YouTube OAuth tokens.
    *   `Videos`: Stores detailed YouTube video metadata.
    *   `AuthorizedEmail`: Application access allow-list.
    *   `UserSubscriptionFeedCache`: Caches recent, non-Short videos from user subscriptions.
8.  **External APIs:**
    *   **YouTube Data API v3:** For playlist and video data.
    *   **Google Gemini API (via `@google/generative-ai` SDK):** For AI chat and recommendations.
9.  **Google Secret Manager:** Securely stores API keys and OAuth client secrets.

## Detailed Code Roadmap & Component Breakdown

### Frontend (`frontend/src/`)

The frontend is a React application structured with components and custom hooks for modularity.

*   **`App.js`**:
    *   The main root component. Orchestrates global application state including user authentication, screen navigation, selected playlist, AI model selection, and the `includeSubscriptionFeed` preference.  
    *   Integrates the core custom hooks (`useAuth`, `useYouTube`, `useWebSocketChat`) to manage their respective functionalities.  
    *   Handles conditional rendering of different screens/views based on application state.  
    *   Renders the main layout, including the `ScreenHeader` and `BottomNavigationBar` components.  
    *   Manages and passes down props like `dataReceptionIndicator` for UI feedback during AI chat streaming.

*   **`hooks/`**:
    *   **`useAuth.js`**: Manages Firebase authentication state. On user login, it calls the `checkUserAuthorization` Cloud Function to verify application access, retrieve initial YouTube linkage status, check if the subscription feed is ready, and fetch available AI models. Triggers `requestSubscriptionFeedUpdate` if the feed is not ready for a linked YouTube account.
    *   **`useYouTube.js`**: Handles the YouTube OAuth 2.0 flow for account connection. Manages fetching user playlists (`listUserPlaylists` CF) and videos for a selected playlist (`getWatchLaterPlaylist` CF). After a successful YouTube OAuth connection, it directly triggers a request to update the user's subscription feed via the `requestSubscriptionFeedUpdate` Cloud Function. Provides state for `userPlaylists`, `selectedPlaylistId`, `videos`, `isYouTubeLinked`, and related loading/error states.
    *   **`useWebSocketChat.js`**:
        *   Manages the WebSocket connection to the `gemini-chat-service`.  
        *   Sends `INIT_CHAT` message with `selectedPlaylistId`, `selectedModelId`, `userId`, and the `includeSubscriptionFeed` preference to the backend.  
        *   Handles incoming WebSocket messages: `THINKING_CHUNK` (updates `thinkingOutput` state), `CONTENT_CHUNK_RECEIVED` (updates `dataReceptionIndicator` state, e.g., by appending "#"), and `STREAM_END` (sets `suggestedVideos` and clears `dataReceptionIndicator`).  
        *   Manages chat UI states like `isStreaming`, `activeOutputTab`, and provides `handleQuerySubmit`.  
        *   Includes logic for ping/pong keep-alive and automatic reconnection.

*   **`components/`**:
    *   `ChatViewContent.js`: Displays chat input, "Internal Thoughts" (`thinkingOutput`), "Receiving Final Data" (`dataReceptionIndicator` as "###..."), and suggested videos. Conditionally shows "Receiving Final Data" section only when `dataReceptionIndicator` is populated.
    *   Other components as previously described (Login, Playlists, Settings, etc.).
    *   `SettingsScreen.js`: Manages "Include subscription feed" preference.

*   **`firebase.js`**: Initializes Firebase.
*   **`index.js`**: Renders `<App />`.

### Backend - Google Cloud Functions (`backend/`)
(Structure and purpose of individual functions largely remain as previously described, with `checkUserAuthorization` also fetching AI models.)

*   **`checkUserAuthorization/index.js`**: Also fetches available Gemini models (e.g., from a config or by calling the Gemini API if it provides a model listing endpoint accessible with an API key).
*   Other functions (`handleYouTubeAuth`, `listUserPlaylists`, `getWatchLaterPlaylist`, `requestSubscriptionFeedUpdate`, `scheduleAllUserFeedUpdates`, `fetchUserSubscriptionFeed`) maintain their roles.

### Backend - AI Chat Service (`gemini-chat-service/`)

*   **`server.js`**:
    *   Uses `@google/generative-ai` SDK.
    *   `INIT_CHAT`: Fetches context, initializes Gemini model with system prompt, `modelId`, and context.
    *   `USER_QUERY`:
        *   Sends query to Gemini with `generationConfig` (including `responseMimeType: "application/json"`, `thinkingConfig: { includeThoughts: true, thinkingBudget: 1024 }`) and `safetySettings`.
        *   Streams response:
            *   For `part.thought`, sends `THINKING_CHUNK` to client.
            *   For other `part.text` (JSON content), sends `CONTENT_CHUNK_RECEIVED` to client.
        *   At stream end, parses full accumulated JSON, enriches, sends `STREAM_END`.
*   **`Dockerfile`**, **`package.json`**: Standard setup.

## Datastore Data Model

The application utilizes Google Cloud Datastore for persistent storage. Below is a description of each Kind and its schema:

1.  **Kind: `AuthorizedEmail`**
    *   **Key**: User's email address (String).
    *   **Purpose**: Acts as an allow-list for application access. The existence of an entity with the user's email as the key signifies authorization.
    *   **Properties**: None are actively used from the entity's data.
    *   **Indexed Properties**: Key only.
    *   **Interacting Cloud Functions**:
        *   `checkUserAuthorization` (Read-only: Checks for key existence).

2.  **Kind: `Tokens`**
    *   **Key**: User's Firebase UID (String).
    *   **Purpose**: Securely stores OAuth 2.0 tokens required to access the YouTube Data API on behalf of the user.
    *   **Properties**:
        *   `access_token` (String, `excludeFromIndexes: true`) - The token used for API requests.
        *   `refresh_token` (String, `excludeFromIndexes: true`) - Used to obtain new access tokens.
        *   `scope` (String) - The scopes granted by the user (e.g., `https://www.googleapis.com/auth/youtube.readonly`).
        *   `token_type` (String) - Typically "Bearer".
        *   `expiry_date` (Number/Timestamp) - Milliseconds since epoch, indicating when the `access_token` expires.
    *   **Indexed Properties**: Key only. `access_token` and `refresh_token` are explicitly excluded from indexes.
    *   **Interacting Cloud Functions**:
        *   `checkUserAuthorization`: Reads to check for `refresh_token` existence (indicates YouTube linkage).
        *   `handleYouTubeAuth`: Writes new tokens after successful OAuth flow.
        *   `listUserPlaylists`: Reads tokens for API calls; updates tokens if refreshed by the auth library.
        *   `getWatchLaterPlaylist`: Reads tokens for API calls; updates tokens if refreshed.
        *   `fetchUserSubscriptionFeed`: Reads tokens for API calls; updates tokens if refreshed.
        *   `scheduleAllUserFeedUpdates`: Reads entity keys (`__key__`) to get UIDs of all users with stored tokens.

3.  **Kind: `Videos`**
    *   **Key**: YouTube `videoId` (String).
    *   **Purpose**: Stores detailed metadata for individual YouTube videos. This data is aggregated from user playlists and synchronized by the `getWatchLaterPlaylist` function.
    *   **Properties**:
        *   `videoId` (String) - Same as the key, for convenience in queries if needed.
        *   `title` (String)
        *   `description` (String, `excludeFromIndexes: true`) - Full video description.
        *   `publishedAt` (String/Timestamp) - Video's original YouTube publication date.
        *   `addedToPlaylistAt` (String/Timestamp) - Timestamp of when the video item was added to the *specific* playlist being synced (from YouTube's `playlistItems.list` snippet).
        *   `thumbnailUrl` (String | null, `excludeFromIndexes: true`) - URL of the default thumbnail.
        *   `channelId` (String)
        *   `channelTitle` (String)
        *   `durationSeconds` (Number | null) - Video duration in seconds, parsed from ISO 8601 format.
        *   `viewCount` (Number | null) - Parsed from YouTube statistics.
        *   `likeCount` (Number | null) - Parsed from YouTube statistics.
        *   `topicCategories` (Array of Strings | null) - e.g., "Music", "Gaming". Derived from YouTube's `topicDetails`.
        *   `associatedPlaylistIds` (Array of Strings, **indexed**) - List of playlist IDs (belonging to various users) that this video is part of. This is crucial for context scoping and cleanup.
        *   `geminiCategories` (Array of Strings, optional) - Placeholder for potential future AI-assigned categories.
        *   `lastCategorized` (Timestamp | null) - Placeholder for when AI last categorized this video.
    *   **Indexed Properties**: Key, `associatedPlaylistIds`. `description` and `thumbnailUrl` are explicitly excluded. Other properties are indexed by default unless specified.
    *   **Interacting Cloud Functions & Services**:
        *   `getWatchLaterPlaylist`: Primary manager of this Kind. Reads existing video data, writes (upserts) new/updated video details from YouTube, manages the `associatedPlaylistIds` array, and deletes orphaned video entities.
        *   `gemini-chat-service` (Cloud Run): Reads video details from this Kind to provide context to the AI for playlist-specific queries.

4.  **Kind: `UserSubscriptionFeedCache`**
    *   **Key**: User's Firebase UID (String).
    *   **Purpose**: Caches a list of recent, non-Short videos from a user's YouTube subscriptions to provide an optional extended context for the AI.
    *   **Properties**:
        *   `videos`: (Array of Objects) - Each object represents a video.
            *   `videoId` (String)
            *   `title` (String)
            *   `description` (String) - The path `videos[].description` is set with `excludeFromIndexes: true` when the entity is saved.
            *   `channelId` (String)
            *   `channelTitle` (String)
            *   `publishedAt` (String/Timestamp) - Video's original YouTube publication date.
            *   `thumbnailUrl` (String | null)
            *   `durationSeconds` (Number)
        *   `lastUpdated` (Date/Timestamp) - Timestamp indicating when this cache entry was last refreshed.
    *   **Indexed Properties**: Key, `lastUpdated`. The `videos` array and its nested fields (except where `videos[].description` is excluded) are indexed by default, which might be extensive. Consider further exclusions if not needed for queries.
    *   **Interacting Cloud Functions & Services**:
        *   `checkUserAuthorization`: Reads `lastUpdated` to determine if the feed cache is considered "ready" or recent.
        *   `fetchUserSubscriptionFeed`: Writes (saves) the processed list of subscription videos and the `lastUpdated` timestamp. This is the primary manager of this Kind.
        *   `gemini-chat-service` (Cloud Run): Reads the `videos` array if the user has opted to include their subscription feed in the AI chat context.

## Setup and Local Development
(Refer to `DEPLOYMENT_INSTRUCTIONS.md` for detailed setup steps.)

### Prerequisites
*   Node.js (v20 recommended for consistency with Cloud Run base image) and npm.
*   Google Cloud SDK (`gcloud` CLI).
*   Firebase CLI.
*   Docker.

### Google Cloud Project Setup
1.  Create/select GCP project.
2.  **Enable APIs:** YouTube Data API v3, Identity Platform, Secret Manager, Datastore, Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, **Generative Language API**.
3.  Configure OAuth Consent Screen & Client ID.

### Firebase Project Setup
This involves linking your Firebase project to your Google Cloud Project, enabling Google Sign-In as an authentication provider, setting up Firebase Hosting for the frontend, and obtaining your Firebase project configuration details. For comprehensive steps, please consult the [Firebase Project Setup section in DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md#3-firebase-project-setup).

### Secrets Configuration
You will need to configure `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `GEMINI_API_KEY` in Google Cloud Secret Manager. Detailed instructions for creating and managing these secrets are available in the [Secret Manager Setup section in DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md#4-secret-manager-setup).

### Frontend Setup
Frontend setup primarily involves configuring environment variables, especially for backend service URLs. This typically includes creating a `.env` file with the necessary Firebase configuration and API endpoints. For a complete guide, see the [Code Configuration & Placeholders section in DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md#6-code-configuration--placeholders).

### Backend Configuration Notes
Backend configuration involves several aspects, including setting up redirect URIs for OAuth, configuring allowed origins for CORS, and deploying the various Cloud Functions and the Gemini chat service. All detailed steps for backend setup and deployment are covered in [DEPLOYMENT_INSTRUCTIONS.md](DEPLOYMENT_INSTRUCTIONS.md#6-code-configuration--placeholders).

## Deployment
For comprehensive, step-by-step deployment commands and configurations for all services, please refer to **`DEPLOYMENT_INSTRUCTIONS.md`**.

## Environment Variables
(Refer to `DEPLOYMENT_INSTRUCTIONS.md` for a detailed list).

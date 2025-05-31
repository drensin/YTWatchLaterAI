# YT Watch Later Manager

This project helps manage a YouTube 'Watch Later' playlist using a React frontend and Google Cloud Functions backend.

## Project Structure

```
YTWatchLaterManager/
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   ├── index.css
│   │   └── reportWebVitals.js
│   ├── package.json
│   └── README.md
└── backend/
    ├── handleYouTubeAuth/
    │   ├── index.js
    │   └── package.json
    ├── getWatchLaterPlaylist/
    │   ├── index.js
    │   └── package.json
    ├── categorizeVideo/
    │   ├── index.js
    │   └── package.json
    └── chatWithPlaylist/
        ├── index.js
        └── package.json
    ├── gemini-chat-service/  (Cloud Run service)
    │   ├── server.js
    │   ├── package.json
    │   └── Dockerfile
├── cloudbuild.yaml  (Example)
└── DEPLOYMENT_INSTRUCTIONS.md
```

## Frontend

Located in the `frontend/` directory. See `frontend/README.md` for setup and deployment instructions (including GitHub Pages).

## Backend

The backend consists of Google Cloud Functions for most operations and a Google Cloud Run service for the chat functionality.

### Google Cloud Functions

Located in the `backend/` directory (excluding `gemini-chat-service`). Each subdirectory like `handleYouTubeAuth`, `getWatchLaterPlaylist`, etc., is a separate Node.js Cloud Function. The `chatWithPlaylist` Cloud Function has been replaced by the `gemini-chat-service` on Cloud Run.

### Google Cloud Run Service (`gemini-chat-service`)

Located in the `gemini-chat-service/` directory. This is a Node.js application packaged as a Docker container and deployed on Cloud Run.
*   **Purpose:** Provides a WebSocket endpoint for real-time chat interactions with Gemini. It maintains Gemini chat sessions in memory for the duration of a client's connection to provide context persistence for queries related to a specific playlist.
*   **Technology:** Node.js, Express.js, `ws` (WebSocket library), Docker.

### Common Setup for Backend Services (Cloud Functions & Cloud Run):

1.  **Prerequisites:**
    *   Google Cloud SDK (`gcloud`) installed and configured.
    *   Node.js and npm installed.
    *   A Google Cloud Project.

2.  **Secrets in Secret Manager:**
    Before deploying functions, create the following secrets in Google Cloud Secret Manager for your project:
    *   `YOUTUBE_CLIENT_ID`: Your Google OAuth 2.0 Client ID.
    *   `YOUTUBE_CLIENT_SECRET`: Your Google OAuth 2.0 Client Secret.
    *   `GEMINI_API_KEY`: Your API key for the Gemini API. This is used by the `gemini-chat-service` on Cloud Run and potentially other functions if they interact directly with Gemini.
    *   `GCP_PROJECT_ID`: Your Google Cloud Project ID (can be useful for SDKs).

    Grant the service accounts of your Cloud Functions and the Cloud Run service the "Secret Manager Secret Accessor" role for these secrets.

3.  **Placeholders/Configuration:**
    *   Project ID `watchlaterai-460918` and frontend URL `drensin.github.io/YTWatchLaterAI/` have been updated in the backend code and frontend configuration where necessary.
    *   The `handleYouTubeAuth` Cloud Function URL needs to be correctly configured as an OAuth redirect URI in your Google Cloud Console OAuth client settings.
    *   The `frontend/src/App.js` now uses `WEBSOCKET_SERVICE_URL` to connect to the deployed `gemini-chat-service` on Cloud Run.

## Datastore Data Model

*   **Kind: `Tokens`**
    *   Key: `default` (for a single-user application) or a unique `userId`.
    *   Properties:
        *   `accessToken` (String): The OAuth access token.
        *   `refreshToken` (String): The OAuth refresh token.
        *   `expiryDate` (Integer/Timestamp): Expiration date of the access token.
        *   `scopes` (String): Scopes granted.

*   **Kind: `Videos`**
    *   Key: YouTube `videoId` (String).
    *   Properties:
        *   `videoId` (String): The YouTube video ID.
        *   `title` (String): Video title.
        *   `description` (String, indexed for search if possible, though Datastore has limitations): Video description.
        *   `publishedAt` (Timestamp/String): Video publication date.
        *   `channelId` (String): YouTube channel ID.
        *   `channelTitle` (String): YouTube channel title.
        *   `thumbnailUrl` (String): URL of the video thumbnail.
        *   `duration` (String/Integer, optional): Video duration (e.g., "PT5M30S" or seconds). May require extra API call to fetch.
        *   `geminiCategories` (Array of Strings, indexed): Categories assigned by the `categorizeVideo` function.
        *   `lastCategorized` (Timestamp): When the video was last processed by `categorizeVideo`.
        *   `addedToPlaylistAt` (Timestamp, from YouTube API): When the video was added to the "Watch Later" list.

## Deployment

See `DEPLOYMENT_INSTRUCTIONS.md` for detailed `gcloud` commands and an example `cloudbuild.yaml`.

---

This `README.md` provides a high-level overview. Detailed instructions for each part are in their respective `README.md` files or the `DEPLOYMENT_INSTRUCTIONS.md`.

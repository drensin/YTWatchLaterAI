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
├── cloudbuild.yaml  (Example)
└── DEPLOYMENT_INSTRUCTIONS.md
```

## Frontend

Located in the `frontend/` directory. See `frontend/README.md` for setup and deployment instructions (including GitHub Pages).

## Backend (Google Cloud Functions)

Located in the `backend/` directory. Each subdirectory is a separate Node.js Cloud Function.

### Common Setup for Backend Functions:

1.  **Prerequisites:**
    *   Google Cloud SDK (`gcloud`) installed and configured.
    *   Node.js and npm installed.
    *   A Google Cloud Project.

2.  **Secrets in Secret Manager:**
    Before deploying functions, create the following secrets in Google Cloud Secret Manager for your project:
    *   `YOUTUBE_CLIENT_ID`: Your Google OAuth 2.0 Client ID.
    *   `YOUTUBE_CLIENT_SECRET`: Your Google OAuth 2.0 Client Secret.
    *   `GEMINI_API_KEY`: Your API key for the Gemini API (if using it directly, Vertex AI SDK might use service account auth).
    *   `GCP_PROJECT_ID`: Your Google Cloud Project ID (used by Vertex AI SDK).

    Grant the service accounts of your Cloud Functions the "Secret Manager Secret Accessor" role for these secrets.

3.  **Placeholders to Update in Code:**
    *   `watchlaterai-460918`: This has been updated in the backend `*.js` files.
    *   `drensin.github.io/YTWatchLaterAI/`: This has been updated in the backend `*.js` files for CORS origins, redirect URLs, and in `frontend/package.json`.
    *   `YOUR_HANDLE_YOUTUBE_AUTH_FUNCTION_URL`: Replace with the actual HTTP trigger URL of your deployed `handleYouTubeAuth` function. This is used as the OAuth redirect URI.

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

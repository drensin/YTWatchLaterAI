# Deployment Instructions for ReelWorthy

This document provides detailed instructions for deploying the frontend, backend Cloud Functions, and the Gemini chat service for ReelWorthy.

## Table of Contents
1.  [Prerequisites](#1-prerequisites)
2.  [Google Cloud Project Setup](#2-google-cloud-project-setup)
3.  [Firebase Project Setup](#3-firebase-project-setup)
4.  [Secret Manager Setup](#4-secret-manager-setup)
5.  [Service Account Permissions](#5-service-account-permissions)
6.  [Code Configuration & Placeholders](#6-code-configuration--placeholders)
7.  [Deploying Backend Services](#7-deploying-backend-services)
    *   [Cloud Functions](#71-deploying-cloud-functions)
    *   [Cloud Run Service (`gemini-chat-service`)](#72-deploying-cloud-run-service-gemini-chat-service)
8.  [Deploying Frontend (Firebase Hosting)](#8-deploying-frontend-firebase-hosting)
9.  [Datastore Index Setup](#9-datastore-index-setup)
10. [Final Configuration Checks](#10-final-configuration-checks)
11. [Example `cloudbuild.yaml` (CI/CD)](#11-example-cloudbuildyaml-cicd)

---

## 1. Prerequisites

*   **Google Cloud SDK (`gcloud` CLI):** Installed and authenticated.
    *   Login: `gcloud auth login`
    *   Set project: `gcloud config set project YOUR_PROJECT_ID` (replace `YOUR_PROJECT_ID`)
*   **Firebase CLI:** Installed (`npm install -g firebase-tools`) and authenticated (`firebase login`).
*   **Node.js and npm:** Installed locally (v18+ for backend, v20 for Cloud Functions runtime).
*   **Docker:** Installed locally (if building `gemini-chat-service` image locally).
*   **Google Cloud Project:** A project with billing enabled.
*   **Firebase Project:** Linked to your Google Cloud Project.

## 2. Google Cloud Project Setup

1.  **Project ID:** Note your Google Cloud Project ID.
2.  **Region:** Choose a region for your services (e.g., `us-central1`).
3.  **Enable APIs:** In the Google Cloud Console, enable the following APIs for your project:
    *   YouTube Data API v3
    *   Identity Platform API (used by Firebase Authentication)
    *   Secret Manager API
    *   Cloud Datastore API (ensure you select "Native mode" if prompted, not "Firestore in Datastore mode" unless intended)
    *   Cloud Functions API
    *   Cloud Run API
    *   Cloud Build API (if using Cloud Build for CI/CD)
    *   Generative Language API (used by `gemini-chat-service`).
4.  **OAuth Consent Screen:**
    *   Navigate to "APIs & Services" > "OAuth consent screen".
    *   User Type: "External".
    *   App information: Fill in app name, user support email, developer contact.
    *   Scopes: You don't need to add scopes here manually; they are requested by the application during the OAuth flow.
    *   Test users: Add email addresses of users who can test the app while it's in "Testing" publishing status.
5.  **OAuth 2.0 Client ID:**
    *   Navigate to "APIs & Services" > "Credentials".
    *   Click "+ CREATE CREDENTIALS" > "OAuth client ID".
    *   Application type: "Web application".
    *   Name: e.g., "ReelWorthy Web Client".
    *   **Authorized JavaScript origins:**
        *   `http://localhost:3000` (for local frontend development)
        *   Your Firebase Hosting URL (e.g., `https://YOUR_PROJECT_ID.web.app`)
    *   **Authorized redirect URIs:**
        *   The URL of your deployed `handleYouTubeAuth` Cloud Function. You will get this URL *after* its first deployment (e.g., `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/handleYouTubeAuth`).
    *   Save the Client ID and Client Secret. These will be stored in Secret Manager.

## 3. Firebase Project Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and add a project, linking it to your existing Google Cloud Project.
2.  **Authentication:**
    *   Navigate to "Authentication" > "Sign-in method".
    *   Enable the "Google" provider.
    *   Ensure the web SDK configuration is available (Project Settings > General > Your apps > Web app).
3.  **Hosting:**
    *   Navigate to "Hosting". Click "Get started".
    *   Follow the steps. This typically involves running `firebase init hosting` in your `frontend` directory later.
    *   Note your default Firebase Hosting site URL (e.g., `https://YOUR_PROJECT_ID.web.app`).
4.  **Datastore:** Ensure Datastore is enabled in your Google Cloud Project (see step 2.3).

## 4. Secret Manager Setup

In Google Cloud Secret Manager, create the following secrets. The service accounts for your Cloud Functions and Cloud Run service will need access to these.
*   `YOUTUBE_CLIENT_ID`: The OAuth Client ID obtained in step 2.5.
*   `YOUTUBE_CLIENT_SECRET`: The OAuth Client Secret obtained in step 2.5.
*   `GEMINI_API_KEY`: Your API key for the Google Gemini API (used by `gemini-chat-service`).

**Note:** `GOOGLE_CLOUD_PROJECT` ID is typically available as an environment variable in Cloud Functions/Run or can be inferred by SDKs; it's not usually stored as a secret itself.

## 5. Service Account Permissions

*   **Cloud Functions Default Service Account:** Usually `YOUR_PROJECT_ID@appspot.gserviceaccount.com`.
*   **Cloud Run Service Account for `gemini-chat-service`:** You created `youtube-watchlater-fn@YOUR_PROJECT_ID.iam.gserviceaccount.com` or can use the default Compute Engine service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`). It's recommended to use a dedicated service account with minimal privileges.

Grant the following roles to the respective service accounts:
*   **Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`):**
    *   Grant to Cloud Functions service account for `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
    *   Grant to Cloud Run service account for `GEMINI_API_KEY`.
*   **Cloud Datastore User (`roles/datastore.user`):**
    *   Grant to Cloud Functions service account (for all functions interacting with Datastore).
    *   Grant to Cloud Run service account (for `gemini-chat-service`).
*   **(The `@google/generative-ai` SDK used by `gemini-chat-service` with an API key might not require a specific AI Platform/Vertex AI role on the service account if the API key itself has permissions for the Generative Language API).**

Example `gcloud` command to grant a role:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="ROLE_NAME"

# Example for secret access:
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
    --member="serviceAccount:YOUR_SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --project="YOUR_PROJECT_ID"
```
Repeat for all necessary secrets and roles.

## 6. Code Configuration & Placeholders

*   **Frontend Environment Variables:**
    *   The `frontend/src/firebase.js` file currently has hardcoded Firebase configuration. **It is strongly recommended to move these to environment variables.** Create a `.env` file in the `frontend/` directory (you can copy from `.env.example` if one is provided later).
        ```env
        REACT_APP_FIREBASE_API_KEY="your-firebase-api-key"
        REACT_APP_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
        # ... other Firebase config values ...
        REACT_APP_YOUTUBE_CLIENT_ID="your-youtube-oauth-client-id"
        # Ideally, backend URLs too:
        # REACT_APP_CHECK_AUTH_URL="https://..."
        # REACT_APP_LIST_PLAYLISTS_URL="https://..."
        # REACT_APP_GET_PLAYLIST_ITEMS_URL="https://..."
        # REACT_APP_HANDLE_YOUTUBE_AUTH_URL_FOR_HOOK="https://..." # Used by useYouTube hook
        # REACT_APP_WEBSOCKET_URL="wss://..."
        ```
    *   Update `frontend/src/firebase.js` to use these environment variables.
    *   The frontend hooks (`useAuth.js`, `useYouTube.js`, `useWebSocketChat.js`) define `CLOUD_FUNCTIONS_BASE_URL` and `WEBSOCKET_SERVICE_URL` internally with hardcoded project IDs. These should ideally be passed in from `App.js` which reads them from environment variables or a central config.
*   **Backend Redirect URIs:**
    *   The `REDIRECT_URI` in `backend/handleYouTubeAuth/index.js` and other functions (like `getWatchLaterPlaylist/index.js`, `listUserPlaylists/index.js`) is constructed using `process.env.GOOGLE_CLOUD_PROJECT || 'watchlaterai-460918'`. Ensure `GOOGLE_CLOUD_PROJECT` is correctly set for your deployed functions or update the fallback. This URI must match an "Authorized redirect URI" in your Google OAuth Client settings.

## 7. Deploying Backend Services

### 7.1 Deploying Cloud Functions
Navigate to each function's directory (e.g., `cd backend/handleYouTubeAuth`).

*   **`handleYouTubeAuth`**
    ```bash
    gcloud functions deploy handleYouTubeAuth \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source . \
      --entry-point handleYouTubeAuth \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest
    ```
    *After deployment, note its HTTP trigger URL. Update your Google OAuth Client's "Authorized redirect URIs" with this URL.*

*   **`checkUserAuthorization`**
    ```bash
    gcloud functions deploy checkUserAuthorization \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source . \
      --entry-point checkUserAuthorization \
      --project YOUR_PROJECT_ID
    ```

*   **`listUserPlaylists`**
    ```bash
    gcloud functions deploy listUserPlaylists \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source . \
      --entry-point listUserPlaylists \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest
    ```

*   **`getWatchLaterPlaylist`**
    ```bash
    gcloud functions deploy getWatchLaterPlaylist \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source . \
      --entry-point getWatchLaterPlaylist \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest
    ```

### 7.2 Deploying Cloud Run Service (`gemini-chat-service`)
1.  **Create Artifact Registry Docker repository (if not done):**
    ```bash
    gcloud artifacts repositories create yt-watchlater-ai-repo \
      --repository-format=docker \
      --location=YOUR_REGION \
      --description="Docker repository for ReelWorthy services" \
      --project="YOUR_PROJECT_ID"
    ```
2.  **Build and Push Docker Image:**
    (Navigate to project root)
    ```bash
    gcloud builds submit --tag YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/yt-watchlater-ai-repo/gemini-chat-service:vX gemini-chat-service/ --project YOUR_PROJECT_ID
    ```
    (Replace `vX` with a version tag, e.g., `v1`, `v2`)

3.  **Deploy to Cloud Run:**
    ```bash
    gcloud run deploy gemini-chat-service \
      --image YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/yt-watchlater-ai-repo/gemini-chat-service:vX \
      --platform managed \
      --region YOUR_REGION \
      --allow-unauthenticated \
      --port 8080 \
      --min-instances 0 \
      --max-instances 1 \
      --cpu 1 \
      --memory 512Mi \
      --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
      --service-account youtube-watchlater-fn@YOUR_PROJECT_ID.iam.gserviceaccount.com \
      --project YOUR_PROJECT_ID
    ```
    *Note the Service URL. This will be your `WEBSOCKET_SERVICE_URL` (prepended with `wss://`).*

## 8. Deploying Frontend (Firebase Hosting)

1.  **Initialize Firebase (if not already done for the project):**
    Navigate to your main project directory (e.g., `YTWatchLaterAI/`).
    Run `firebase init hosting`.
    *   Select "Use an existing project" and choose your Firebase project.
    *   What do you want to use as your public directory? `frontend/build`
    *   Configure as a single-page app (rewrite all urls to /index.html)? `Yes`
    *   Set up automatic builds and deploys with GitHub? `No` (for now, can be set up later).
2.  **Build the React App:**
    ```bash
    cd frontend
    npm run build
    ```
3.  **Deploy to Firebase Hosting:**
    (From the main project directory `YTWatchLaterAI/` or ensure `firebase.json` points to `frontend/build`)
    ```bash
    firebase deploy --only hosting
    ```
    Or, if your `firebase.json` is in the root and configured for `frontend/build`:
    ```bash
    firebase deploy --only hosting
    ```

## 9. Datastore Index Setup
The `index.yaml` file in the project root defines necessary Datastore indexes (e.g., for querying `Videos` by `associatedPlaylistIds`). Deploy it using:
```bash
gcloud datastore indexes create index.yaml --project YOUR_PROJECT_ID
```
Wait for indexes to build before relying on queries that need them.

## 10. Final Configuration Checks
1.  Ensure all Cloud Function URLs and the Cloud Run WebSocket URL are correctly configured in your frontend code (ideally via environment variables loaded into your hooks/`App.js`).
2.  Verify OAuth Redirect URIs in Google Cloud Console match your deployed `handleYouTubeAuth` function URL and your Firebase Hosting URL is in Authorized JavaScript Origins.
3.  Test the entire application flow: Login, YouTube Connect, playlist selection, chat.

## 11. Example `cloudbuild.yaml` (CI/CD)
This example demonstrates deploying all services.

```yaml
# YTWatchLaterAI/cloudbuild.yaml
steps:
  # Deploy Cloud Functions
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'handleYouTubeAuth', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/handleYouTubeAuth', '--entry-point=handleYouTubeAuth', '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'checkUserAuthorization', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/checkUserAuthorization', '--entry-point=checkUserAuthorization']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'listUserPlaylists', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/listUserPlaylists', '--entry-point=listUserPlaylists', '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'getWatchLaterPlaylist', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/getWatchLaterPlaylist', '--entry-point=getWatchLaterPlaylist', '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest']

  # Build and Push gemini-chat-service Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA', './gemini-chat-service']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA']

  # Deploy gemini-chat-service to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - 'run'
      - 'deploy'
      - 'gemini-chat-service'
      - '--image=us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA'
      - '--platform=managed'
      - '--region=us-central1'
      - '--allow-unauthenticated'
      - '--port=8080'
      - '--min-instances=0' # Consider 1 for faster cold starts if budget allows
      - '--max-instances=1' # Adjust based on expected load
      - '--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest'
      - '--service-account=youtube-watchlater-fn@${PROJECT_ID}.iam.gserviceaccount.com' # Ensure this SA exists
      - '--project=${PROJECT_ID}'

  # Build Frontend
  - name: 'node:18' # Or your preferred Node version for building
    entrypoint: 'npm'
    args: ['install']
    dir: 'frontend'
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['run', 'build']
    dir: 'frontend'
    # Set REACT_APP environment variables here if needed for build time, e.g.
    # env:
    #   - 'REACT_APP_WEBSOCKET_URL=wss://your-gemini-chat-url' 

  # Deploy Frontend to Firebase Hosting
  - name: 'gcr.io/firebase/firebase'
    args: ['deploy', '--only=hosting', '--project=${PROJECT_ID}']
    # This assumes firebase.json is configured correctly and firebase tools are authenticated in the build environment.

images:
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA'
```
To run this Cloud Build configuration:
```bash
gcloud builds submit --config cloudbuild.yaml . --project YOUR_PROJECT_ID
```
(Replace `YOUR_PROJECT_ID` and `YOUR_REGION` where appropriate).

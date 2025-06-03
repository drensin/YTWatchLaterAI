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
*   **Node.js and npm:** Installed locally (v18+ for backend Cloud Functions, v20 for Cloud Run service if using a newer base image).
*   **Docker:** Installed locally (if building `gemini-chat-service` image locally or for Cloud Run deployment).
*   **Google Cloud Project:** A project with billing enabled.
*   **Firebase Project:** Linked to your Google Cloud Project.

## 2. Google Cloud Project Setup

1.  **Project ID:** Note your Google Cloud Project ID (e.g., `watchlaterai-460918`).
2.  **Region:** Choose a region for your services (e.g., `us-central1`). This should be consistent across services where possible.
3.  **Enable APIs:** In the Google Cloud Console, enable the following APIs for your project:
    *   YouTube Data API v3
    *   Identity Platform API (used by Firebase Authentication)
    *   Secret Manager API
    *   Cloud Datastore API (ensure you select **"Native mode"** if prompted, not "Firestore in Datastore mode" unless specifically intended for that)
    *   Cloud Functions API
    *   Cloud Run API
    *   Cloud Build API (if using Cloud Build for CI/CD)
    *   Artifact Registry API (for Docker images)
    *   Generative Language API (used by `gemini-chat-service`).
4.  **OAuth Consent Screen:**
    *   Navigate to "APIs & Services" > "OAuth consent screen".
    *   User Type: "External".
    *   App information: Fill in app name (e.g., "ReelWorthy"), user support email, developer contact information.
    *   Scopes: Click "Add or Remove Scopes". Add the `https://www.googleapis.com/auth/youtube.readonly` scope.
    *   Test users: While in "Testing" publishing status, add email addresses of users who can test the app.
5.  **OAuth 2.0 Client ID:**
    *   Navigate to "APIs & Services" > "Credentials".
    *   Click "+ CREATE CREDENTIALS" > "OAuth client ID".
    *   Application type: "Web application".
    *   Name: e.g., "ReelWorthy Web Client".
    *   **Authorized JavaScript origins:**
        *   `http://localhost:3000` (for local frontend development)
        *   Your Firebase Hosting URL (e.g., `https://YOUR_PROJECT_ID.web.app`)
    *   **Authorized redirect URIs:**
        *   The URL of your deployed `handleYouTubeAuth` Cloud Function. You will get this URL *after* its first deployment (e.g., `https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/handleYouTubeAuth`).
    *   Save the **Client ID** and **Client Secret**. These will be stored in Secret Manager.

## 3. Firebase Project Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and add a project, linking it to your existing Google Cloud Project if you haven't already.
2.  **Authentication:**
    *   Navigate to "Authentication" (Build section) > "Sign-in method".
    *   Enable the "Google" provider.
    *   Ensure the web SDK configuration is available (Project Settings > General > Your apps > Web app).
3.  **Hosting:**
    *   Navigate to "Hosting" (Build section). Click "Get started".
    *   Follow the steps. This typically involves running `firebase init hosting` in your `frontend` directory later.
    *   Note your default Firebase Hosting site URL (e.g., `https://YOUR_PROJECT_ID.web.app`).
4.  **Datastore:** Ensure Datastore is enabled in your Google Cloud Project (see step 2.3). No specific Firebase setup is needed for Datastore itself, as it's a GCP service.

## 4. Secret Manager Setup

In Google Cloud Secret Manager, create the following secrets. The service accounts for your Cloud Functions and Cloud Run service will need access to these.
*   `YOUTUBE_CLIENT_ID`: The OAuth Client ID obtained in step 2.5.
*   `YOUTUBE_CLIENT_SECRET`: The OAuth Client Secret obtained in step 2.5.
*   `GEMINI_API_KEY`: Your API key for the Google AI Gemini API (used by `gemini-chat-service`).

## 5. Service Account Permissions

*   **Cloud Functions Default Service Account:** Usually `YOUR_PROJECT_ID@appspot.gserviceaccount.com`. You can also create and assign a dedicated service account per function or for all functions.
*   **Cloud Run Service Account for `gemini-chat-service`:** It's recommended to use a dedicated service account with minimal privileges (e.g., `gemini-chat-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com`). If not specified during deployment, it might use the default Compute Engine service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`).

Grant the following roles to the respective service accounts:
*   **Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`):**
    *   Grant to Cloud Functions service account(s) for `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `GEMINI_API_KEY` (as `checkUserAuthorization` now uses it).
    *   Grant to Cloud Run service account for `GEMINI_API_KEY`.
*   **Cloud Datastore User (`roles/datastore.user`):**
    *   Grant to Cloud Functions service account(s) (for all functions interacting with Datastore).
    *   Grant to Cloud Run service account (for `gemini-chat-service`).

Example `gcloud` command to grant a role to a service account for a specific secret:
```bash
gcloud secrets add-iam-policy-binding SECRET_NAME \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --project="YOUR_PROJECT_ID"
# Example:
# gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member="serviceAccount:gemini-chat-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --project="YOUR_PROJECT_ID"
```
Example `gcloud` command to grant a project-level role:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="ROLE_NAME"
# Example:
# gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member="serviceAccount:YOUR_PROJECT_ID@appspot.gserviceaccount.com" --role="roles/datastore.user"
```
Repeat for all necessary secrets, service accounts, and roles.

## 6. Code Configuration & Placeholders

*   **Frontend Environment Variables:**
    *   The `frontend/src/firebase.js` file currently has hardcoded Firebase configuration. **It is strongly recommended to move these to environment variables.** Create a `.env` file in the `frontend/` directory (you can copy from `frontend/.env.example` if one is provided later, or create it manually).
        ```env
        REACT_APP_FIREBASE_API_KEY="your-firebase-api-key"
        REACT_APP_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
        REACT_APP_FIREBASE_PROJECT_ID="your-project-id"
        REACT_APP_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
        REACT_APP_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
        REACT_APP_FIREBASE_APP_ID="your-app-id"

        REACT_APP_YOUTUBE_CLIENT_ID="your-google-oauth-client-id" # Public client ID for frontend

        # Backend URLs (replace with your actual deployed function/service URLs)
        REACT_APP_CHECK_USER_AUTHORIZATION_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/checkUserAuthorization"
        REACT_APP_LIST_USER_PLAYLISTS_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/listUserPlaylists"
        REACT_APP_GET_PLAYLIST_ITEMS_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/getWatchLaterPlaylist"
        REACT_APP_HANDLE_YOUTUBE_AUTH_URL_FOR_HOOK="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/handleYouTubeAuth" # Used by useYouTube hook
        REACT_APP_WEBSOCKET_SERVICE_URL="wss://your-gemini-chat-service-xxxxxxxxxx-uc.a.run.app" # Replace with your Cloud Run service URL
        ```
    *   Update `frontend/src/firebase.js` to use these `REACT_APP_FIREBASE_...` environment variables.
    *   Update the frontend hooks (`useAuth.js`, `useYouTube.js`, `useWebSocketChat.js`) to use the respective `REACT_APP_...` environment variables for backend URLs instead of hardcoded values.
*   **Backend Redirect URIs:**
    *   The `REDIRECT_URI` in `backend/handleYouTubeAuth/index.js` (and potentially other functions if they were to initiate OAuth, though currently only `handleYouTubeAuth` is the callback) is constructed using `process.env.GOOGLE_CLOUD_PROJECT || 'watchlaterai-460918'`. Ensure `GOOGLE_CLOUD_PROJECT` is correctly set for your deployed functions (usually automatic) or update the fallback project ID if necessary. This `REDIRECT_URI` for `handleYouTubeAuth` *must* exactly match one of the "Authorized redirect URIs" in your Google OAuth Client settings.
*   **Allowed Frontend Origins in `handleYouTubeAuth`**:
    *   Update the `ALLOWED_FRONTEND_ORIGINS` array in `backend/handleYouTubeAuth/index.js` to include your production Firebase Hosting URL.

## 7. Deploying Backend Services

Navigate to the root directory of the project (`YTWatchLaterAI/`) for these commands.

### 7.1 Deploying Cloud Functions
For each function in the `backend/` subdirectories:
*   **`handleYouTubeAuth`**
    ```bash
    gcloud functions deploy handleYouTubeAuth \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source ./backend/handleYouTubeAuth \
      --entry-point handleYouTubeAuth \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,FRONTEND_URL=https://YOUR_PROJECT_ID.web.app # Add your frontend URL
    ```
    *After deployment, note its HTTP trigger URL. Update your Google OAuth Client's "Authorized redirect URIs" with this URL.*

*   **`checkUserAuthorization`**
    ```bash
    gcloud functions deploy checkUserAuthorization \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source ./backend/checkUserAuthorization \
      --entry-point checkUserAuthorization \
      --project YOUR_PROJECT_ID \
      --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```

*   **`listUserPlaylists`**
    ```bash
    gcloud functions deploy listUserPlaylists \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source ./backend/listUserPlaylists \
      --entry-point listUserPlaylists \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```

*   **`getWatchLaterPlaylist`**
    ```bash
    gcloud functions deploy getWatchLaterPlaylist \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region YOUR_REGION \
      --source ./backend/getWatchLaterPlaylist \
      --entry-point getWatchLaterPlaylist \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```
    *(Replace `YOUR_REGION` and `YOUR_PROJECT_ID` accordingly)*

### 7.2 Deploying Cloud Run Service (`gemini-chat-service`)
1.  **Create Artifact Registry Docker repository (if it doesn't exist):**
    ```bash
    gcloud artifacts repositories create yt-watchlater-ai-repo \
      --repository-format=docker \
      --location=YOUR_REGION \
      --description="Docker repository for ReelWorthy services" \
      --project="YOUR_PROJECT_ID"
    ```
    *(Replace `YOUR_REGION` and `YOUR_PROJECT_ID`)*

2.  **Build and Push Docker Image:**
    (From the project root `YTWatchLaterAI/`)
    ```bash
    gcloud builds submit --tag YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/yt-watchlater-ai-repo/gemini-chat-service:v1 gemini-chat-service/ --project YOUR_PROJECT_ID
    ```
    *(Replace `v1` with your desired version tag. `YOUR_REGION` and `YOUR_PROJECT_ID` should match)*

3.  **Deploy to Cloud Run:**
    ```bash
    gcloud run deploy gemini-chat-service \
      --image YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/yt-watchlater-ai-repo/gemini-chat-service:v1 \
      --platform managed \
      --region YOUR_REGION \
      --allow-unauthenticated \
      --port 8080 `# Ensure your Dockerfile EXPOSEs this port and server.js listens on process.env.PORT || 8080` \
      --min-instances 0 `# Or 1 for faster cold starts` \
      --max-instances 2 `# Adjust based on expected load` \
      --cpu 1 \
      --memory 512Mi \
      --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
      --service-account YOUR_DEDICATED_SERVICE_ACCOUNT_EMAIL `# e.g., gemini-chat-runner@YOUR_PROJECT_ID.iam.gserviceaccount.com` \
      --project YOUR_PROJECT_ID \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```
    *Note the Service URL. This will be your `WEBSOCKET_SERVICE_URL` (prepended with `wss://` and path if any, though this service listens at root).*

## 8. Deploying Frontend (Firebase Hosting)

1.  **Initialize Firebase Hosting (if not already done):**
    Navigate to your `frontend/` directory.
    Run `firebase init hosting`.
    *   Select "Use an existing project" and choose your Firebase project.
    *   What do you want to use as your public directory? `build` (This is the default for Create React App).
    *   Configure as a single-page app (rewrite all urls to /index.html)? `Yes`.
    *   Set up automatic builds and deploys with GitHub? `No` (for now, can be set up later).
    This will create `firebase.json` and `.firebaserc` in the `frontend/` directory.
2.  **Build the React App:**
    (Still in `frontend/` directory)
    ```bash
    npm install 
    npm run build
    ```
3.  **Deploy to Firebase Hosting:**
    (Still in `frontend/` directory)
    ```bash
    firebase deploy --only hosting
    ```

## 9. Datastore Index Setup
The `index.yaml` file in the project root defines necessary Datastore indexes (e.g., for querying `Videos` by `associatedPlaylistIds`). Deploy it using:
```bash
gcloud datastore indexes create index.yaml --project YOUR_PROJECT_ID
```
Wait for indexes to build (can take some time) before relying on queries that need them. You can check status in the Google Cloud Console under Datastore > Indexes.

## 10. Final Configuration Checks
1.  **Frontend URLs:** Ensure all Cloud Function URLs and the Cloud Run WebSocket URL are correctly configured in your frontend code, ideally via the `.env` file and `process.env.REACT_APP_...` variables.
2.  **OAuth Credentials:** Verify Authorized JavaScript Origins and Authorized Redirect URIs in your Google Cloud OAuth Client settings match your deployed frontend and `handleYouTubeAuth` function URL respectively.
3.  **CORS:** Double-check CORS settings in your Cloud Functions. For production, restrict `Access-Control-Allow-Origin` to your Firebase Hosting URL.
4.  **Allow-List:** Populate the `AuthorizedEmail` Kind in Datastore with emails of users who should have access.
5.  **Test:** Thoroughly test the entire application flow: Login, YouTube Connect, playlist listing, playlist item fetching, and AI chat functionality.

## 11. Example `cloudbuild.yaml` (CI/CD)
This example demonstrates deploying all services. Ensure your Cloud Build service account (`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`) has necessary roles (Cloud Functions Developer, Cloud Run Admin, Service Account User for deploying with specific SA, Artifact Registry Writer, Firebase Admin for hosting).

```yaml
# YTWatchLaterAI/cloudbuild.yaml
steps:
  # Deploy Cloud Functions
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'handleYouTubeAuth', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/handleYouTubeAuth', '--entry-point=handleYouTubeAuth', '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest', '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID},FRONTEND_URL=https://${PROJECT_ID}.web.app']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'checkUserAuthorization', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/checkUserAuthorization', '--entry-point=checkUserAuthorization', '--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest', '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID}']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'listUserPlaylists', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/listUserPlaylists', '--entry-point=listUserPlaylists', '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest', '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID}']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: ['functions', 'deploy', 'getWatchLaterPlaylist', '--project=${PROJECT_ID}', '--region=us-central1', '--runtime=nodejs20', '--trigger-http', '--allow-unauthenticated', '--source=./backend/getWatchLaterPlaylist', '--entry-point=getWatchLaterPlaylist', '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest', '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID}']

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
      - '--port=8080' # Application should listen on process.env.PORT
      - '--min-instances=0' 
      - '--max-instances=2' 
      - '--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest'
      - '--service-account=YOUR_DEDICATED_SERVICE_ACCOUNT_EMAIL_FOR_GEMINI_CHAT' # e.g., gemini-chat-runner@${PROJECT_ID}.iam.gserviceaccount.com
      - '--project=${PROJECT_ID}'
      - '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID}'


  # Build Frontend (assuming .env file is NOT checked in, so vars must be available at build time if needed by build script)
  - name: 'node:20' 
    entrypoint: 'npm'
    args: ['install']
    dir: 'frontend'
  - name: 'node:20'
    entrypoint: 'npm'
    args: ['run', 'build']
    dir: 'frontend'
    # Example of setting build-time env vars for React app:
    # env:
    #   - 'REACT_APP_WEBSOCKET_SERVICE_URL=wss://your-gemini-chat-service-url.a.run.app'
    #   - 'REACT_APP_LIST_USER_PLAYLISTS_URL=https://...' 

  # Deploy Frontend to Firebase Hosting
  - name: 'gcr.io/firebase/firebase'
    args: ['deploy', '--only=hosting', '--project=${PROJECT_ID}']
    # This assumes firebase.json is in the root and configured for frontend/build, or that the working directory is set appropriately.
    # If firebase.json is in frontend/, adjust dir or command.

images:
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA'

# Available substitutions: https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values
# Common ones: $PROJECT_ID, $SHORT_SHA, $COMMIT_SHA, $REPO_NAME, $BRANCH_NAME, $TAG_NAME
# Ensure your Cloud Build service account has permissions for all services it interacts with.
```
To run this Cloud Build configuration:
```bash
gcloud builds submit --config cloudbuild.yaml . --project YOUR_PROJECT_ID
```
(Replace `YOUR_PROJECT_ID`, `YOUR_REGION`, and `YOUR_DEDICATED_SERVICE_ACCOUNT_EMAIL_FOR_GEMINI_CHAT` where appropriate).

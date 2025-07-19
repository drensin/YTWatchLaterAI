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
    *   [Create Pub/Sub Topic](#72-create-pubsub-topic-if-not-already-created)
    *   [Cloud Run Service (`gemini-chat-service`)](#73-deploying-cloud-run-service-gemini-chat-service)
8.  [Deploying Frontend (Firebase Hosting)](#8-deploying-frontend-firebase-hosting)
9.  [Datastore Index Setup](#9-datastore-index-setup)
10. [Create Cloud Scheduler Job](#10-create-cloud-scheduler-job)
11. [Final Configuration Checks](#11-final-configuration-checks)
12. [Automated Deployment Script (`deploy.sh`)](#12-automated-deployment-script-deploysh)
13. [Example `cloudbuild.yaml` (CI/CD)](#13-example-cloudbuildyaml-cicd)

---

## 1. Prerequisites

*   **Google Cloud SDK (`gcloud` CLI):** Installed and authenticated.
    *   Login: `gcloud auth login`
    *   Set project: `gcloud config set project YOUR_PROJECT_ID` (replace `YOUR_PROJECT_ID`)
*   **Firebase CLI:** Installed (`npm install -g firebase-tools`) and authenticated (`firebase login`).
*   **Node.js and npm:** Installed locally (v20 recommended for backend Cloud Functions and Cloud Run service).
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
    *   Cloud Datastore API (ensure you select **"Native mode"** if prompted)
    *   Cloud Functions API
    *   Cloud Run API
    *   Cloud Build API (if using Cloud Build for CI/CD)
    *   Artifact Registry API (for Docker images)
    *   **Generative Language API** (used by `gemini-chat-service` with the `@google/generative-ai` SDK)
    *   Cloud Pub/Sub API
    *   Cloud Scheduler API
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
*   `GEMINI_API_KEY`: Your API key for the Google AI Gemini API (used by `@google/generative-ai` SDK).

## 5. Service Account Permissions

*   **Cloud Functions Default Service Account:** Usually `YOUR_PROJECT_ID@appspot.gserviceaccount.com` or `PROJECT_NUMBER-compute@developer.gserviceaccount.com` for Gen 2 functions. You can also create and assign a dedicated service account.
*   **Cloud Run Service Account for `gemini-chat-service`:** It's recommended to use a dedicated service account (e.g., `youtube-watchlater-fn@watchlaterai-460918.iam.gserviceaccount.com`). If not specified during deployment, it might use the default Compute Engine service account.

Grant the following roles to the respective service accounts:
*   **Secret Manager Secret Accessor (`roles/secretmanager.secretAccessor`):**
    *   Grant to Cloud Functions service account(s) for `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` (used by `handleYouTubeAuth`, `listUserPlaylists`, `getWatchLaterPlaylist`, `fetchUserSubscriptionFeed`) and `GEMINI_API_KEY` (used by `checkUserAuthorization`).
    *   Grant to Cloud Run service account for `GEMINI_API_KEY`.
*   **Cloud Datastore User (`roles/datastore.user`):**
    *   Grant to Cloud Functions service account(s) (for all functions interacting with Datastore).
    *   Grant to Cloud Run service account (for `gemini-chat-service`).
*   **Pub/Sub Publisher (`roles/pubsub.publisher`):**
    *   Grant to Cloud Functions service account(s) for `requestSubscriptionFeedUpdate` and `scheduleAllUserFeedUpdates`.
*   **Cloud Functions Invoker (`roles/cloudfunctions.invoker`):**
    *   Grant to the service account used by Cloud Scheduler (e.g., the default compute SA or a custom one like `youtube-watchlater-fn@watchlaterai-460918.iam.gserviceaccount.com`) for the `scheduleAllUserFeedUpdates` function.

Example `gcloud` command to grant a role to a service account for a specific secret:
```bash
gcloud secrets add-iam-policy-binding SECRET_NAME \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --project="YOUR_PROJECT_ID"
```
Example `gcloud` command to grant a project-level role:
```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
    --role="ROLE_NAME"
```
Repeat for all necessary secrets, service accounts, and roles.

## 6. Code Configuration & Placeholders

*   **Frontend Environment Variables:**
    *   Create a `.env` file in the `frontend/` directory.
        ```env
        REACT_APP_FIREBASE_API_KEY="your-firebase-api-key"
        REACT_APP_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
        REACT_APP_FIREBASE_PROJECT_ID="your-project-id"
        REACT_APP_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
        REACT_APP_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
        REACT_APP_FIREBASE_APP_ID="your-app-id"

        REACT_APP_YOUTUBE_CLIENT_ID="your-google-oauth-client-id" # Used by frontend for OAuth initiation if needed directly

        REACT_APP_CHECK_USER_AUTHORIZATION_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/checkUserAuthorization"
        REACT_APP_LIST_USER_PLAYLISTS_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/listUserPlaylists"
        REACT_APP_GET_PLAYLIST_ITEMS_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/getWatchLaterPlaylist" # Note: function name is generic
        REACT_APP_HANDLE_YOUTUBE_AUTH_URL_FOR_HOOK="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/handleYouTubeAuth" # Used by useYouTube hook to construct redirect_uri for Google
        REACT_APP_REQUEST_SUBSCRIPTION_FEED_UPDATE_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/requestSubscriptionFeedUpdate"
        REACT_APP_WEBSOCKET_SERVICE_URL="wss://your-gemini-chat-service-xxxxxxxxxx-uc.a.run.app" # Cloud Run service URL
        ```
    *   Ensure `frontend/src/firebase.js` and relevant hooks use these environment variables.
*   **Backend Redirect URIs:**
    *   The `handleYouTubeAuth` Cloud Function constructs its `REDIRECT_URI`. Ensure `GOOGLE_CLOUD_PROJECT` is correctly set as an environment variable for this deployed function. This `REDIRECT_URI` *must* match an "Authorized redirect URI" in Google OAuth Client settings.
*   **Allowed Frontend Origins in Cloud Functions**:
    *   Update `ALLOWED_FRONTEND_ORIGINS` in `backend/handleYouTubeAuth/index.js` to include your Firebase Hosting URL and `http://localhost:3000`.
    *   The `requestSubscriptionFeedUpdate/index.js` should also have its CORS origins restricted in production.

## 7. Deploying Backend Services

Navigate to the root directory of the project (`YTWatchLaterAI/`) for these commands. (Replace `YOUR_REGION` and `YOUR_PROJECT_ID` accordingly).

### 7.1 Deploying Cloud Functions
(All functions use `--runtime nodejs20` and `--allow-unauthenticated` for simplicity here. For production, enforce authentication, e.g., by requiring Firebase ID tokens via API Gateway or directly in functions.)

*   **`handleYouTubeAuth`**
    ```bash
    gcloud functions deploy handleYouTubeAuth \
      --runtime nodejs20 --trigger-http --allow-unauthenticated \
      --region YOUR_REGION --source ./backend/handleYouTubeAuth --entry-point handleYouTubeAuth \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,FRONTEND_URL=https://YOUR_PROJECT_ID.web.app
    ```
    *After deployment, update Google OAuth Client's "Authorized redirect URIs" with its URL.*

*   **`checkUserAuthorization`**
    ```bash
    gcloud functions deploy checkUserAuthorization \
      --runtime nodejs20 --trigger-http --allow-unauthenticated \
      --region YOUR_REGION --source ./backend/checkUserAuthorization --entry-point checkUserAuthorization \
      --project YOUR_PROJECT_ID --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```

*   **`listUserPlaylists`**
    ```bash
    gcloud functions deploy listUserPlaylists \
      --runtime nodejs20 --trigger-http --allow-unauthenticated \
      --region YOUR_REGION --source ./backend/listUserPlaylists --entry-point listUserPlaylists \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```

*   **`getWatchLaterPlaylist`** (Generic name for fetching any playlist items)
    ```bash
    gcloud functions deploy getWatchLaterPlaylist \
      --runtime nodejs20 --trigger-http --allow-unauthenticated \
      --region YOUR_REGION --source ./backend/getWatchLaterPlaylist --entry-point getWatchLaterPlaylist \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```

*   **`requestSubscriptionFeedUpdate`**
    ```bash
    gcloud functions deploy requestSubscriptionFeedUpdate \
      --runtime nodejs20 --trigger-http --allow-unauthenticated \
      --region YOUR_REGION --source ./backend/requestSubscriptionFeedUpdate --entry-point requestSubscriptionFeedUpdate \
      --project YOUR_PROJECT_ID \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,FRONTEND_URL=https://YOUR_PROJECT_ID.web.app
    ```

*   **`scheduleAllUserFeedUpdates` (Scheduler Target)**
    ```bash
    gcloud functions deploy scheduleAllUserFeedUpdates \
      --runtime nodejs20 --trigger-http --allow-unauthenticated \
      --region YOUR_REGION --source ./backend/scheduleAllUserFeedUpdates --entry-point scheduleAllUserFeedUpdates \
      --project YOUR_PROJECT_ID --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```
    *Note its HTTP trigger URL for the Cloud Scheduler job.*

*   **`fetchUserSubscriptionFeed` (Pub/Sub Triggered)**
    ```bash
    gcloud functions deploy fetchUserSubscriptionFeed \
      --runtime nodejs20 --trigger-topic user-feed-update-requests \
      --region YOUR_REGION --source ./backend/fetchUserSubscriptionFeed --entry-point fetchUserSubscriptionFeed \
      --project YOUR_PROJECT_ID \
      --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
      --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```

### 7.2 Create Pub/Sub Topic (if not already created)
```bash
gcloud pubsub topics create user-feed-update-requests --project YOUR_PROJECT_ID
```

### 7.3 Deploying Cloud Run Service (`gemini-chat-service`)
1.  **Create Artifact Registry Docker repository (if needed):**
    ```bash
    gcloud artifacts repositories create yt-watchlater-ai-repo \
      --repository-format=docker --location=YOUR_REGION \
      --description="Docker repository for ReelWorthy services" --project="YOUR_PROJECT_ID"
    ```
2.  **Build and Push Docker Image:** (From project root `YTWatchLaterAI/`)
    ```bash
    # Example: gcloud builds submit --tag us-central1-docker.pkg.dev/watchlaterai-460918/yt-watchlater-ai-repo/gemini-chat-service:v2.4-data-indicator gemini-chat-service/ --project watchlaterai-460918
    gcloud builds submit --tag YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/yt-watchlater-ai-repo/gemini-chat-service:YOUR_TAG gemini-chat-service/ --project YOUR_PROJECT_ID
    ```
3.  **Deploy to Cloud Run:**
    ```bash
    gcloud run deploy gemini-chat-service \
      --image YOUR_REGION-docker.pkg.dev/YOUR_PROJECT_ID/yt-watchlater-ai-repo/gemini-chat-service:YOUR_TAG \
      --platform managed --region YOUR_REGION --allow-unauthenticated \
      --port 8080 --min-instances 0 --max-instances 1 --cpu 1 --memory 512Mi \
      --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
      --service-account YOUR_SERVICE_ACCOUNT_EMAIL_FOR_CHAT_SERVICE \
      --project YOUR_PROJECT_ID --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
    ```
    *(Replace `YOUR_TAG` with your latest image tag, e.g., `v2.4-data-indicator`)*.  
    *(Replace `YOUR_SERVICE_ACCOUNT_EMAIL_FOR_CHAT_SERVICE` with the service account used by Cloud Run, e.g., `youtube-watchlater-fn@watchlaterai-460918.iam.gserviceaccount.com`)*.  
    *Note the Service URL for `REACT_APP_WEBSOCKET_SERVICE_URL` (it will be `wss://` for WebSocket Secure).*

## 8. Deploying Frontend (Firebase Hosting)

1.  **Initialize Firebase Hosting (if not done):** (In `frontend/` directory)
    `firebase init hosting` (select existing project, public directory: `build`, configure as a single-page app: `Yes`).
2.  **Build React App:** (In `frontend/` directory)
    ```bash
    npm install 
    npm run build
    ```
3.  **Deploy to Firebase Hosting:** (In `frontend/` directory)
    ```bash
    firebase deploy --only hosting
    ```

## 9. Datastore Index Setup
The `index.yaml` file in the project root defines necessary Datastore indexes. Deploy it using:
```bash
gcloud datastore indexes create index.yaml --project YOUR_PROJECT_ID
```
Wait for indexes to build. The `UserSubscriptionFeedCache` kind has `videos[].description` excluded from indexing by the application code.

## 10. Create Cloud Scheduler Job
After `scheduleAllUserFeedUpdates` Cloud Function is deployed and you have its URL:
```bash
gcloud scheduler jobs create http TriggerSubscriptionFeedUpdates \
  --schedule "0 3,15 * * *" \
  --uri "https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/scheduleAllUserFeedUpdates" \
  --http-method POST \
  --time-zone "Etc/UTC" \
  --description "Triggers updates for all user subscription feeds twice daily." \
  --project YOUR_PROJECT_ID \
  --oidc-service-account-email YOUR_SERVICE_ACCOUNT_EMAIL_FOR_SCHEDULER \
  --location YOUR_REGION
```
*(Replace placeholders. `YOUR_SERVICE_ACCOUNT_EMAIL_FOR_SCHEDULER` is the service account Cloud Scheduler will use to invoke the function, e.g., `youtube-watchlater-fn@watchlaterai-460918.iam.gserviceaccount.com` if it has invoker rights on the function.)*

## 11. Final Configuration Checks
1.  **Frontend URLs:** Ensure all backend URLs in frontend `.env` are correct and use `https://`. The WebSocket URL should use `wss://`.
2.  **OAuth Credentials:** Verify Authorized JavaScript Origins and Redirect URIs in Google Cloud Console.
3.  **CORS:** Review Cloud Function CORS settings for production; restrict origins.
4.  **Allow-List:** Populate `AuthorizedEmail` Kind in Datastore with emails of authorized users.
5.  **Test:** Thoroughly test the entire application flow.

## 12. Automated Deployment Script (`deploy.sh`)

This project includes a `deploy.sh` script that automates all the deployment steps mentioned above (Cloud Functions, Cloud Run, and Firebase Hosting). This is the recommended method for a streamlined deployment.

### a. Create Deployment Environment File

The script requires a `.env.deploy` file in the project root (`YTWatchLaterAI/`) to be populated with your specific configuration variables.

Create this file and add the following content, replacing the placeholder values:

```sh
# .env.deploy
GCP_PROJECT_ID="your-gcp-project-id"
FIREBASE_PROJECT_ID="your-firebase-project-id" # Often the same as GCP_PROJECT_ID
GCP_REGION="us-central1" # Or your preferred region
DOCKER_REPO="yt-watchlater-ai-repo" # The name of your Artifact Registry repo
DOCKER_IMAGE_TAG="latest" # Or any tag you prefer, e.g., v1.0
SERVICE_ACCOUNT_EMAIL="your-service-account-email@your-project-id.iam.gserviceaccount.com"
```

### b. Make the Script Executable

You may need to grant execute permissions to the script:

```bash
chmod +x deploy.sh
```

### c. Run the Script

Execute the script from the project root directory:

```bash
./deploy.sh
```

The script will then proceed to deploy all backend and frontend services in the correct order.

---

## 13. Example `cloudbuild.yaml` (CI/CD)
This example demonstrates deploying all services. Ensure Cloud Build service account has necessary roles (Cloud Functions Admin, Cloud Run Admin, Pub/Sub Admin, Artifact Registry Writer, Firebase Admin, etc.).

```yaml
# YTWatchLaterAI/cloudbuild.yaml
steps:
  # Deploy Cloud Functions (example for one, repeat for others)
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: [
      'functions', 'deploy', 'handleYouTubeAuth', 
      '--project=${PROJECT_ID}', 
      '--region=us-central1', '--runtime=nodejs20', 
      '--trigger-http', '--allow-unauthenticated', 
      '--source=./backend/handleYouTubeAuth', '--entry-point=handleYouTubeAuth', 
      '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest', 
      '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID},FRONTEND_URL=https://${PROJECT_ID}.web.app'
    ]
  # ... add steps for all other functions ...
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: [
      'functions', 'deploy', 'fetchUserSubscriptionFeed',
      '--project=${PROJECT_ID}',
      '--region=us-central1', '--runtime=nodejs20',
      '--trigger-topic=user-feed-update-requests',
      '--source=./backend/fetchUserSubscriptionFeed', '--entry-point=fetchUserSubscriptionFeed',
      '--set-secrets=YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest',
      '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID}'
    ]

  # Create Pub/Sub topic (consider adding --quiet or checking existence in a real script)
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'bash'
    args: 
      - -c
      - |
        gcloud pubsub topics describe user-feed-update-requests --project=${PROJECT_ID} || \
        gcloud pubsub topics create user-feed-update-requests --project=${PROJECT_ID}

  # Build and Push gemini-chat-service Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA', './gemini-chat-service']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA']

  # Deploy gemini-chat-service to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args: [
      'run', 'deploy', 'gemini-chat-service',
      '--image=us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA',
      '--platform=managed', '--region=us-central1', '--allow-unauthenticated',
      '--port=8080', 
      '--min-instances=0', '--max-instances=1', '--cpu=1', '--memory=512Mi',
      '--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest',
      '--service-account=YOUR_SERVICE_ACCOUNT_EMAIL_FOR_CHAT_SERVICE', # e.g., youtube-watchlater-fn@watchlaterai-460918.iam.gserviceaccount.com
      '--project=${PROJECT_ID}',
      '--set-env-vars=GOOGLE_CLOUD_PROJECT=${PROJECT_ID}'
    ]

  # Build Frontend
  - name: 'node:20' 
    entrypoint: 'npm'
    args: ['install']
    dir: 'frontend'
  - name: 'node:20'
    entrypoint: 'npm'
    args: ['run', 'build']
    dir: 'frontend'
    env: # Pass build-time env vars for React app
      - 'REACT_APP_FIREBASE_API_KEY=${_REACT_APP_FIREBASE_API_KEY}'
      - 'REACT_APP_FIREBASE_AUTH_DOMAIN=${_REACT_APP_FIREBASE_AUTH_DOMAIN}'
      - 'REACT_APP_FIREBASE_PROJECT_ID=${PROJECT_ID}' # Can use GCP Project ID directly
      - 'REACT_APP_FIREBASE_STORAGE_BUCKET=${_REACT_APP_FIREBASE_STORAGE_BUCKET}'
      - 'REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${_REACT_APP_FIREBASE_MESSAGING_SENDER_ID}'
      - 'REACT_APP_FIREBASE_APP_ID=${_REACT_APP_FIREBASE_APP_ID}'
      - 'REACT_APP_YOUTUBE_CLIENT_ID=${_REACT_APP_YOUTUBE_CLIENT_ID}'
      - 'REACT_APP_CHECK_USER_AUTHORIZATION_URL=https://us-central1-${PROJECT_ID}.cloudfunctions.net/checkUserAuthorization'
      - 'REACT_APP_LIST_USER_PLAYLISTS_URL=https://us-central1-${PROJECT_ID}.cloudfunctions.net/listUserPlaylists'
      - 'REACT_APP_GET_PLAYLIST_ITEMS_URL=https://us-central1-${PROJECT_ID}.cloudfunctions.net/getWatchLaterPlaylist'
      - 'REACT_APP_HANDLE_YOUTUBE_AUTH_URL_FOR_HOOK=https://us-central1-${PROJECT_ID}.cloudfunctions.net/handleYouTubeAuth'
      - 'REACT_APP_REQUEST_SUBSCRIPTION_FEED_UPDATE_URL=https://us-central1-${PROJECT_ID}.cloudfunctions.net/requestSubscriptionFeedUpdate'
      - 'REACT_APP_WEBSOCKET_SERVICE_URL=wss://gemini-chat-service-${_CLOUD_RUN_HASH}-uc.a.run.app' # This needs dynamic resolution or a stable URL

  # Deploy Frontend to Firebase Hosting
  - name: 'gcr.io/firebase/firebase'
    args: ['deploy', '--only=hosting', '--project=${PROJECT_ID}']

images:
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA'

# Substitutions for Cloud Build (can be set in trigger or via --substitutions flag)
# _REACT_APP_FIREBASE_API_KEY
# _REACT_APP_FIREBASE_AUTH_DOMAIN
# _REACT_APP_FIREBASE_STORAGE_BUCKET
# _REACT_APP_FIREBASE_MESSAGING_SENDER_ID
# _REACT_APP_FIREBASE_APP_ID
# _REACT_APP_YOUTUBE_CLIENT_ID
# _CLOUD_RUN_HASH (if Cloud Run URL is not stable/custom-mapped)
# YOUR_SERVICE_ACCOUNT_EMAIL_FOR_CHAT_SERVICE
```
To run this Cloud Build configuration:
```bash
gcloud builds submit --config cloudbuild.yaml . --project YOUR_PROJECT_ID --substitutions=\
_REACT_APP_FIREBASE_API_KEY="your-key",\
_REACT_APP_FIREBASE_AUTH_DOMAIN="your-auth-domain",\
# ... and so on for all _VARIABLES
```
(Replace placeholders like `YOUR_PROJECT_ID`, `YOUR_REGION`, `YOUR_SERVICE_ACCOUNT_EMAIL_FOR_CHAT_SERVICE`, etc., where appropriate).
<environment_details>
# VSCode Visible Files
README.md

# VSCode Open Tabs
README.md

# Current Time
6/7/2025, 3:44:18 AM (America/Chicago, UTC-5:00)

# Context Window Usage
608,895 / 1,048.576K tokens used (58%)

# Current Mode
ACT MODE
</environment_details>

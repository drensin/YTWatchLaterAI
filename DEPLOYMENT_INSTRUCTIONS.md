# Deployment Instructions for ReelWorthy

This document provides instructions for deploying the backend Cloud Functions and notes on frontend deployment for ReelWorthy.

## Prerequisites

*   Google Cloud SDK (`gcloud`) installed and authenticated: `gcloud auth login` and `gcloud config set project watchlaterai-460918`.
*   Node.js and npm/yarn installed locally for managing dependencies if not using Cloud Build for everything.
*   Your Google Cloud Project ID (let's call it `watchlaterai-460918`).
*   The region you want to deploy your functions to (e.g., `us-central1`, let's call it `us-central1`).
*   GitHub repository set up for the frontend if using GitHub Pages.

## 1. Secret Manager Setup

Ensure you have created the following secrets in Google Cloud Secret Manager:
*   `YOUTUBE_CLIENT_ID`
*   `YOUTUBE_CLIENT_SECRET`
*   `GEMINI_API_KEY` (if using Gemini API directly)
*   `GCP_PROJECT_ID` (used by Vertex AI SDK, typically your project ID)

For each Cloud Function and the Cloud Run service, their respective runtime service accounts will need the "Secret Manager Secret Accessor" IAM role for these secrets.
*   Cloud Functions: When deploying a function for the first time, GCP often creates a default service account for it (e.g., `watchlaterai-460918@appspot.gserviceaccount.com` or a function-specific one).
*   Cloud Run: You can specify a service account or use the default Compute Engine service account (e.g., `PROJECT_NUMBER-compute@developer.gserviceaccount.com`).

You can grant this role:

```bash
# Replace watchlaterai-460918, YOUR_SECRET_NAME, and SERVICE_ACCOUNT_EMAIL

# Example for YOUTUBE_CLIENT_ID:
gcloud secrets add-iam-policy-binding YOUTUBE_CLIENT_ID \
    --member="serviceAccount:YOUR_FUNCTION_SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --project="watchlaterai-460918"

# Repeat for YOUTUBE_CLIENT_SECRET, GEMINI_API_KEY, GCP_PROJECT_ID and for each function's/service's service account.

# Example for granting GEMINI_API_KEY access to the default Compute Engine service account (often used by Cloud Run):
# Replace PROJECT_NUMBER with your actual project number.
# CLOUD_RUN_SERVICE_ACCOUNT_EMAIL="PROJECT_NUMBER-compute@developer.gserviceaccount.com" 
# gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member="serviceAccount:${CLOUD_RUN_SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"

# If using the default App Engine service account for Cloud Functions:
CF_SERVICE_ACCOUNT_EMAIL="watchlaterai-460918@appspot.gserviceaccount.com"
gcloud secrets add-iam-policy-binding YOUTUBE_CLIENT_ID --member="serviceAccount:${CF_SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"
gcloud secrets add-iam-policy-binding YOUTUBE_CLIENT_SECRET --member="serviceAccount:${CF_SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"
# GEMINI_API_KEY and GCP_PROJECT_ID might not be needed by all Cloud Functions if only Cloud Run uses Gemini.

```

## 2. Update Placeholders in Code

Before deploying, ensure all placeholders are updated in the function code:
*   `watchlaterai-460918` (Project ID) has been updated in the backend function files.
*   `drensin.github.io/YTWatchLaterAI/` (GitHub Pages URL) has been updated in backend function files and `frontend/package.json`.
*   `YOUR_HANDLE_YOUTUBE_AUTH_FUNCTION_URL`: This is a bit of a chicken-and-egg. You'll get this URL *after* deploying `handleYouTubeAuth` for the first time. You'll need to:
    1.  Deploy `handleYouTubeAuth` (perhaps with a dummy redirect URL initially).
    2.  Get its trigger URL.
    3.  Update `YOUR_HANDLE_YOUTUBE_AUTH_FUNCTION_URL` in `handleYouTubeAuth/index.js` and `getWatchLaterPlaylist/index.js`.
    4.  Update the OAuth consent screen settings in Google Cloud Console for your OAuth Client ID to include this Cloud Function URL as an "Authorized redirect URI".
    5.  Redeploy `handleYouTubeAuth` and `getWatchLaterPlaylist`.
    6.  Update `CLOUD_FUNCTIONS_BASE_URL.handleYouTubeAuth` in `frontend/src/App.js`.
    7.  The `chatWithPlaylist` Cloud Function URL is no longer used; instead, `frontend/src/App.js` uses `WEBSOCKET_SERVICE_URL` for the Cloud Run service.


## 3. Deploying Backend Services

### 3.1 Deploying Cloud Functions using `gcloud`

Navigate to each function's directory in your terminal (e.g., `cd backend/handleYouTubeAuth`).

**General Deployment Command Structure:**

```bash
gcloud functions deploy YOUR_FUNCTION_NAME \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region us-central1 \
  --source . \
  --entry-point YOUR_FUNCTION_ENTRY_POINT \
  --project watchlaterai-460918
  # Optional: --service-account YOUR_FUNCTION_SERVICE_ACCOUNT_EMAIL
  # Optional: --set-env-vars KEY1=VALUE1,KEY2=VALUE2 (if not using Secret Manager for some configs)
```

**Specific Commands:**

*   **`handleYouTubeAuth`**
    ```bash
    cd backend/handleYouTubeAuth
    gcloud functions deploy handleYouTubeAuth \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region us-central1 \
      --source . \
      --entry-point handleYouTubeAuth \
      --project watchlaterai-460918
    ```
    *After deployment, note its HTTP trigger URL.*

*   **`getWatchLaterPlaylist`**
    ```bash
    cd backend/getWatchLaterPlaylist
    gcloud functions deploy getWatchLaterPlaylist \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region us-central1 \
      --source . \
      --entry-point getWatchLaterPlaylist \
      --project watchlaterai-460918
    ```
    *Note its HTTP trigger URL.*

*   **`categorizeVideo`**
    ```bash
    cd backend/categorizeVideo
    gcloud functions deploy categorizeVideo \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region us-central1 \
      --source . \
      --entry-point categorizeVideo \
      --project watchlaterai-460918
    ```
    *(If this were Pub/Sub triggered, you'd use `--trigger-topic YOUR_TOPIC_NAME` instead of `--trigger-http` and `--allow-unauthenticated`)*.
    *Note its HTTP trigger URL.*

**Note:** The `chatWithPlaylist` Cloud Function has been replaced by the `gemini-chat-service` on Cloud Run and should no longer be deployed as a Cloud Function if you are using the new architecture.

### 3.2 Deploying Cloud Run Service (`gemini-chat-service`)

The `gemini-chat-service` is a Node.js application that provides a WebSocket endpoint for chat.

**Prerequisites:**
*   Docker installed locally (if building locally) or Cloud Build API enabled.
*   Artifact Registry API enabled in your GCP project.
*   An Artifact Registry Docker repository created (e.g., `yt-watchlater-ai-repo` in `us-central1`).
    ```bash
    gcloud artifacts repositories create yt-watchlater-ai-repo \
      --repository-format=docker \
      --location=us-central1 \
      --description="Docker repository for ReelWorthy services" \
      --project="watchlaterai-460918"
    ```

**Steps:**

1.  **Build and Push Docker Image:**
    Navigate to the root of the project. The `gemini-chat-service/` directory contains the `Dockerfile`.
    ```bash
    # Replace YOUR_PROJECT_ID, YOUR_REGION, YOUR_REPO_NAME, SERVICE_NAME, and TAG as appropriate.
    # Example:
    gcloud builds submit --tag us-central1-docker.pkg.dev/watchlaterai-460918/yt-watchlater-ai-repo/gemini-chat-service:v1 gemini-chat-service/ --project watchlaterai-460918
    ```
    This command builds the Docker image from the `gemini-chat-service/` directory and pushes it to your Artifact Registry. Use new tags (e.g., `:v1`, `:v2`) for subsequent builds.

2.  **Deploy to Cloud Run:**
    ```bash
    # Replace YOUR_PROJECT_ID, YOUR_REGION, YOUR_REPO_NAME, SERVICE_NAME, TAG, YOUR_SECRET_NAME, and SERVICE_ACCOUNT_EMAIL
    # Example:
    gcloud run deploy gemini-chat-service \
      --image us-central1-docker.pkg.dev/watchlaterai-460918/yt-watchlater-ai-repo/gemini-chat-service:v1 \
      --platform managed \
      --region us-central1 \
      --allow-unauthenticated \ # Or configure IAM for authentication
      --port 8080 \ # Port your container listens on (defined in server.js and Dockerfile)
      --min-instances 0 \ # Allows scaling to zero for cost savings
      --max-instances 1 \ # For single-user, adjust as needed
      --cpu 1 \
      --memory 512Mi \
      --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \ # Mounts the 'GEMINI_API_KEY' secret as an environment variable
      --service-account YOUR_CLOUD_RUN_SERVICE_ACCOUNT_EMAIL \ # e.g., PROJECT_NUMBER-compute@developer.gserviceaccount.com
      --project watchlaterai-460918
    ```
    *   **Service Account Permissions:** Ensure the service account used by Cloud Run (e.g., `PROJECT_NUMBER-compute@developer.gserviceaccount.com` or a custom one) has:
        *   `roles/secretmanager.secretAccessor` for the `GEMINI_API_KEY` secret.
        *   `roles/datastore.viewer` (or `roles/datastore.user`) for accessing Datastore.
    *   Note the **Service URL** provided after successful deployment. This will be your `WEBSOCKET_SERVICE_URL` (prepended with `wss://` and potentially with a path if your WebSocket server is not at the root).

**Important:** After deploying Cloud Functions, take note of their HTTP trigger URLs. You will need these for the frontend configuration (`frontend/src/App.js`). The Cloud Run service URL is also needed.

## 4. Frontend Deployment (GitHub Pages)

Refer to `frontend/README.md` for detailed instructions on building and deploying the React app to GitHub Pages.
Key steps involve:
1.  Installing `gh-pages`.
2.  Updating `package.json` with `homepage` and deploy scripts.
3.  Running `npm run deploy` (or `yarn deploy`).
4.  Configuring your GitHub repository to serve from the `gh-pages` branch.

## 5. Example `cloudbuild.yaml` (for CI/CD of functions)

This is a basic example. You'd typically have one per function or a more complex one for the whole backend. This example shows deploying one function.

```yaml
# YTWatchLaterManager/cloudbuild.yaml
# This is a simplified example for deploying a single function.
# For multiple functions, you might have separate build files or more steps.

steps:
  # Deploy the 'handleYouTubeAuth' Cloud Function
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - 'gcloud'
      - 'functions'
      - 'deploy'
      - 'handleYouTubeAuth'
      - '--project=${PROJECT_ID}' # PROJECT_ID is a substitution available in Cloud Build
      - '--region=us-central1' # Replace with your region
      - '--runtime=nodejs20'
      - '--trigger-http'
      - '--allow-unauthenticated'
      - '--source=./backend/handleYouTubeAuth' # Path to the function source
      - '--entry-point=handleYouTubeAuth'
      # - '--service-account=YOUR_SERVICE_ACCOUNT_EMAIL' # Optional

  # Example for another function: getWatchLaterPlaylist
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - 'gcloud'
      - 'functions'
      - 'deploy'
      - 'getWatchLaterPlaylist'
      - '--project=${PROJECT_ID}'
      - '--region=us-central1' # Replace with your region
      - '--runtime=nodejs20'
      - '--trigger-http'
      - '--allow-unauthenticated'
      - '--source=./backend/getWatchLaterPlaylist'
      - '--entry-point=getWatchLaterPlaylist'
  
  # Add similar steps for categorizeVideo

  # Step for building the gemini-chat-service Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA', './gemini-chat-service']
    # Assumes Artifact Registry repo 'yt-watchlater-ai-repo' exists in 'us-central1'

  # Step for pushing the gemini-chat-service Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA']

  # Step for deploying gemini-chat-service to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    args:
      - 'gcloud'
      - 'run'
      - 'deploy'
      - 'gemini-chat-service'
      - '--image=us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA'
      - '--platform=managed'
      - '--region=us-central1' # Replace with your region
      - '--allow-unauthenticated'
      - '--port=8080'
      - '--min-instances=0'
      - '--set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest'
      - '--service-account=PROJECT_NUMBER-compute@developer.gserviceaccount.com' # Replace PROJECT_NUMBER
      - '--project=${PROJECT_ID}'

images:
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/yt-watchlater-ai-repo/gemini-chat-service:$SHORT_SHA'

# You can set up triggers in Cloud Build to run this YAML on pushes to your repository.
# Substitutions like _YOUR_REGION could also be configured in the trigger.
```

To run this Cloud Build configuration:
```bash
gcloud builds submit --config cloudbuild.yaml . --project watchlaterai-460918
```
You would typically set up a Cloud Build trigger to automate this from your Git repository.

## Final Configuration

Once all Cloud Functions and the Cloud Run service are deployed and you have their URLs:
1.  Update the `CLOUD_FUNCTIONS_BASE_URL` object in `frontend/src/App.js` with the correct Cloud Function URLs.
2.  Update the `WEBSOCKET_SERVICE_URL` constant in `frontend/src/App.js` with the URL of your deployed `gemini-chat-service` (e.g., `wss://gemini-chat-service-[hash]-[region].a.run.app`).
3.  Rebuild and redeploy your frontend application.

Remember to test the OAuth flow thoroughly, as it involves multiple redirects and configurations (Cloud Function URLs, GitHub Pages URL, Google OAuth Client ID authorized redirect URIs).

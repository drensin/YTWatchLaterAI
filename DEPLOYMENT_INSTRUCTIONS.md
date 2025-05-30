# Deployment Instructions for YT Watch Later Manager

This document provides instructions for deploying the backend Cloud Functions and notes on frontend deployment.

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

For each Cloud Function, its runtime service account will need the "Secret Manager Secret Accessor" IAM role for these secrets.
When deploying a function for the first time, GCP often creates a default service account for it (e.g., `YOUR_PROJECT_ID@appspot.gserviceaccount.com` or a function-specific one). You can grant this role:

```bash
# Replace watchlaterai-460918, YOUR_SECRET_NAME, and SERVICE_ACCOUNT_EMAIL

# Example for YOUTUBE_CLIENT_ID:
gcloud secrets add-iam-policy-binding YOUTUBE_CLIENT_ID \
    --member="serviceAccount:YOUR_FUNCTION_SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --project="watchlaterai-460918"

# Repeat for YOUTUBE_CLIENT_SECRET, GEMINI_API_KEY, GCP_PROJECT_ID and for each function's service account.
# If using the default App Engine service account for all functions:
SERVICE_ACCOUNT_EMAIL="watchlaterai-460918@appspot.gserviceaccount.com"
gcloud secrets add-iam-policy-binding YOUTUBE_CLIENT_ID --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"
gcloud secrets add-iam-policy-binding YOUTUBE_CLIENT_SECRET --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"
gcloud secrets add-iam-policy-binding GEMINI_API_KEY --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"
gcloud secrets add-iam-policy-binding GCP_PROJECT_ID --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" --role="roles/secretmanager.secretAccessor" --project="watchlaterai-460918"

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


## 3. Deploying Cloud Functions using `gcloud`

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

*   **`chatWithPlaylist`**
    ```bash
    cd backend/chatWithPlaylist
    gcloud functions deploy chatWithPlaylist \
      --runtime nodejs20 \
      --trigger-http \
      --allow-unauthenticated \
      --region us-central1 \
      --source . \
      --entry-point chatWithPlaylist \
      --project watchlaterai-460918
    ```
    *Note its HTTP trigger URL.*

**Important:** After deploying each function, take note of its HTTP trigger URL. You will need these for the frontend configuration (`frontend/src/App.js`).

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

# Add similar steps for categorizeVideo and chatWithPlaylist

# You can set up triggers in Cloud Build to run this YAML on pushes to your repository.
# Substitutions like _YOUR_REGION could also be configured in the trigger.
```

To run this Cloud Build configuration:
```bash
gcloud builds submit --config cloudbuild.yaml . --project watchlaterai-460918
```
You would typically set up a Cloud Build trigger to automate this from your Git repository.

## Final Configuration

Once all functions are deployed and you have their URLs:
1.  Update the `CLOUD_FUNCTIONS_BASE_URL` object in `frontend/src/App.js` with the correct URLs.
2.  Rebuild and redeploy your frontend application.

Remember to test the OAuth flow thoroughly, as it involves multiple redirects and configurations (Cloud Function URLs, GitHub Pages URL, Google OAuth Client ID authorized redirect URIs).

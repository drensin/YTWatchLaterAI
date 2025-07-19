#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Load Environment Variables ---
if [ -f .env.deploy ]; then
  export $(cat .env.deploy | sed 's/#.*//g' | xargs)
else
  echo ".env.deploy file not found."
  exit 1
fi

# --- Deploy Backend Cloud Functions ---
echo "--- Deploying Cloud Functions ---"

gcloud functions deploy handleYouTubeAuth \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region $GCP_REGION \
  --source ./backend/handleYouTubeAuth \
  --entry-point handleYouTubeAuth \
  --project $GCP_PROJECT_ID \
  --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID,FRONTEND_URL=https://$FIREBASE_PROJECT_ID.web.app

gcloud functions deploy checkUserAuthorization \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region $GCP_REGION \
  --source ./backend/checkUserAuthorization \
  --entry-point checkUserAuthorization \
  --project $GCP_PROJECT_ID \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID

gcloud functions deploy listUserPlaylists \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region $GCP_REGION \
  --source ./backend/listUserPlaylists \
  --entry-point listUserPlaylists \
  --project $GCP_PROJECT_ID \
  --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID

gcloud functions deploy getWatchLaterPlaylist \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region $GCP_REGION \
  --source ./backend/getWatchLaterPlaylist \
  --entry-point getWatchLaterPlaylist \
  --project $GCP_PROJECT_ID \
  --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID

gcloud functions deploy requestSubscriptionFeedUpdate \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region $GCP_REGION \
  --source ./backend/requestSubscriptionFeedUpdate \
  --entry-point requestSubscriptionFeedUpdate \
  --project $GCP_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID,FRONTEND_URL=https://$FIREBASE_PROJECT_ID.web.app

gcloud functions deploy scheduleAllUserFeedUpdates \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region $GCP_REGION \
  --source ./backend/scheduleAllUserFeedUpdates \
  --entry-point scheduleAllUserFeedUpdates \
  --project $GCP_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID

gcloud functions deploy fetchUserSubscriptionFeed \
  --runtime nodejs20 \
  --trigger-topic user-feed-update-requests \
  --region $GCP_REGION \
  --source ./backend/fetchUserSubscriptionFeed \
  --entry-point fetchUserSubscriptionFeed \
  --project $GCP_PROJECT_ID \
  --set-secrets YOUTUBE_CLIENT_ID=YOUTUBE_CLIENT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID

# --- Build and Push Docker Image ---
echo "--- Building and Pushing Docker Image ---"
gcloud builds submit --tag $GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$DOCKER_REPO/gemini-chat-service:$DOCKER_IMAGE_TAG gemini-chat-service/ --project $GCP_PROJECT_ID

# --- Deploy AI Chat Service ---
echo "--- Deploying AI Chat Service ---"
gcloud run deploy gemini-chat-service \
  --image $GCP_REGION-docker.pkg.dev/$GCP_PROJECT_ID/$DOCKER_REPO/gemini-chat-service:$DOCKER_IMAGE_TAG \
  --platform managed \
  --region $GCP_REGION \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 1 \
  --cpu 1 \
  --memory 512Mi \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --service-account $SERVICE_ACCOUNT_EMAIL \
  --project $GCP_PROJECT_ID \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID

# --- Build and Deploy Frontend ---
echo "--- Building and Deploying Frontend ---"
cd frontend
npm install
npm run build
firebase deploy --only hosting --project $FIREBASE_PROJECT_ID

echo "--- Deployment Complete ---"

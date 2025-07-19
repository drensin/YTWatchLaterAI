# ReelWorthy - Frontend

This directory contains the React frontend for the ReelWorthy application. It is built with Create React App and uses custom hooks to manage state and interactions with the backend services.

## Getting Started

### 1. Install Dependencies

Navigate to this directory and install the required npm packages.

```bash
npm install
```

### 2. Configure Environment Variables

The application is configured using environment variables. Create a `.env` file in this `frontend/` directory. This file will store the URLs for your deployed backend services and other configuration details.

**Copy the example below into your `.env` file and replace the placeholder values with your actual configuration.**

```env
# Firebase Configuration (from your Firebase project settings)
REACT_APP_FIREBASE_API_KEY="your-firebase-api-key"
REACT_APP_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
REACT_APP_FIREBASE_PROJECT_ID="your-project-id"
REACT_APP_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
REACT_APP_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
REACT_APP_FIREBASE_APP_ID="your-app-id"

# Google OAuth Client ID (from Google Cloud Console credentials)
REACT_APP_YOUTUBE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"

# Backend Service URLs (from your Cloud Function and Cloud Run deployments)
REACT_APP_CHECK_USER_AUTHORIZATION_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/checkUserAuthorization"
REACT_APP_LIST_USER_PLAYLISTS_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/listUserPlaylists"
REACT_APP_GET_PLAYLIST_ITEMS_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/getWatchLaterPlaylist"
REACT_APP_HANDLE_YOUTUBE_AUTH_URL_FOR_HOOK="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/handleYouTubeAuth"
REACT_APP_REQUEST_SUBSCRIPTION_FEED_UPDATE_URL="https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/requestSubscriptionFeedUpdate"
REACT_APP_WEBSOCKET_SERVICE_URL="wss://your-gemini-chat-service-url.a.run.app"
```

### 3. Run Development Server

Once the dependencies are installed and the `.env` file is configured, you can start the local development server.

```bash
npm start
```

This will open the app in your browser, usually at `http://localhost:3000`.

## Building for Production

To create a production-ready build of the application, run the following command:

```bash
npm run build
```

This command creates a `build` directory with the static assets for your application.

## Deployment

The frontend is designed to be deployed using **Firebase Hosting**. For complete, step-by-step deployment instructions, please refer to the main `DEPLOYMENT_INSTRUCTIONS.md` file in the root of this project.

The deployment process generally involves:
1.  Ensuring you have the Firebase CLI installed and are logged in.
2.  Initializing Firebase in this directory (`firebase init hosting`) if you haven't already.
3.  Running `npm run build` to create the production assets.
4.  Deploying the contents of the `build` folder using `firebase deploy --only hosting`.

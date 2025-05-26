const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();

// --- CORS Configuration ---
// Adjust the origin to your GitHub Pages URL or '*' for development (less secure)
// For GitHub Pages, it's typically https://<YOUR_USERNAME>.github.io
const corsOptions = {
  origin: 'https://drensin.github.io', // IMPORTANT: Replace with your actual GitHub Pages URL
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // If you need to handle cookies or authorization headers
};

const corsMiddleware = cors(corsOptions);

// Helper function to get secrets from Secret Manager
async function getSecret(secretName) {
  const [version] = await secretManagerClient.accessSecretVersion({
    name: `projects/watchlaterai-460918/secrets/${secretName}/versions/latest`, // IMPORTANT: Replace YOUR_PROJECT_ID
  });
  return version.payload.data.toString('utf8');
}

// --- OAuth Configuration ---
let oauth2Client; // Will be initialized after fetching secrets

async function initializeOAuthClient() {
  if (oauth2Client) return oauth2Client;

  const clientId = await getSecret('YOUTUBE_CLIENT_ID');
  const clientSecret = await getSecret('YOUTUBE_CLIENT_SECRET');
  // This should be the URL of THIS Cloud Function
  const redirectUri = 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth';

  oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  return oauth2Client;
}

// --- Cloud Function Entry Point ---
exports.handleYouTubeAuth = async (req, res) => {
  // Wrap with CORS middleware
  corsMiddleware(req, res, async () => {
    try {
      await initializeOAuthClient();

      if (req.query.code) {
        // --- Step 2: Handle the OAuth 2.0 callback from Google ---
        const { tokens } = await oauth2Client.getToken(req.query.code);
        oauth2Client.setCredentials(tokens);

        // Store tokens securely in Datastore
        // Using a fixed key 'user-tokens' for this personal app.
        // For multi-user, you'd use a user-specific ID.
        const tokenKey = datastore.key(['Tokens', 'default']); // Or a user-specific ID
        const tokenData = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date,
          scopes: tokens.scope,
        };
        await datastore.save({
          key: tokenKey,
          data: tokenData,
        });

        console.log('Tokens stored successfully.');
        // Redirect user back to the frontend with a success indicator
        // IMPORTANT: Replace with your frontend URL
        res.redirect('https://drensin.github.io/YTWatchLaterAI/?oauth_status=success');

      } else {
        // --- Step 1: Redirect user to Google's OAuth 2.0 server ---
        const scopes = [
          'https://www.googleapis.com/auth/youtube.readonly', // To read playlists
          // Add other scopes if needed
        ];

        const authorizationUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline', // To get a refresh token
          scope: scopes,
          include_granted_scopes: true,
        });
        res.redirect(authorizationUrl);
      }
    } catch (error) {
      console.error('Error during OAuth process:', error);
      // Redirect user back to the frontend with an error indicator
      // IMPORTANT: Replace with your frontend URL
      const frontendErrorRedirect = `https://drensin.github.io/YTWatchLaterAI/?oauth_status=error&error_message=${encodeURIComponent(error.message || 'Unknown OAuth error')}`;
      res.redirect(frontendErrorRedirect);
    }
  });
};

/**
 * Example of how to use this function:
 * 1. Frontend (React LoginButton) redirects the user to this Cloud Function's URL.
 *    `window.location.href = "YOUR_HANDLE_YOUTUBE_AUTH_FUNCTION_URL";`
 * 2. This function (handleYouTubeAuth) then redirects to Google's OAuth consent screen.
 * 3. User grants permission. Google redirects back to this Cloud Function's URL with an `?code=...`
 * 4. This function exchanges the code for tokens, stores them, and redirects the user
 *    back to the frontend app (e.g., `https://drensin.github.io/YTWatchLaterAI/?oauth_status=success`).
 * 5. Frontend checks `oauth_status` in URL params to confirm login.
 */

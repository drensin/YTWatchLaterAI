const {google} = require('googleapis');
const {OAuth2Client} = require('google-auth-library');
const {Datastore} = require('@google-cloud/datastore');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
// const admin = require('firebase-admin'); // Not strictly needed here if not verifying an ID token passed in state

// Initialize Firebase Admin SDK (optional here, but good for consistency if other Firebase services are used)
// try {
//   admin.initializeApp();
// } catch (e) {
//   if (!e.message.includes('already initialized')) {
//     console.error('Firebase Admin SDK initialization error:', e);
//   }
// }

const datastore = new Datastore();
const secretManager = new SecretManagerServiceClient();
const TOKEN_KIND = 'Tokens';

// Environment variable for the frontend URL (can be used as a fallback)
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || 'https://drensin.github.io/YTWatchLaterAI/'; // Default if not set

// Whitelist of allowed frontend origins for the final redirect
const ALLOWED_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'https://drensin.github.io', // Previous GitHub Pages URL
  // TODO: Add your production Firebase Hosting URL here, e.g., 'https://your-project-id.web.app'
  'https://watchlaterai-460918.web.app' // Assuming this might be your Firebase hosting URL
];

async function getClientSecrets() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'watchlaterai-460918';

  // Fetch Client ID
  const clientIdSecretName = `projects/${projectId}/secrets/YOUTUBE_CLIENT_ID/versions/latest`;
  let clientId;
  try {
    const [clientIdVersion] = await secretManager.accessSecretVersion({ name: clientIdSecretName });
    clientId = clientIdVersion.payload.data.toString('utf8');
  } catch (error) {
    console.error(`Failed to access secret: ${clientIdSecretName}`, error);
    throw new Error(`Failed to retrieve YouTube Client ID from Secret Manager. Ensure secret "${clientIdSecretName}" exists and the service account has access.`);
  }

  // Fetch Client Secret
  const clientSecretSecretName = `projects/${projectId}/secrets/YOUTUBE_CLIENT_SECRET/versions/latest`;
  let clientSecret;
  try {
    const [clientSecretVersion] = await secretManager.accessSecretVersion({ name: clientSecretSecretName });
    clientSecret = clientSecretVersion.payload.data.toString('utf8');
  } catch (error) {
    console.error(`Failed to access secret: ${clientSecretSecretName}`, error);
    throw new Error(`Failed to retrieve YouTube Client Secret from Secret Manager. Ensure secret "${clientSecretSecretName}" exists and the service account has access.`);
  }
  

  if (!clientId || !clientSecret) {
    // This case should ideally be caught by the individual try/catch blocks above
    throw new Error('YouTube Client ID or Client Secret is missing after attempting to fetch from Secret Manager.');
  }

  return { clientId, clientSecret };
}

/**
 * Handles the OAuth 2.0 callback from Google.
 * Exchanges the authorization code for tokens and stores them.
 * Redirects the user back to the frontend application.
 * Expects 'code' and 'state' (containing Firebase UID and nonce) as query parameters.
 */
exports.handleYouTubeAuth = async (req, res) => {
  // CORS is not strictly necessary for a redirect, but good practice if it were an API endpoint.
  // For redirects, the browser doesn't typically block them due to CORS.
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  const {code, state: encodedState, error: oauthError} = req.query;

  if (oauthError) {
    console.error('OAuth error from Google:', oauthError);
    return res.redirect(`${FRONTEND_URL}?youtube_auth_status=error&error_message=${encodeURIComponent(oauthError)}&state=${encodedState || ''}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}?youtube_auth_status=error&error_message=Missing_authorization_code&state=${encodedState || ''}`);
  }
  if (!encodedState) {
    return res.redirect(`${FRONTEND_URL}?youtube_auth_status=error&error_message=Missing_state_parameter`);
  }

  let firebaseUid;
  let finalRedirectUriFromState;
  let targetRedirectUrl = DEFAULT_FRONTEND_URL; // Fallback

  try {
    const stateString = Buffer.from(encodedState, 'base64').toString('utf8');
    const stateObject = JSON.parse(stateString);
    firebaseUid = stateObject.uid;
    finalRedirectUriFromState = stateObject.finalRedirectUri;

    if (!firebaseUid) {
      throw new Error('Firebase UID missing in state parameter.');
    }
    if (!finalRedirectUriFromState) {
      console.warn('finalRedirectUri missing in state parameter. Using default frontend URL.');
      // Keep targetRedirectUrl as DEFAULT_FRONTEND_URL
    } else {
      // Validate the finalRedirectUriFromState
      const parsedUrl = new URL(finalRedirectUriFromState);
      if (ALLOWED_FRONTEND_ORIGINS.includes(parsedUrl.origin)) {
        targetRedirectUrl = finalRedirectUriFromState; // Use the validated URI from state
      } else {
        console.error(`Disallowed finalRedirectUri origin: ${parsedUrl.origin}. State value: ${finalRedirectUriFromState}. Falling back to default frontend URL.`);
        // Keep targetRedirectUrl as DEFAULT_FRONTEND_URL and perhaps append an error specific to this
        // For now, just falling back is safer than redirecting to an unvalidated URL from state.
        // Consider how to signal this specific type of error to the user if needed.
      }
    }
  } catch (err) {
    console.error('Invalid state parameter or disallowed redirect URI:', err);
    // Use DEFAULT_FRONTEND_URL for redirecting on state error
    return res.redirect(`${DEFAULT_FRONTEND_URL}?youtube_auth_status=error&error_message=Invalid_or_disallowed_state_parameter`);
  }

  try {
    const {clientId, clientSecret} = await getClientSecrets();
    const oauth2Client = new OAuth2Client(
        clientId,
        clientSecret,
        // The redirect URI for this function itself
        `https://us-central1-${process.env.GOOGLE_CLOUD_PROJECT || 'watchlaterai-460918'}.cloudfunctions.net/handleYouTubeAuth`,
    );

    const {tokens} = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Store tokens in Datastore, keyed by Firebase UID
    const tokenKey = datastore.key([TOKEN_KIND, firebaseUid]);
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
    };

    await datastore.save({
      key: tokenKey,
      data: tokenData,
      excludeFromIndexes: ['access_token', 'refresh_token'], // Good practice
    });

    console.log(`Successfully stored YouTube tokens for Firebase UID: ${firebaseUid}`);
    // Redirect back to frontend (using targetRedirectUrl) with success status and the original state
    res.redirect(`${targetRedirectUrl}?youtube_auth_status=success&state=${encodedState}`);
  } catch (err) {
    console.error('Error exchanging code or storing tokens for UID', firebaseUid, err.response ? err.response.data : err.message);
    // Redirect back to frontend (using targetRedirectUrl) with error status and the original state
    const errorMessage = err.response?.data?.error_description || err.message || 'Token_exchange_failed';
    res.redirect(`${targetRedirectUrl}?youtube_auth_status=error&error_message=${encodeURIComponent(errorMessage)}&state=${encodedState}`);
  }
};

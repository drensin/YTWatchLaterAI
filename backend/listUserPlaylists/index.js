const {Datastore} = require('@google-cloud/datastore');
const {OAuth2Client} = require('google-auth-library');
const {google} = require('googleapis');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  if (!e.message.includes('already initialized')) {
    console.error('Firebase Admin SDK initialization error:', e);
    throw e; // Critical error if not 'already initialized'
  }
  // console.log('Firebase Admin SDK was already initialized.');
}

const datastore = new Datastore();
const TOKEN_KIND = 'Tokens'; // Kind for storing YouTube OAuth tokens

// These would ideally be environment variables or from Secret Manager
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
// The redirect URI is for the handleYouTubeAuth function, not directly used here for calls
// but good to have for context if the OAuth2Client needs it for token refresh in some scenarios.
const REDIRECT_URI = `https://us-central1-${process.env.GOOGLE_CLOUD_PROJECT || 'watchlaterai-460918'}.cloudfunctions.net/handleYouTubeAuth`;


/**
 * Retrieves stored OAuth2 tokens for a given Firebase UID.
 * @param {string} firebaseUid The Firebase User ID.
 * @return {Promise<object|null>} The stored tokens or null if not found.
 */
async function getTokens(firebaseUid) {
  const key = datastore.key([TOKEN_KIND, firebaseUid]);
  const [entity] = await datastore.get(key);
  return entity || null;
}

/**
 * HTTP Cloud Function to list user's YouTube playlists.
 * Requires a Firebase ID token for authentication.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.listUserPlaylists = async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*'); // Adjust for production
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // Allow POST if frontend sends it
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No auth header or not Bearer');
    return res.status(401).json({error: 'Unauthorized: Missing or invalid Firebase ID token.'});
  }
  const idToken = authHeader.split('Bearer ')[1];

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({error: 'Unauthorized: Invalid Firebase ID token.'});
  }

  const firebaseUid = decodedToken.uid;
  if (!firebaseUid) {
    return res.status(400).json({error: 'Invalid token: UID missing.'});
  }

  console.log(`Fetching playlists for Firebase UID: ${firebaseUid}`);

  const tokens = await getTokens(firebaseUid);
  if (!tokens) {
    console.log(`No YouTube tokens found for Firebase UID: ${firebaseUid}. User needs to authenticate with YouTube.`);
    // It's important to distinguish this from a general "not logged in" state.
    // The user IS logged into Firebase, but hasn't connected their YouTube account via our app.
    return res.status(403).json({
      error: 'YouTube account not linked. Please connect your YouTube account through the application.',
      code: 'YOUTUBE_AUTH_REQUIRED', // Custom code for frontend to handle
    });
  }

  const oauth2Client = new OAuth2Client(
      YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET,
      REDIRECT_URI,
  );
  oauth2Client.setCredentials(tokens);

  // Handle token refresh if necessary
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('YouTube access token refreshed during listUserPlaylists for UID:', firebaseUid);
    let updatedTokens = {...tokens, ...newTokens};
    // Ensure expiry_date is stored if present in newTokens
    if (newTokens.expiry_date) {
      updatedTokens.expiry_date = newTokens.expiry_date;
    }
    // Remove id_token if it exists, as it's not needed for API calls and can be large
    delete updatedTokens.id_token; 
    
    const tokenKey = datastore.key([TOKEN_KIND, firebaseUid]);
    await datastore.save({
      key: tokenKey,
      data: updatedTokens,
      excludeFromIndexes: ['access_token', 'refresh_token'],
    });
    console.log('Refreshed YouTube tokens saved for UID:', firebaseUid);
  });


  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client,
  });

  try {
    const response = await youtube.playlists.list({
      part: 'snippet,contentDetails',
      mine: true,
      maxResults: 50, // Fetch a reasonable number
    });

    const playlists = response.data.items.map((item) => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.default?.url,
      itemCount: item.contentDetails.itemCount,
    }));
    
    // Include Watch Later (WL) and Watch History (WH) if found, as they might not always be returned by `mine:true`
    // or might have specific IDs. For now, this basic list is fine.
    // We could add specific checks for WL ('WL') and WH ('HL') if needed.

    res.status(200).json({playlists});
  } catch (error) {
    console.error('Error fetching playlists from YouTube API for UID:', firebaseUid, error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 401) {
        // This could mean the refresh token is also invalid or revoked.
        // Frontend should prompt for re-authentication with YouTube.
        return res.status(401).json({
            error: 'YouTube authentication failed or token revoked. Please re-link your YouTube account.',
            code: 'YOUTUBE_REAUTH_REQUIRED',
        });
    }
    res.status(500).json({error: 'Failed to fetch playlists from YouTube.'});
  }
};

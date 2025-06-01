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
    throw e;
  }
}

const datastore = new Datastore();
const TOKEN_KIND = 'Tokens';

// Environment variables for YouTube API
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
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
 * HTTP Cloud Function to fetch items from a specific YouTube playlist.
 * Requires a Firebase ID token for authentication and playlistId in the request body.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.getWatchLaterPlaylist = async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*'); // Adjust for production
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({error: 'Method Not Allowed'});
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

  const {playlistId} = req.body;
  if (!playlistId) {
    return res.status(400).json({error: 'Missing playlistId in request body.'});
  }

  console.log(`Fetching items for playlist ${playlistId} for Firebase UID: ${firebaseUid}`);

  const tokens = await getTokens(firebaseUid);
  if (!tokens) {
    return res.status(403).json({
      error: 'YouTube account not linked. Please connect your YouTube account.',
      code: 'YOUTUBE_AUTH_REQUIRED',
    });
  }

  const oauth2Client = new OAuth2Client(
      YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET,
      REDIRECT_URI,
  );
  oauth2Client.setCredentials(tokens);

  // Handle token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('YouTube access token refreshed during getWatchLaterPlaylist for UID:', firebaseUid);
    let updatedTokens = {...tokens, ...newTokens};
    if (newTokens.expiry_date) {
      updatedTokens.expiry_date = newTokens.expiry_date;
    }
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
    let allItems = [];
    let nextPageToken = null;
    const MAX_RESULTS_PER_PAGE = 50; // Max allowed by YouTube API

    do {
      const response = await youtube.playlistItems.list({
        part: 'snippet,contentDetails',
        playlistId: playlistId,
        maxResults: MAX_RESULTS_PER_PAGE,
        pageToken: nextPageToken,
      });

      if (response.data.items) {
        allItems = allItems.concat(response.data.items);
      }
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken && allItems.length < 200); // Limit to 200 items for now to prevent excessive calls

    const videos = allItems.map((item) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt, // Video publish date
      addedToPlaylistAt: item.contentDetails?.videoPublishedAt || item.snippet.publishedAt, // When video was added to playlist (videoPublishedAt for playlistItem is often the video's original publish date, not add date)
      thumbnailUrl: item.snippet.thumbnails?.default?.url,
      channelId: item.snippet.videoOwnerChannelId || item.snippet.channelId, // videoOwnerChannelId is more accurate for playlist items
      channelTitle: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
      // Duration requires a separate call to videos.list, so omitting for now to simplify
    }));

    res.status(200).json({videos});
  } catch (error) {
    console.error(`Error fetching playlist items for playlist ${playlistId}, UID ${firebaseUid}:`, error.response ? error.response.data : error.message);
    if (error.response && error.response.status === 401) {
        return res.status(401).json({
            error: 'YouTube authentication failed or token revoked. Please re-link your YouTube account.',
            code: 'YOUTUBE_REAUTH_REQUIRED',
        });
    }
    if (error.response && error.response.status === 404) {
        return res.status(404).json({error: `Playlist with ID ${playlistId} not found or access denied.`});
    }
    res.status(500).json({error: 'Failed to fetch playlist items from YouTube.'});
  }
};

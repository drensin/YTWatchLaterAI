const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
const youtube = google.youtube('v3');

// CORS Configuration
const corsOptions = {
  origin: ['https://drensin.github.io', 'https://dkr.bio'],
  methods: ['GET', 'OPTIONS'], // This function can be GET
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
const corsMiddleware = cors(corsOptions);

// Helper function to get secrets (same as other functions)
async function getSecret(secretName) {
  const [version] = await secretManagerClient.accessSecretVersion({
    name: `projects/watchlaterai-460918/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

// Helper function to get OAuth2 client with stored tokens (same as other functions)
async function getAuthenticatedClient() {
  const clientId = await getSecret('YOUTUBE_CLIENT_ID');
  const clientSecret = await getSecret('YOUTUBE_CLIENT_SECRET');
  const redirectUri = 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const tokenKey = datastore.key(['Tokens', 'default']);
  const [tokenEntity] = await datastore.get(tokenKey);

  if (!tokenEntity) {
    throw new Error('User not authenticated. No tokens found.');
  }
  
  console.log('Token scopes from Datastore for listUserPlaylists:', tokenEntity.scopes);

  oauth2Client.setCredentials({
    access_token: tokenEntity.accessToken,
    refresh_token: tokenEntity.refreshToken,
    expiry_date: tokenEntity.expiryDate,
    scope: tokenEntity.scopes
  });

  if (oauth2Client.isTokenExpiring()) {
    console.log('Access token is expiring, attempting to refresh for listUserPlaylists...');
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      const updatedTokenData = {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || tokenEntity.refreshToken,
        expiryDate: credentials.expiry_date,
        scopes: credentials.scope || tokenEntity.scopes,
      };
      console.log('Refreshed token scopes for listUserPlaylists:', updatedTokenData.scopes);
      await datastore.save({ key: tokenKey, data: updatedTokenData });
      console.log('Tokens refreshed and updated in Datastore for listUserPlaylists.');
    } catch (refreshError) {
      console.error('Failed to refresh access token for listUserPlaylists:', refreshError);
      throw new Error('Failed to refresh access token. Please re-authenticate.');
    }
  }
  return oauth2Client;
}

// Cloud Function Entry Point
exports.listUserPlaylists = async (req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') { // Changed to GET as we are fetching a list
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
      const auth = await getAuthenticatedClient();
      let allPlaylists = [];
      let nextPageToken = null;

      console.log('Fetching user\'s playlists...');

      do {
        const response = await youtube.playlists.list({
          auth: auth,
          part: 'snippet,contentDetails', // snippet contains title, description, thumbnails. contentDetails contains itemCount.
          mine: true, // Fetches playlists owned by the authenticated user
          maxResults: 50,
          pageToken: nextPageToken,
        });
        
        console.log('Raw YouTube API response (playlists.list):', JSON.stringify(response.data, null, 2));

        const items = response.data.items;
        if (items) {
          items.forEach(item => {
            allPlaylists.push({
              id: item.id,
              title: item.snippet.title,
              description: item.snippet.description,
              itemCount: item.contentDetails.itemCount,
              thumbnailUrl: item.snippet.thumbnails?.default?.url,
            });
          });
          console.log(`Fetched ${items.length} playlists. Total so far: ${allPlaylists.length}`);
        }
        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);

      console.log(`Finished fetching playlists. Total playlists found: ${allPlaylists.length}`);
      res.status(200).json({
        playlists: allPlaylists,
      });

    } catch (error) {
      console.error('Error fetching user playlists:', error);
      if (error.message.includes('User not authenticated') || error.message.includes('Failed to refresh access token')) {
        res.status(401).json({ error: error.message });
      } else if (error.response && error.response.data && error.response.data.error) {
        const apiError = error.response.data.error;
        console.error('Google API Error (playlists.list):', apiError);
        res.status(apiError.code || 500).json({
          error: `Google API Error: ${apiError.message}`,
          details: apiError.errors
        });
      } else {
        res.status(500).json({ error: 'Failed to fetch user playlists.', details: error.message });
      }
    }
  });
};

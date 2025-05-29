const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const cors = require('cors');
const axios = require('axios'); // Added axios

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
const youtube = google.youtube('v3');

// --- CORS Configuration ---
const corsOptions = {
  origin: ['https://drensin.github.io', 'https://dkr.bio'], // IMPORTANT: Replace with your actual GitHub Pages URL
  methods: ['POST', 'OPTIONS'], // Assuming this function is called via POST
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
const corsMiddleware = cors(corsOptions);

// Helper function to get secrets
async function getSecret(secretName) {
  const [version] = await secretManagerClient.accessSecretVersion({
    name: `projects/watchlaterai-460918/secrets/${secretName}/versions/latest`, // IMPORTANT: Replace YOUR_PROJECT_ID
  });
  return version.payload.data.toString('utf8');
}

// Helper function to get OAuth2 client with stored tokens
async function getAuthenticatedClient() {
  const clientId = await getSecret('YOUTUBE_CLIENT_ID');
  const clientSecret = await getSecret('YOUTUBE_CLIENT_SECRET');
  const redirectUri = 'https://us-central1-watchlaterai-460918.cloudfunctions.net/handleYouTubeAuth'; // Should match the one used in handleYouTubeAuth

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Retrieve tokens from Datastore
  const tokenKey = datastore.key(['Tokens', 'default']);
  const [tokenEntity] = await datastore.get(tokenKey);

  if (!tokenEntity) {
    throw new Error('User not authenticated. No tokens found.');
  }

  console.log('Token scopes from Datastore:', tokenEntity.scopes); // Log scopes

  oauth2Client.setCredentials({
    access_token: tokenEntity.accessToken,
    refresh_token: tokenEntity.refreshToken,
    expiry_date: tokenEntity.expiryDate,
    scope: tokenEntity.scopes // Ensure scope is explicitly passed if needed by library
  });

  // Handle token refresh if necessary
  if (oauth2Client.isTokenExpiring()) {
    console.log('Access token is expiring, attempting to refresh...');
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
      // Update Datastore with new tokens (especially if refresh token changes, or new access token/expiry)
      const updatedTokenData = {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || tokenEntity.refreshToken, // Keep old refresh if new one isn't provided
        expiryDate: credentials.expiry_date,
        scopes: credentials.scope || tokenEntity.scopes, // Ensure this is correct
      };
      console.log('Refreshed token scopes:', updatedTokenData.scopes); // Log scopes after refresh
      await datastore.save({
        key: tokenKey,
        data: updatedTokenData,
      });
      console.log('Tokens refreshed and updated in Datastore.');
    } catch (refreshError) {
      console.error('Failed to refresh access token:', refreshError);
      throw new Error('Failed to refresh access token. Please re-authenticate.');
    }
  }
  return oauth2Client;
}

function formatISO8601Duration(isoDuration) {
  if (!isoDuration || typeof isoDuration !== 'string') {
    return "00:00"; // Default or error format
  }

  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);

  if (!matches) {
    return "00:00"; // Invalid format
  }

  const hours = parseInt(matches[1] || "0", 10);
  const minutes = parseInt(matches[2] || "0", 10);
  const seconds = parseInt(matches[3] || "0", 10);

  const HH = String(hours).padStart(2, '0');
  const MM = String(minutes).padStart(2, '0');
  const SS = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${HH}:${MM}:${SS}`;
  }
  return `${MM}:${SS}`;
}

// --- Cloud Function Entry Point ---
exports.getWatchLaterPlaylist = async (req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method === 'OPTIONS') {
      // Pre-flight request. Reply successfully:
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    try {
      const auth = await getAuthenticatedClient();
      const { playlistId } = req.body; // Get playlistId from request body

      if (!playlistId) {
        res.status(400).json({ error: 'Missing playlistId in request body' });
        return;
      }

      let allVideos = [];
      let nextPageToken = null;
      
      console.log(`Fetching items for playlist ID: ${playlistId}...`);

      do {
        const response = await youtube.playlistItems.list({
          auth: auth,
          part: 'snippet,contentDetails', // This part is for playlistItems.list
          playlistId: playlistId, // Use the provided playlistId
          maxResults: 50, // Max allowed by API
          pageToken: nextPageToken,
        });

        console.log('Raw YouTube API response:', JSON.stringify(response.data, null, 2)); // Log raw response

        const items = response.data.items;
        if (items) {
          for (const item of items) {
            const videoId = item.snippet.resourceId.videoId;
            
            let duration = null;
            let viewCount = null;
            let likeCount = null;
            let topicCategories = [];
            let videoPublishedAt = null; // For video's own publish date
            let videoChannelId = null;   // For video's own channelId
            let videoChannelTitle = null; // For video's own channelTitle


            try {
              console.log(`[${new Date().toISOString()}] Fetching details for video ID: ${videoId}`);
              const videoDetailsResponse = await youtube.videos.list({
                auth: auth,
                part: 'snippet,contentDetails,statistics,topicDetails', // Added snippet
                id: videoId,
              });

              if (videoDetailsResponse.data.items && videoDetailsResponse.data.items.length > 0) {
                const videoItem = videoDetailsResponse.data.items[0];
                duration = formatISO8601Duration(videoItem.contentDetails?.duration); // Format the duration
                viewCount = videoItem.statistics?.viewCount;
                likeCount = videoItem.statistics?.likeCount;
                videoPublishedAt = videoItem.snippet?.publishedAt;
                videoChannelId = videoItem.snippet?.channelId;
                videoChannelTitle = videoItem.snippet?.channelTitle;
                
                const topicCategoryURLs = videoItem.topicDetails?.topicCategories || [];
                for (const topicURL of topicCategoryURLs) {
                  let fallbackValue = topicURL; // Default fallback is the original URL
                  try {
                    const entityId = topicURL.split('/').pop();
                    if (entityId) {
                      fallbackValue = entityId; // If we have an entity ID, that's a better fallback
                      const wikidataAPIURL = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=labels&languages=en&format=json`;
                      const wikidataResponse = await axios.get(wikidataAPIURL);
                      const label = wikidataResponse.data.entities[entityId]?.labels?.en?.value;
                      if (label) {
                        topicCategories.push(label);
                      } else {
                        console.warn(`[${new Date().toISOString()}] No English label found for Wikidata entity ${entityId}. Using entity ID as fallback.`);
                        topicCategories.push(entityId);
                      }
                    } else {
                      console.warn(`[${new Date().toISOString()}] Could not parse entity ID from topicURL: ${topicURL}. Using full URL as fallback.`);
                      topicCategories.push(topicURL); 
                    }
                  } catch (e) {
                    console.error(`[${new Date().toISOString()}] Error fetching/parsing Wikidata for ${topicURL} (fallback: ${fallbackValue}): ${e.message}`);
                    topicCategories.push(fallbackValue); 
                  }
                }
              }
            } catch (e) {
              console.error(`[${new Date().toISOString()}] Error fetching video details for ${videoId}: ${e.message}`);
            }

            // Data for returning to frontend
            const videoDataForFrontend = {
              videoId: videoId,
              title: item.snippet.title, 
              description: item.snippet.description, 
              publishedAt: videoPublishedAt || item.snippet.publishedAt, 
              channelId: videoChannelId || item.snippet.channelId, 
              channelTitle: videoChannelTitle || item.snippet.channelTitle, 
              thumbnailUrl: item.snippet.thumbnails?.default?.url,
              duration: duration,
              viewCount: viewCount,
              likeCount: likeCount,
              topicCategories: topicCategories,
            };
            allVideos.push(videoDataForFrontend);

            // Data for Datastore with indexing control
            const videoDataForDatastore = [
              { name: 'videoId', value: videoId || null },
              { name: 'playlistId_original', value: playlistId || null },
              { name: 'title', value: item.snippet.title || '' }, 
              { name: 'description', value: item.snippet.description || '', excludeFromIndexes: true }, 
              { name: 'publishedAt', value: (videoPublishedAt || item.snippet.publishedAt) ? new Date(videoPublishedAt || item.snippet.publishedAt) : null }, 
              { name: 'channelId', value: videoChannelId || item.snippet.channelId || null }, 
              { name: 'channelTitle', value: videoChannelTitle || item.snippet.channelTitle || '' }, 
              { name: 'thumbnailUrl', value: item.snippet.thumbnails?.default?.url || null, excludeFromIndexes: true },
              { name: 'duration', value: duration || "00:00" }, 
              { name: 'viewCount', value: viewCount ? parseInt(viewCount, 10) : null },
              { name: 'likeCount', value: likeCount ? parseInt(likeCount, 10) : null },
              { name: 'topicCategories', value: topicCategories, excludeFromIndexes: true },
            ];
            
            const videoKey = datastore.key(['Videos', videoId]);
            await datastore.upsert({
              key: videoKey,
              data: videoDataForDatastore,
            });
          }
          console.log(`Fetched ${items.length} videos. Total so far: ${allVideos.length}`);
        }
        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);

      console.log(`Finished fetching. Total videos processed: ${allVideos.length}`);
      res.status(200).json({
        message: `Successfully fetched and stored ${allVideos.length} videos.`,
        videoCount: allVideos.length,
        videos: allVideos, // Optionally return the fetched videos
      });

    } catch (error) {
      console.error('Error fetching Watch Later playlist:', error);
      if (error.message.includes('User not authenticated') || error.message.includes('Failed to refresh access token')) {
        res.status(401).json({ error: error.message, details: error.stack });
      } else if (error.response && error.response.data && error.response.data.error) {
        // Handle Google API specific errors
        const apiError = error.response.data.error;
        console.error('Google API Error:', apiError);
        res.status(apiError.code || 500).json({
          error: `Google API Error: ${apiError.message}`,
          details: apiError.errors
        });
      }
      else {
        res.status(500).json({ error: 'Failed to fetch Watch Later playlist.', details: error.message });
      }
    }
  });
};

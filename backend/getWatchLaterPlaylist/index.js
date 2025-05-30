const { google } = require('googleapis');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const cors = require('cors');
const axios = require('axios'); // Added axios
const express = require('express');
const compression = require('compression');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
const youtube = google.youtube('v3');

// --- CORS Configuration ---
const corsOptions = {
  origin: ['https://drensin.github.io', 'https://dkr.bio', 'http://localhost:3000'], // IMPORTANT: Replace with your actual GitHub Pages URL
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

function setsAreEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  const set1 = new Set(arr1);
  for (const item of arr2) { // Check if all items in arr2 are in set1
    if (!set1.has(item)) return false;
  }
  return true;
}

function parseISO8601DurationToSeconds(isoDuration) {
  if (!isoDuration || typeof isoDuration !== 'string') {
    return null; 
  }
  // Regex to capture H, M, S components from ISO 8601 duration (e.g., PT1H2M3S)
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);

  if (!matches) {
    console.warn(`[${new Date().toISOString()}] Invalid ISO 8601 duration format: ${isoDuration}`);
    return null; 
  }

  const hours = parseInt(matches[1] || "0", 10);
  const minutes = parseInt(matches[2] || "0", 10);
  const seconds = parseInt(matches[3] || "0", 10);

  return (hours * 3600) + (minutes * 60) + seconds;
}

function formatSecondsToHHMMSS(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return "00:00";
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const HH = String(hours).padStart(2, '0');
  const MM = String(minutes).padStart(2, '0');
  const SS = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${HH}:${MM}:${SS}`;
  }
  return `${MM}:${SS}`;
}

// --- Cloud Function Entry Point ---
const app = express();

// Apply CORS middleware (corsOptions is defined above)
// Note: The corsMiddleware variable itself is the result of cors(corsOptions)
// We can use it directly or call cors(corsOptions) again.
// For clarity, let's use the existing corsMiddleware.
app.use(corsMiddleware); // This handles pre-flight OPTIONS requests automatically

// Apply compression middleware
// Using default options for gzip, which is generally good.
// Explicitly set threshold to 0 to compress all responses for testing.
app.use(compression({ threshold: 0 }));

// Define the main logic as a POST route handler
app.post('/', async (req, res) => {
    // The main logic from the original function goes here
    // Removed: if (req.method === 'OPTIONS') and if (req.method !== 'POST') checks
    // as Express routing and CORS middleware handle these.

    try {
      const auth = await getAuthenticatedClient();
      const { playlistId } = req.body; // Get playlistId from request body

      if (!playlistId) {
        // Express automatically sets appropriate content-type for .json()
        res.status(400).json({ error: 'Missing playlistId in request body' });
        return;
      }

      let allVideos = []; // This will store the final list of video objects for the response
      let currentPlaylistVideoIds = [];
      let nextPageToken = null; 

      // New Step 1: Fetch all video IDs from the YouTube playlist
      console.log(`[${new Date().toISOString()}] Step 1: Fetching all video IDs from YouTube playlist: ${playlistId}...`);
      do {
        const response = await youtube.playlistItems.list({
          auth: auth,
          part: 'snippet', 
          playlistId: playlistId,
          maxResults: 50,
          pageToken: nextPageToken,
        });
        const items = response.data.items;
        if (items) {
          for (const item of items) {
            if (item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId) {
                 currentPlaylistVideoIds.push(item.snippet.resourceId.videoId);
            } else {
                console.warn(`[${new Date().toISOString()}] Found playlist item without a videoId: `, JSON.stringify(item));
            }
          }
        }
        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);
      console.log(`[${new Date().toISOString()}] Step 1: Found ${currentPlaylistVideoIds.length} video IDs in YouTube playlist ${playlistId}.`);
      
      // New Step 2 & 3: Attempt to serve from cache using strongly consistent reads
      console.log(`[${new Date().toISOString()}] Step 2: Attempting to fetch ${currentPlaylistVideoIds.length} videos from Datastore by keys for playlist ${playlistId}...`);
      let canServeFromCache = true;
      let videosToServeFromCache = [];

      if (currentPlaylistVideoIds.length > 0) {
        const keysToFetch = currentPlaylistVideoIds.map(id => datastore.key(['Videos', id]));
        const [entitiesFromDatastore] = await datastore.get(keysToFetch); 

        for (let i = 0; i < currentPlaylistVideoIds.length; i++) {
          const videoId = currentPlaylistVideoIds[i];
          const entity = entitiesFromDatastore[i]; 

          if (!entity) { 
            canServeFromCache = false;
            console.log(`[${new Date().toISOString()}] Video ${videoId} not found in Datastore. Full refresh needed for playlist ${playlistId}.`);
            break; 
          }
          
          if (entity.playlistId_original !== playlistId) { 
            canServeFromCache = false;
            console.log(`[${new Date().toISOString()}] Video ${videoId} in Datastore has playlistId_original '${entity.playlistId_original}', but currently processing '${playlistId}'. Full refresh needed.`);
            break;
          }

          videosToServeFromCache.push({
            videoId: entity.videoId,
            title: entity.title,
            description: entity.description,
            publishedAt: entity.publishedAt ? entity.publishedAt.value : null,
            channelId: entity.channelId,
            channelTitle: entity.channelTitle,
            thumbnailUrl: entity.thumbnailUrl,
            duration: formatSecondsToHHMMSS(entity.durationSeconds),
            durationSeconds: entity.durationSeconds,
            viewCount: entity.viewCount,
            likeCount: entity.likeCount,
            topicCategories: Array.isArray(entity.topicCategories) ? entity.topicCategories : [],
          });
        }
      } else { 
        console.log(`[${new Date().toISOString()}] YouTube playlist ${playlistId} is empty. Serving empty list from cache.`);
      }

      if (canServeFromCache) {
        const orderMap = new Map(currentPlaylistVideoIds.map((id, index) => [id, index]));
        videosToServeFromCache.sort((a, b) => orderMap.get(a.videoId) - orderMap.get(b.videoId));
        
        console.log(`[${new Date().toISOString()}] Step 3: All ${videosToServeFromCache.length} videos for playlist ${playlistId} served from Datastore cache (strong consistency).`);
        res.status(200).json({
          message: `Successfully fetched ${videosToServeFromCache.length} videos from cache.`,
          videoCount: videosToServeFromCache.length,
          videos: videosToServeFromCache,
        });
        return; 
      }
      
      console.log(`[${new Date().toISOString()}] Step 3: Cache miss or stale data for playlist ${playlistId}. Proceeding to full fetch/update from YouTube/Wikidata...`);
      allVideos = []; 
      nextPageToken = null; 

      do {
        const response = await youtube.playlistItems.list({
          auth: auth,
          part: 'snippet,contentDetails', 
          playlistId: playlistId,
          maxResults: 50,
          pageToken: nextPageToken,
        });

        const items = response.data.items;
        if (items) {
          for (const item of items) {
            const videoId = item.snippet.resourceId.videoId;
            
            let duration = null; 
            let durationInSeconds = null; 
            let viewCount = null;
            let likeCount = null;
            let topicCategories = [];
            let videoPublishedAt = null; 
            let videoChannelId = null;   
            let videoChannelTitle = null;

            try {
              console.log(`[${new Date().toISOString()}] Fetching details for video ID: ${videoId}`);
              const videoDetailsResponse = await youtube.videos.list({
                auth: auth,
                part: 'snippet,contentDetails,statistics,topicDetails', 
                id: videoId,
              });

              if (videoDetailsResponse.data.items && videoDetailsResponse.data.items.length > 0) {
                const videoItem = videoDetailsResponse.data.items[0];
                const isoDuration = videoItem.contentDetails?.duration;
                durationInSeconds = parseISO8601DurationToSeconds(isoDuration); 
                duration = formatSecondsToHHMMSS(durationInSeconds); 
                viewCount = videoItem.statistics?.viewCount;
                likeCount = videoItem.statistics?.likeCount;
                videoPublishedAt = videoItem.snippet?.publishedAt;
                videoChannelId = videoItem.snippet?.channelId;
                videoChannelTitle = videoItem.snippet?.channelTitle;
                
                const topicCategoryURLs = videoItem.topicDetails?.topicCategories || [];
                for (const topicURL of topicCategoryURLs) {
                  try {
                    let topicName = topicURL.split('/').pop(); 
                    if (topicName) {
                      topicName = decodeURIComponent(topicName).replace(/_/g, ' '); 
                      topicCategories.push(topicName);
                    } else {
                      console.warn(`[${new Date().toISOString()}] Could not parse topic name from Wikipedia URL: ${topicURL}. Using raw URL.`);
                      topicCategories.push(topicURL); 
                    }
                  } catch (e) {
                    console.error(`[${new Date().toISOString()}] Error processing topicURL ${topicURL}: ${e.message}. Using raw URL as fallback.`);
                    topicCategories.push(topicURL); 
                  }
                }
              }
            } catch (e) {
              console.error(`[${new Date().toISOString()}] Error fetching video details for ${videoId}: ${e.message}`);
            }

            const videoDataForFrontend = {
              videoId: videoId,
              title: item.snippet.title, 
              description: item.snippet.description, 
              publishedAt: videoPublishedAt || item.snippet.publishedAt, 
              channelId: videoChannelId || item.snippet.channelId, 
              channelTitle: videoChannelTitle || item.snippet.channelTitle, 
              thumbnailUrl: item.snippet.thumbnails?.default?.url,
              duration: duration, 
              durationSeconds: durationInSeconds, 
              viewCount: viewCount,
              likeCount: likeCount,
              topicCategories: topicCategories,
            };
            allVideos.push(videoDataForFrontend);

            const videoDataForDatastore = [
              { name: 'videoId', value: videoId || null },
              { name: 'playlistId_original', value: playlistId || null },
              { name: 'title', value: item.snippet.title || '' }, 
              { name: 'description', value: item.snippet.description || '', excludeFromIndexes: true }, 
              { name: 'publishedAt', value: (videoPublishedAt || item.snippet.publishedAt) ? new Date(videoPublishedAt || item.snippet.publishedAt) : null }, 
              { name: 'channelId', value: videoChannelId || item.snippet.channelId || null }, 
              { name: 'channelTitle', value: videoChannelTitle || item.snippet.channelTitle || '' }, 
              { name: 'thumbnailUrl', value: item.snippet.thumbnails?.default?.url || null, excludeFromIndexes: true },
              { name: 'durationSeconds', value: durationInSeconds }, 
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
        videos: allVideos, 
      });

    } catch (error) {
      console.error('Error fetching Watch Later playlist:', error);
      if (error.message.includes('User not authenticated') || error.message.includes('Failed to refresh access token')) {
        res.status(401).json({ error: error.message, details: error.stack });
      } else if (error.response && error.response.data && error.response.data.error) {
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

// Export the Express app for Cloud Functions
exports.getWatchLaterPlaylist = app;

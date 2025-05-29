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

      let allVideos = []; // This will store the final list of video objects for the response
      let currentPlaylistVideoIds = []; // Store IDs from YouTube API
      let nextPageToken = null;
      
      console.log(`[${new Date().toISOString()}] Fetching video IDs from playlist: ${playlistId}...`);

      // Step 1: Fetch all video IDs from the YouTube playlist
      do {
        const response = await youtube.playlistItems.list({
          auth: auth,
          part: 'snippet', // Only need snippet to get videoId
          playlistId: playlistId,
          maxResults: 50,
          pageToken: nextPageToken,
        });

        // console.log('Raw YouTube API snippet response:', JSON.stringify(response.data, null, 2)); 

        const items = response.data.items;
        if (items) {
          for (const item of items) {
            currentPlaylistVideoIds.push(item.snippet.resourceId.videoId);
          }
        }
        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);
      console.log(`[${new Date().toISOString()}] Found ${currentPlaylistVideoIds.length} video IDs in playlist ${playlistId}.`);

      // Step 2: Fetch existing video IDs from Datastore for this playlist
      console.log(`[${new Date().toISOString()}] Fetching existing video IDs from Datastore for playlist: ${playlistId}...`);
      const datastoreQuery = datastore.createQuery('Videos')
        .filter('playlistId_original', '=', playlistId)
        .select('videoId'); // Only fetch the videoId property
      const [existingDatastoreVideos] = await datastore.runQuery(datastoreQuery);
      const existingDatastoreVideoIds = existingDatastoreVideos.map(v => v.videoId);
      console.log(`[${new Date().toISOString()}] Found ${existingDatastoreVideoIds.length} videos in Datastore for playlist: ${playlistId}.`);

      // Step 3: Compare sets of IDs
      if (setsAreEqual(currentPlaylistVideoIds, existingDatastoreVideoIds)) {
        console.log(`[${new Date().toISOString()}] Playlist membership matches Datastore. Fetching full details from Datastore...`);
        // Fetch full details for these videos from Datastore
        const keys = currentPlaylistVideoIds.map(id => datastore.key(['Videos', id]));
        const [videosFromDatastore] = await datastore.get(keys);
        
        allVideos = videosFromDatastore.map(dsVideo => {
          // Reconstruct the videoDataForFrontend structure from Datastore entity
          // Note: Datastore entity properties are directly on the object, not in a 'data' sub-object after a get by key.
          // And the array structure we used for upsert is flattened.
          // We need to ensure the fields match what the frontend expects.
          // The 'videoDataForDatastore' array was structured as [{name: 'prop', value: 'val'}...].
          // This means we need to reconstruct the object.
          // However, if datastore.get(keys) returns the objects directly, it's simpler.
          // Let's assume datastore.get(keys) returns objects with properties directly.
          // We need to ensure the 'duration' (formatted string) is present if frontend expects it.
          // And that topicCategories is an array.
          return {
            videoId: dsVideo.videoId,
            title: dsVideo.title,
            description: dsVideo.description,
            publishedAt: dsVideo.publishedAt ? dsVideo.publishedAt.value : null, // Datastore Date objects have a 'value' property
            channelId: dsVideo.channelId,
            channelTitle: dsVideo.channelTitle,
            thumbnailUrl: dsVideo.thumbnailUrl,
            duration: formatSecondsToHHMMSS(dsVideo.durationSeconds), // Format for display
            durationSeconds: dsVideo.durationSeconds,
            viewCount: dsVideo.viewCount,
            likeCount: dsVideo.likeCount,
            topicCategories: Array.isArray(dsVideo.topicCategories) ? dsVideo.topicCategories : [],
          };
        });

        console.log(`[${new Date().toISOString()}] Successfully fetched ${allVideos.length} videos from Datastore.`);
        res.status(200).json({
          message: `Successfully fetched ${allVideos.length} videos from cache.`,
          videoCount: allVideos.length,
          videos: allVideos,
        });
        return; // Exit early as we don't need to fetch from YouTube/Wikidata
      }
      
      console.log(`[${new Date().toISOString()}] Playlist membership changed or not fully cached. Proceeding to fetch/update all video details...`);
      // Reset allVideos as we will rebuild it with fresh data
      allVideos = []; 
      nextPageToken = null; // Reset for the main loop

      // Main loop to fetch playlist items (again, but this time for full processing)
      // This is slightly inefficient as we fetch snippets twice if playlist changed.
      // Could be optimized by passing down the 'items' from the first ID fetch if needed.
      // For now, keeping it simple by re-fetching.
      do {
        const response = await youtube.playlistItems.list({
          auth: auth,
          part: 'snippet,contentDetails', // Corrected: Need contentDetails for item.snippet.title etc.
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
                durationInSeconds = parseISO8601DurationToSeconds(isoDuration); // Assign to the outer scope variable
                duration = formatSecondsToHHMMSS(durationInSeconds); 
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
              duration: duration, // Formatted string for display
              durationSeconds: durationInSeconds, // Use the calculated seconds
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
              { name: 'durationSeconds', value: durationInSeconds }, // Use the calculated seconds
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

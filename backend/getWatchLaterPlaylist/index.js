/**
 * @fileoverview Cloud Function to fetch a YouTube playlist's items,
 * synchronize them with Datastore (including video details like duration),
 * and manage associations between videos and playlists.
 * It handles YouTube API authentication, token refresh, and data transformation.
 */
const express = require('express');
const compressionMiddleware = require('compression'); // Renamed to avoid conflict if 'compression' is used as a var
const {Datastore} = require('@google-cloud/datastore');
const {OAuth2Client} = require('google-auth-library');
const {google} = require('googleapis');
const admin = require('firebase-admin');

// Create an Express app
const app = express();

// Apply compression middleware
app.use(compressionMiddleware());

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    console.log('Firebase Admin SDK initialized successfully for getWatchLaterPlaylist.');
  } catch (e) {
    console.error('Critical Firebase Admin SDK initialization error in getWatchLaterPlaylist:', e.message);
    throw new Error(`Firebase Admin SDK failed to initialize: ${e.message}`);
  }
} else {
  // console.log('Firebase Admin SDK was already initialized.'); // Optional: can be noisy
}

const datastore = new Datastore();
const TOKEN_KIND = 'Tokens';
const VIDEOS_KIND = 'Videos';

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
 * Parses an ISO 8601 duration string (e.g., "PT1H2M3S") into total seconds.
 * @param {string} durationString The ISO 8601 duration string.
 * @return {number|null} Total seconds or null if parsing fails.
 */
function parseISO8601Duration(durationString) {
  if (!durationString || typeof durationString !== 'string') return null;
  const regex = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,3})?)S)?$/;
  const matches = durationString.match(regex);

  if (!matches) {
    console.warn(`[SYNC] Could not parse ISO8601 duration: ${durationString}`);
    return null;
  }

  const days = parseInt(matches[1] || 0);
  const hours = parseInt(matches[2] || 0);
  const minutes = parseInt(matches[3] || 0);
  const seconds = parseFloat(matches[4] || 0);

  if (isNaN(days) || isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
    console.warn(`[SYNC] NaN encountered during parsing ISO8601 duration: ${durationString}`);
    return null;
  }
  
  return (days * 24 * 60 * 60) + (hours * 60 * 60) + (minutes * 60) + seconds;
}

/**
 * HTTP Cloud Function to fetch items from a specific YouTube playlist.
 * It synchronizes video data with Datastore, including fetching full video details
 * like duration, and manages video-playlist associations using an 'associatedPlaylistIds'
 * array on each video entity. Stale associations or video entities (if no longer
 * in any associated playlist) are removed from Datastore.
 *
 * Requires a Firebase ID token in the Authorization header for user authentication,
 * and a 'playlistId' in the JSON request body.
 *
 * Responds with a JSON object containing a 'videos' array, where each video
 * object includes details like videoId, title, description, thumbnails,
 * channel information, and durationSeconds.
 *
 * @param {object} req The HTTP request object. Expected body: { playlistId: string }.
 *     The 'Authorization' header should contain 'Bearer <Firebase ID Token>'.
 * @param {object} res The HTTP response object.
 * @return {Promise<void>} A promise that resolves when the response has been sent,
 *     or rejects if an unrecoverable error occurs.
 */
const handleGetWatchLaterPlaylist = async (req, res) => {
  // CORS headers are set. Note: If using Express globally, CORS middleware (like `cors` package) can also be used.
  res.set('Access-Control-Allow-Origin', '*');
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
    return res.status(401).json({error: 'Unauthorized: Invalid Firebase ID token.'});
  }

  const firebaseUid = decodedToken.uid;
  const {playlistId} = req.body;
  if (!playlistId) {
    return res.status(400).json({error: 'Missing playlistId in request body.'});
  }

  console.log(`[SYNC] Starting sync for playlist ${playlistId}, UID: ${firebaseUid}`);

  const tokens = await getTokens(firebaseUid);
  if (!tokens) {
    return res.status(403).json({error: 'YouTube account not linked.', code: 'YOUTUBE_AUTH_REQUIRED'});
  }

  const oauth2Client = new OAuth2Client(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, REDIRECT_URI);
  oauth2Client.setCredentials(tokens);
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('[SYNC] YouTube access token refreshed for UID:', firebaseUid);
    const tokenKey = datastore.key([TOKEN_KIND, firebaseUid]);
    await datastore.save({key: tokenKey, data: {...tokens, ...newTokens, id_token: undefined}});
  });

  const youtube = google.youtube({version: 'v3', auth: oauth2Client});

  try {
    // 1. Fetch Current YouTube Playlist Items (basic details)
    let allYouTubePlaylistItems = [];
    let nextPageToken = null;
    const MAX_RESULTS_PER_PAGE = 50;
    console.log(`[SYNC] Fetching playlist items from YouTube for playlist ${playlistId}`);
    do {
      const response = await youtube.playlistItems.list({
        part: 'snippet,contentDetails', // snippet.resourceId.videoId, snippet.title, snippet.description, snippet.publishedAt (item add date)
        playlistId: playlistId,
        maxResults: MAX_RESULTS_PER_PAGE,
        pageToken: nextPageToken,
      });
      if (response.data.items) allYouTubePlaylistItems = allYouTubePlaylistItems.concat(response.data.items);
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken && allYouTubePlaylistItems.length < 1000);
    console.log(`[SYNC] Fetched ${allYouTubePlaylistItems.length} items from YouTube.`);
    const currentYouTubeVideoIds = new Set(allYouTubePlaylistItems.map(item => item.snippet.resourceId.videoId));

    // 2. Fetch Existing Videos from Datastore
    //    a) Videos currently associated with this playlistId
    //    b) All videos that are in the current YouTube playlist (to get their existing full data)
    const videosAssociatedQuery = datastore.createQuery(VIDEOS_KIND).filter('associatedPlaylistIds', '=', playlistId);
    const [videosCurrentlyAssociatedInDs] = await datastore.runQuery(videosAssociatedQuery);
    const videosCurrentlyAssociatedInDsMap = new Map(videosCurrentlyAssociatedInDs.map(v => [v.videoId, v]));
    console.log(`[SYNC] Found ${videosCurrentlyAssociatedInDs.length} videos in Datastore currently associated with playlist ${playlistId}.`);

    const existingVideoKeysToFetch = Array.from(currentYouTubeVideoIds).map(id => datastore.key([VIDEOS_KIND, id]));
    let existingVideosFromDs = [];
    if (existingVideoKeysToFetch.length > 0) {
        const [results] = await datastore.get(existingVideoKeysToFetch);
        existingVideosFromDs = results.filter(Boolean); // Filter out nulls for videos not found
    }
    const existingVideosMap = new Map(existingVideosFromDs.map(v => [v.videoId, v]));
    console.log(`[SYNC] Fetched ${existingVideosMap.size} existing video entities from Datastore for current YouTube playlist items.`);

    // 3. Handle Stale Associations/Deletions
    const datastoreEntitiesToUpdate = []; // For entities that need their associatedPlaylistIds updated
    const datastoreKeysToDelete = [];   // For entities that should be deleted entirely
    for (const [videoId, videoData] of videosCurrentlyAssociatedInDsMap) {
      if (!currentYouTubeVideoIds.has(videoId)) { // Video removed from YouTube playlist
        const updatedAssociatedPlaylists = (videoData.associatedPlaylistIds || []).filter(pId => pId !== playlistId);
        if (updatedAssociatedPlaylists.length === 0) {
          datastoreKeysToDelete.push(datastore.key([VIDEOS_KIND, videoId]));
          console.log(`[SYNC] Marking video ${videoId} for deletion (no longer in any associated playlists).`);
        } else {
          // Create a new object for update to avoid modifying the object from videosCurrentlyAssociatedInDsMap directly
          const updatedVideoData = {...videoData, associatedPlaylistIds: updatedAssociatedPlaylists};
          datastoreEntitiesToUpdate.push({key: datastore.key([VIDEOS_KIND, videoId]), data: updatedVideoData});
          console.log(`[SYNC] Updating video ${videoId}, removing association with playlist ${playlistId}.`);
        }
      }
    }

    // 4. Identify Videos Needing Full Detail Fetch from youtube.videos.list
    const videoIdsNeedingFullDetails = [];
    for (const videoId of currentYouTubeVideoIds) {
      const existingVideo = existingVideosMap.get(videoId);
      if (!existingVideo || existingVideo.durationSeconds === null || existingVideo.durationSeconds === undefined) {
        videoIdsNeedingFullDetails.push(videoId);
      }
    }
    console.log(`[SYNC] Identified ${videoIdsNeedingFullDetails.length} videos needing full detail fetch.`);

    // 5. Fetch Full Details for Needed Videos
    const fullVideoDetailsMap = new Map();
    if (videoIdsNeedingFullDetails.length > 0) {
      for (let i = 0; i < videoIdsNeedingFullDetails.length; i += MAX_RESULTS_PER_PAGE) {
        const batchIds = videoIdsNeedingFullDetails.slice(i, i + MAX_RESULTS_PER_PAGE);
        const response = await youtube.videos.list({ part: 'contentDetails,snippet,statistics,topicDetails', id: batchIds.join(',') });
        response.data.items.forEach(video => fullVideoDetailsMap.set(video.id, video));
      }
      console.log(`[SYNC] Fetched full details for ${fullVideoDetailsMap.size} videos.`);
    }

    // 6. Prepare Datastore Upserts (for current items) & Data for Frontend
    const videosForFrontend = [];
    const datastoreEntitiesToUpsert = []; // Primarily for new/updated current items

    for (const playlistItem of allYouTubePlaylistItems) {
      const videoId = playlistItem.snippet.resourceId.videoId;
      const existingVideoData = existingVideosMap.get(videoId) || {}; 
      const fullYtVideoDetails = fullVideoDetailsMap.get(videoId); 

      let durationSeconds = existingVideoData.durationSeconds;
      if (fullYtVideoDetails && fullYtVideoDetails.contentDetails?.duration) {
        durationSeconds = parseISO8601Duration(fullYtVideoDetails.contentDetails.duration);
      } else if (durationSeconds === undefined) {
          durationSeconds = null; 
      }
      
      const associatedPlaylists = new Set(existingVideoData.associatedPlaylistIds || []);
      associatedPlaylists.add(playlistId);

      const finalVideoDataForDatastore = {
        ...existingVideoData, 
        videoId: videoId,
        title: fullYtVideoDetails?.snippet?.title || playlistItem.snippet.title, 
        description: fullYtVideoDetails?.snippet?.description || playlistItem.snippet.description, 
        publishedAt: fullYtVideoDetails?.snippet?.publishedAt || playlistItem.snippet.publishedAt, 
        addedToPlaylistAt: playlistItem.snippet.publishedAt, 
        thumbnailUrl: playlistItem.snippet.thumbnails?.default?.url,
        channelId: playlistItem.snippet.videoOwnerChannelId || playlistItem.snippet.channelId,
        channelTitle: playlistItem.snippet.videoOwnerChannelTitle || playlistItem.snippet.channelTitle,
        durationSeconds: durationSeconds,
        associatedPlaylistIds: Array.from(associatedPlaylists),
        viewCount: existingVideoData.viewCount !== undefined ? existingVideoData.viewCount : (fullYtVideoDetails?.statistics?.viewCount || null),
        likeCount: existingVideoData.likeCount !== undefined ? existingVideoData.likeCount : (fullYtVideoDetails?.statistics?.likeCount || null),
        topicCategories: existingVideoData.topicCategories || (fullYtVideoDetails?.topicDetails?.topicCategories?.map(tc => tc.replace('https://en.wikipedia.org/wiki/', '')) || []),
        geminiCategories: existingVideoData.geminiCategories || [],
        lastCategorized: existingVideoData.lastCategorized !== undefined ? existingVideoData.lastCategorized : null,
      };
      datastoreEntitiesToUpsert.push({ 
        key: datastore.key([VIDEOS_KIND, videoId]), 
        data: finalVideoDataForDatastore,
        excludeFromIndexes: ['description', 'thumbnailUrl'] 
      });

      videosForFrontend.push({
        videoId: videoId,
        title: finalVideoDataForDatastore.title,
        description: finalVideoDataForDatastore.description,
        publishedAt: finalVideoDataForDatastore.publishedAt,
        addedToPlaylistAt: finalVideoDataForDatastore.addedToPlaylistAt,
        thumbnailUrl: finalVideoDataForDatastore.thumbnailUrl,
        channelId: finalVideoDataForDatastore.channelId,
        channelTitle: finalVideoDataForDatastore.channelTitle,
        durationSeconds: finalVideoDataForDatastore.durationSeconds,
      });
    }
    
    // Combine entities that had playlistId removed (but not deleted) with new/updated entities
    const finalUpserts = [...datastoreEntitiesToUpsert, ...datastoreEntitiesToUpdate];


    // 7. Execute Datastore Operations
    if (datastoreKeysToDelete.length > 0) {
      console.log(`[SYNC] Executing ${datastoreKeysToDelete.length} deletions.`);
      await datastore.delete(datastoreKeysToDelete);
    }
    if (finalUpserts.length > 0) {
      console.log(`[SYNC] Executing ${finalUpserts.length} upserts.`);
      await datastore.upsert(finalUpserts);
    }

    console.log(`[SYNC] Synchronization complete for playlist ${playlistId}.`);
    res.status(200).json({videos: videosForFrontend});

  } catch (error) {
    console.error(`Error processing playlist ${playlistId} for UID ${firebaseUid}:`, error.response ? error.response.data : error.message, error.stack);
    if (error.code === 401 || (error.response && error.response.status === 401)) {
        return res.status(401).json({error: 'YouTube authentication failed. Please re-link.', code: 'YOUTUBE_REAUTH_REQUIRED'});
    }
    if (error.code === 404 || (error.response && error.response.status === 404)) {
        return res.status(404).json({error: `Playlist ${playlistId} not found or access denied.`});
    }
    res.status(500).json({error: 'Failed to fetch or sync playlist items.'});
  }
};

// Define the route for the Express app
// Cloud Functions typically expect a single handler, so all traffic to the function URL will hit this.
app.all('/', handleGetWatchLaterPlaylist); // Using app.all to handle OPTIONS, POST, etc. on the root path of the function

// Export the Express app as the Cloud Function
exports.getWatchLaterPlaylist = app;

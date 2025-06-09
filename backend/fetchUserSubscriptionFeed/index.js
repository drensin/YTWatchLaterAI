/**
 * @fileoverview Cloud Function triggered by Pub/Sub to fetch and cache recent,
 * non-short videos from a user's YouTube channel subscriptions.
 * It handles OAuth token refresh, interacts with the YouTube Data API
 * to get subscription and video details, and stores the processed video
 * list in Datastore under the UserSubscriptionFeedCache kind.
 */
const { Datastore } = require('@google-cloud/datastore');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const datastore = new Datastore();
const youtube = google.youtube('v3');

// Retrieve YouTube API credentials from environment variables
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

// Constants
const MAX_VIDEOS_TO_CACHE = 100;
const VIDEOS_PER_SUBSCRIPTION_CHANNEL = 10; // How many recent videos to fetch per channel
const BATCH_SIZE = 50; // For YouTube Data API videos.list calls
const DURATION_THRESHOLD_SECONDS = 61; // Videos with duration > this are kept (i.e., not Shorts)

/**
 * Parses an ISO 8601 duration string (e.g., "PT1H30M5S") into total seconds.
 * @param {string} isoDuration The ISO 8601 duration string.
 * @returns {number} The total duration in seconds.
 */
function parseISO8601Duration(isoDuration) {
  const regex = /P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = isoDuration.match(regex);

  if (!matches) {
    return 0;
  }

  const days = parseInt(matches[1] || 0, 10);
  const hours = parseInt(matches[2] || 0, 10);
  const minutes = parseInt(matches[3] || 0, 10);
  const seconds = parseInt(matches[4] || 0, 10);

  return (days * 24 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
}

/**
 * Fetches and caches up to MAX_VIDEOS_TO_CACHE most recent, non-short videos
 * from a user's YouTube subscriptions. It processes VIDEOS_PER_SUBSCRIPTION_CHANNEL
 * videos from each subscribed channel, aggregates them, sorts by publication date,
 * fetches full details, filters out videos with duration less than or equal to
 * DURATION_THRESHOLD_SECONDS, and stores the result in Datastore.
 * Triggered by a Pub/Sub message containing the userId.
 *
 * @param {{data: string}} pubSubEvent The event payload, where `data` is a base64-encoded JSON string
 *   expected to contain `{ userId: string }`.
 * @param {object} context The event metadata (not directly used by this function's core logic).
 */
exports.fetchUserSubscriptionFeed = async (pubSubEvent, context) => {
  let userId;
  try {
    const message = pubSubEvent.data
      ? JSON.parse(Buffer.from(pubSubEvent.data, 'base64').toString())
      : null;

    if (!message || !message.userId) {
      console.error('No userId provided in Pub/Sub message.');
      return;
    }
    userId = message.userId;
    console.log(`Processing subscription feed for userId: ${userId}`);

    // 1. Get user's OAuth tokens from Datastore
    const tokenKey = datastore.key(['Tokens', userId]);
    const [tokenEntity] = await datastore.get(tokenKey);

    if (!tokenEntity) {
      console.error(`No OAuth tokens found for userId: ${userId}`);
      return;
    }

    // Initialize OAuth2Client with client ID and secret for token refresh
    const oauth2Client = new OAuth2Client(
      YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: tokenEntity.access_token,
      refresh_token: tokenEntity.refresh_token,
      expiry_date: tokenEntity.expiry_date,
    });

    // Refresh token if necessary
    if (oauth2Client.isTokenExpiring()) {
      console.log(`Token for ${userId} is expiring, attempting refresh.`);
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        // Save refreshed tokens
        const updatedTokenEntity = {
          key: tokenKey,
          data: [
            { name: 'access_token', value: credentials.access_token, excludeFromIndexes: true },
            { name: 'refresh_token', value: credentials.refresh_token, excludeFromIndexes: true },
            { name: 'scope', value: credentials.scope },
            { name: 'token_type', value: credentials.token_type },
            { name: 'expiry_date', value: credentials.expiry_date },
          ],
        };
        await datastore.update(updatedTokenEntity);
        console.log(`Token refreshed and saved for userId: ${userId}`);
      } catch (refreshError) {
        console.error(`Failed to refresh token for userId: ${userId}`, refreshError);
        // If token refresh fails, we might not be able to proceed.
        // Depending on the error, we might want to mark the user's tokens as invalid.
        return;
      }
    }
    
    google.options({ auth: oauth2Client });

    // 2. Fetch user's YouTube subscriptions
    let allSubscriptions = [];
    let nextPageTokenSubs;
    do {
      const subsResponse = await youtube.subscriptions.list({
        part: 'snippet',
        mine: true,
        maxResults: 50,
        pageToken: nextPageTokenSubs,
      });
      allSubscriptions = allSubscriptions.concat(subsResponse.data.items);
      nextPageTokenSubs = subsResponse.data.nextPageToken;
    } while (nextPageTokenSubs);

    console.log(`Found ${allSubscriptions.length} subscriptions for userId: ${userId}`);
    if (allSubscriptions.length === 0) {
        console.log(`No subscriptions found for userId: ${userId}. Updating cache with empty list.`);
        const cacheKey = datastore.key(['UserSubscriptionFeedCache', userId]);
        const cacheEntity = {
            key: cacheKey,
            data: {
                videos: [],
                lastUpdated: new Date(),
            },
        };
        await datastore.save(cacheEntity);
        console.log(`Empty subscription feed cache updated for userId: ${userId}`);
        return;
    }

    // 3. For each subscription, get channel's uploads playlist and recent videos
    let allRecentVideos = [];
    for (const sub of allSubscriptions) {
      const channelId = sub.snippet.resourceId.channelId;
      try {
        // Get channel's uploads playlist ID
        const channelDetails = await youtube.channels.list({
          part: 'contentDetails',
          id: channelId,
        });

        const uploadsPlaylistId = channelDetails?.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsPlaylistId) {
          console.warn(`Could not find uploads playlist for channelId: ${channelId}`);
          continue;
        }

        // Get recent videos from the uploads playlist
        const playlistItemsResponse = await youtube.playlistItems.list({
          part: 'snippet,contentDetails', // contentDetails for videoId and publishedAt
          playlistId: uploadsPlaylistId,
          maxResults: VIDEOS_PER_SUBSCRIPTION_CHANNEL,
        });
        
        playlistItemsResponse.data.items.forEach(item => {
          if (item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId) {
            allRecentVideos.push({
              videoId: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              description: item.snippet.description,
              channelId: item.snippet.channelId,
              channelTitle: item.snippet.channelTitle,
              publishedAt: item.snippet.publishedAt, // This is when video was added to playlist
                                                    // For uploads playlist, it's effectively video publish date
              thumbnailUrl: item.snippet.thumbnails && item.snippet.thumbnails.default ? item.snippet.thumbnails.default.url : null,
            });
          }
        });
      } catch (channelError) {
        console.error(`Error fetching videos for channelId ${channelId}:`, channelError.message);
        // Continue with other subscriptions
      }
    }

    // 4. Sort all collected videos globally by publishedAt date (newest first)
    allRecentVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // 5. Select the top MAX_VIDEOS_TO_CACHE newest videos
    const topVideos = allRecentVideos.slice(0, MAX_VIDEOS_TO_CACHE);

    // 6. Fetch full video details (including duration) for the top videos
    const videoIdsToFetch = topVideos.map(video => video.videoId);
    const videoDetailsMap = new Map(); // Map videoId to full video details

    // YouTube Data API allows up to 50 IDs per videos.list call
    // BATCH_SIZE is now a module-level constant
    for (let i = 0; i < videoIdsToFetch.length; i += BATCH_SIZE) {
      const batchIds = videoIdsToFetch.slice(i, i + BATCH_SIZE);
      try {
        const videosResponse = await youtube.videos.list({
          part: 'contentDetails,snippet,statistics', // Request contentDetails for duration
          id: batchIds.join(','),
        });

        videosResponse.data.items.forEach(videoItem => {
          videoDetailsMap.set(videoItem.id, videoItem);
        });
      } catch (videoFetchError) {
        console.error(`Error fetching video details for batch starting with ${batchIds[0]}:`, videoFetchError.message);
        // Continue processing even if a batch fails
      }
    }

    // 7. Enrich topVideos with duration and other details
    const enrichedTopVideos = topVideos.map(video => {
      const fullDetails = videoDetailsMap.get(video.videoId);
      if (fullDetails) {
        const durationIso = fullDetails.contentDetails ? fullDetails.contentDetails.duration : null;
        const durationSeconds = durationIso ? parseISO8601Duration(durationIso) : 0;
        
        return {
          ...video,
          durationSeconds: durationSeconds,
          // You can add other fields from fullDetails if needed, e.g., viewCount, likeCount
          // viewCount: fullDetails.statistics ? parseInt(fullDetails.statistics.viewCount, 10) : 0,
          // likeCount: fullDetails.statistics ? parseInt(fullDetails.statistics.likeCount, 10) : 0,
        };
      }
      return { ...video, durationSeconds: 0 }; // Default to 0 if details not found
    });

    // Filter out Shorts (videos <= DURATION_THRESHOLD_SECONDS seconds)
    // DURATION_THRESHOLD_SECONDS is now a module-level constant
    const nonShortEnrichedVideos = enrichedTopVideos.filter(video => {
      return video.durationSeconds > DURATION_THRESHOLD_SECONDS;
    });

    // 8. Store these filtered, enriched videos in UserSubscriptionFeedCache
    const cacheKey = datastore.key(['UserSubscriptionFeedCache', userId]);
    const cacheEntity = {
      key: cacheKey,
      data: {
        videos: nonShortEnrichedVideos, // Use the filtered list here
        lastUpdated: new Date(),
      },
      excludeFromIndexes: [
        'videos[].description' // Exclude all 'description' properties within the 'videos' array
      ]
    };
    await datastore.save(cacheEntity);

    console.log(`Successfully cached ${nonShortEnrichedVideos.length} non-short videos for userId: ${userId}`);

  } catch (error) {
    console.error(`Error processing subscription feed for userId ${userId || 'UNKNOWN'}:`, error);
    // Depending on the error, might want to implement more specific error handling or retries
  }
};

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
let genAI; // Will be initialized after fetching API key

// CORS Configuration
const corsOptions = {
  origin: ['https://drensin.github.io', 'https://dkr.bio'],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
const corsMiddleware = cors(corsOptions);

async function getSecret(secretName) {
  const [version] = await secretManagerClient.accessSecretVersion({
    name: `projects/watchlaterai-460918/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString('utf8');
}

async function initializeGenAI() {
  if (genAI) return genAI;
  const apiKey = await getSecret('GEMINI_API_KEY');
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// Cloud Function Entry Point
exports.chatWithPlaylist = async (req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      await initializeGenAI();
      const { query, playlistId } = req.body;

      if (!query || !playlistId) {
        res.status(400).json({ error: 'Missing query or playlistId in request body' });
        return;
      }

      // 1. Fetch all videos for the given playlistId from Datastore
      //    (Assuming videos were stored by getPlaylistItems function)
      //    Note: This simple query fetches all videos. For very large playlists,
      //    you might need more sophisticated retrieval or context window management.
      //    We will filter by 'playlistId_original' which should now be stored with each video.
      console.log(`Fetching videos from Datastore for playlistId: ${playlistId}...`);
      const datastoreQuery = datastore.createQuery('Videos')
        .filter('playlistId_original', '=', playlistId)
        .limit(100); // Limit for safety and context window for Gemini

      const [videosForPlaylist] = await datastore.runQuery(datastoreQuery);

      if (!videosForPlaylist || videosForPlaylist.length === 0) {
        res.status(200).json({ answer: `No videos found in Datastore for playlist ID ${playlistId} to chat about. Ensure items have been fetched for this playlist.`, suggestedVideos: [] });
        return;
      }

      // 2. Construct context for Gemini
      let videoContext = "Available videos for this playlist:\n";
      videosForPlaylist.forEach(video => {
        videoContext += `- ID: ${video.videoId}, Title: ${video.title}, Description: ${video.description ? video.description.substring(0, 200) + '...' : 'N/A'}\n`;
      });

      // 3. Prepare prompt for Gemini
      const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Or your preferred model
      const prompt = `Based on the following list of videos and their descriptions, please answer the user's query.
User Query: "${query}"
${videoContext}
If the query asks for video recommendations, list the video IDs that are most relevant.
Your response should be a JSON object with two keys: "answer" (a string for a textual response) and "suggestedVideoIds" (an array of strings, which are video IDs from the list if relevant, or an empty array if not). For example: {"answer": "Here are some videos about X...", "suggestedVideoIds": ["videoId1", "videoId2"]}`;
      
      console.log("Sending prompt to Gemini...");
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      console.log("Gemini response text:", text);

      let geminiJson = { answer: "Could not parse suggestion from AI.", suggestedVideoIds: [] };
      try {
        geminiJson = JSON.parse(text);
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON response:", parseError, "Raw text:", text);
        // Fallback: use the raw text as the answer if JSON parsing fails
        geminiJson.answer = text;
      }
      
      // 4. Map suggestedVideoIds back to full video objects from our Datastore list
      const suggestedVideosFull = [];
      if (geminiJson.suggestedVideoIds && geminiJson.suggestedVideoIds.length > 0) {
        geminiJson.suggestedVideoIds.forEach(id => {
          const foundVideo = videosForPlaylist.find(v => v.videoId === id); // Search within the current playlist's videos
          if (foundVideo) {
            // Return the frontend-friendly structure
            suggestedVideosFull.push({
              videoId: foundVideo.videoId,
              title: foundVideo.title,
              description: foundVideo.description,
              publishedAt: foundVideo.publishedAt, // This might be a Date object if stored as such
              channelId: foundVideo.channelId,
              channelTitle: foundVideo.channelTitle,
              thumbnailUrl: foundVideo.thumbnailUrl,
            });
          }
        });
      }

      res.status(200).json({
        answer: geminiJson.answer,
        suggestedVideos: suggestedVideosFull
      });

    } catch (error) {
      console.error('Error in chatWithPlaylist function:', error);
      res.status(500).json({ error: 'Failed to process chat query.', details: error.message });
    }
  });
};

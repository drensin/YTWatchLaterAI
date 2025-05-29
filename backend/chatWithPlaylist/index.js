const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
let genAI; // Will be initialized after fetching API key

const VIDEOS_ENTITY = 'Videos';

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
      const { query, playlistId, modelId } = req.body; 

      if (!query || !playlistId) {
        res.status(400).json({ error: 'Missing query or playlistId in request body' });
        return;
      }
      
      const effectiveModelId = modelId || "gemini-2.5-flash-preview-05-20";
      console.log(`[${new Date().toISOString()}] Playlist: ${playlistId}, Query: "${query}"`);
      console.log(`[${new Date().toISOString()}] Using Gemini model: ${effectiveModelId}`);

      console.log(`[${new Date().toISOString()}] Fetching videos from Datastore for playlistId: ${playlistId}...`);
      const datastoreQuery = datastore.createQuery(VIDEOS_ENTITY)
        .filter('playlistId_original', '=', playlistId);
      const [videosForPlaylist] = await datastore.runQuery(datastoreQuery);
      console.log(`[${new Date().toISOString()}] Fetched ${videosForPlaylist ? videosForPlaylist.length : 0} videos from Datastore for playlistId: ${playlistId}`);

      if (!videosForPlaylist || videosForPlaylist.length === 0) {
        res.status(200).json({ answer: `No videos found in Datastore for playlist ID ${playlistId}.`, suggestedVideos: [] });
        return;
      }

      console.log(`[${new Date().toISOString()}] Starting videoContext construction (JSON format)...`);
      const videoListForContext = videosForPlaylist.map(video => ({
        ID: video.videoId,
        Title: video.title,
        Description: video.description ? video.description.substring(0, 800) + '...' : 'N/A',
        Duration: video.duration, // Assuming duration is already formatted HH:MM:SS or MM:SS from getWatchLaterPlaylist
        Views: video.viewCount ? parseInt(video.viewCount, 10) : null,
        Likes: video.likeCount ? parseInt(video.likeCount, 10) : null,
        Topics: Array.isArray(video.topicCategories) ? video.topicCategories.join(', ') : '',
        Published: video.publishedAt ? new Date(video.publishedAt).toISOString().split('T')[0] : null // Format as YYYY-MM-DD
      }));
      const videoContext = `Video List (JSON format):\n${JSON.stringify(videoListForContext, null, 2)}`;
      console.log(`[${new Date().toISOString()}] Finished videoContext construction (JSON format).`);
      
      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ];
      const model = genAI.getGenerativeModel({ model: effectiveModelId, safetySettings }); 
      
      const singleShotPrompt = `You are a helpful assistant. Your task is to find videos from the 'Video List' below that match the 'User Query'.

User Query: "${query}"

Video List (JSON format):
${videoContext}

Instructions:
1. The 'Video List' is provided in JSON format. Parse this JSON data.
2. For each video object in the 'Video List', check if the video's 'Title' or 'Description' (and consider 'Published' date or 'Topics' if relevant to the query) contains the exact text or concepts from the 'User Query'.
3. If a video matches the query, consider it a match.
4. Your response MUST be a JSON object with a single key: "matchingVideoIds".
   The value of "matchingVideoIds" MUST be an array of strings. Each string in the array MUST be the 'ID' of a video from the 'Video List' that you identified as a match. If no videos match, this array MUST be empty.
Output ONLY the JSON object.

Example for User Query "Cory Henry":
If a video has ID "vid2" and Title "Cory Henry Live Concert", then "vid2" should be in the "matchingVideoIds" array.
`;
      
      console.log(`[${new Date().toISOString()}] Sending single-shot prompt to Gemini...`);
      const result = await model.generateContent(singleShotPrompt);
      const response = await result.response;
      const text = response.text();
      console.log(`[${new Date().toISOString()}] Gemini response text:`, text);
      
      let cleanedJsonText = text.trim();
      if (cleanedJsonText.startsWith("```json")) {
        cleanedJsonText = cleanedJsonText.substring(7);
      }
      if (cleanedJsonText.endsWith("```")) {
        cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - 3);
      }
      cleanedJsonText = cleanedJsonText.trim();

      let parsedResponse;
      let suggestedVideoIds = [];
      let answerText = "Could not find any videos matching your query in this playlist.";

      try {
        parsedResponse = JSON.parse(cleanedJsonText);
        if (parsedResponse && parsedResponse.matchingVideoIds && parsedResponse.matchingVideoIds.length > 0) {
          suggestedVideoIds = parsedResponse.matchingVideoIds;
          answerText = "Based on your query, I found these videos:";
        } else if (parsedResponse && parsedResponse.matchingVideoIds) {
          answerText = "I could not find any videos matching your query in this playlist.";
        } else {
          console.error("Gemini response was valid JSON but not the expected format. Text:", cleanedJsonText);
          answerText = "Received an unexpected format from the AI.";
        }
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON response:", parseError, "Cleaned text:", cleanedJsonText, "Original text:", text);
        answerText = `Error processing AI response. Raw AI output: ${text}`;
      }
      
      const suggestedVideosFull = [];
      if (suggestedVideoIds.length > 0) {
        suggestedVideoIds.forEach(id => {
          const foundVideo = videosForPlaylist.find(v => v.videoId === id);
          if (foundVideo) {
            suggestedVideosFull.push({
              videoId: foundVideo.videoId,
              title: foundVideo.title,
              description: foundVideo.description,
              publishedAt: foundVideo.publishedAt,
              channelId: foundVideo.channelId,
              channelTitle: foundVideo.channelTitle,
              thumbnailUrl: foundVideo.thumbnailUrl,
              // Include other metadata if needed by frontend from chat response
              duration: foundVideo.duration,
              viewCount: foundVideo.viewCount,
              likeCount: foundVideo.likeCount,
              topicCategories: foundVideo.topicCategories
            });
          } else {
            console.error(`[${new Date().toISOString()}] Video ID ${id} suggested by Gemini was not found in the current videosForPlaylist array (length: ${videosForPlaylist.length}).`);
          }
        });
      }

      res.status(200).json({
        answer: answerText,
        suggestedVideos: suggestedVideosFull
      });

    } catch (error) {
      console.error('Error in chatWithPlaylist function:', error);
      res.status(500).json({ error: 'Failed to process chat query.', details: error.message });
    }
  });
};

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
        DurationSeconds: video.durationSeconds,
        Views: video.viewCount ? parseInt(video.viewCount, 10) : null,
        Likes: video.likeCount ? parseInt(video.likeCount, 10) : null,
        Topics: Array.isArray(video.topicCategories) ? video.topicCategories.join(', ') : '',
        PublishedTimestamp: video.publishedAt ? new Date(video.publishedAt).getTime() : null
      }));
      const videoContext = `Video List (JSON format):\n${JSON.stringify(videoListForContext, null, 2)}`;
      console.log(`[${new Date().toISOString()}] Finished videoContext construction (JSON format).`);
      
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];
      const model = genAI.getGenerativeModel({ model: effectiveModelId, safetySettings }); 
      
      const singleShotPrompt = `You are a helpful assistant. Your task is to find videos from the 'Video List' below that match the 'User Query'.

User Query: "${query}"

Video List (JSON format):
${videoContext}

Instructions:
1. The 'Video List' is provided in JSON format. Parse this JSON data. Each video object includes a 'PublishedTimestamp' field (Unix timestamp in milliseconds), 'DurationSeconds', 'Topics', etc.
2. For each video object in the 'Video List', determine if it's relevant to the 'User Query' by checking its 'Title', 'Description', and other metadata like 'Topics' or 'PublishedTimestamp' if applicable.
3. If a video is relevant, include it in your response.
4. Your response MUST be a JSON object with a single key: "suggestedVideos".
   The value of "suggestedVideos" MUST be an array of objects. Each object in the array MUST have two keys:
     - "videoId": The 'ID' of the suggested video from the 'Video List'.
     - "reason": A brief explanation (1-2 sentences) why this specific video was selected as relevant to the User Query.
   If no videos are relevant, the "suggestedVideos" array MUST be empty.
Output ONLY the JSON object.

Example for User Query "Cory Henry piano solo":
{
  "suggestedVideos": [
    {
      "videoId": "vid2",
      "reason": "This video titled 'Cory Henry Live Concert' is relevant as it likely features Cory Henry and may include piano solos."
    }
  ]
}
`;
      
      console.log(`[${new Date().toISOString()}] Sending single-shot prompt to Gemini...`);
      const result = await model.generateContent(singleShotPrompt);
      const response = await result.response;
      const text = response.text();
      console.log(`[${new Date().toISOString()}] Gemini response text:`, text);
      
      let jsonString = text.trim();
      // Remove markdown fences if present
      if (jsonString.startsWith("```json")) {
        jsonString = jsonString.substring(7);
      }
      if (jsonString.endsWith("```")) {
        jsonString = jsonString.substring(0, jsonString.length - 3);
      }
      jsonString = jsonString.trim();

      // Attempt to extract the main JSON object if there's extra text
      // Find the first '{' and the last '}'
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');

      let cleanedJsonText = jsonString; // Default to the cleaned string
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanedJsonText = jsonString.substring(firstBrace, lastBrace + 1);
      }
      // Further ensure it's just the object, in case of trailing text after valid JSON
      try {
        JSON.parse(cleanedJsonText); // Test if this substring is valid JSON
      } catch (e) {
        // If substring parsing fails, revert to jsonString which might be the full (but problematic) string
        // This can happen if the main content isn't actually a single object.
        // However, our prompt asks for a single JSON object.
        console.warn(`[${new Date().toISOString()}] Substring extraction for JSON failed, trying original cleaned string. Error: ${e.message}`);
        cleanedJsonText = jsonString; 
      }


      let parsedResponse;
      let suggestionsFromGemini = []; // Will store array of {videoId, reason}
      let answerText = "Could not find any videos matching your query in this playlist.";

      try {
        parsedResponse = JSON.parse(cleanedJsonText);
        if (parsedResponse && Array.isArray(parsedResponse.suggestedVideos) && parsedResponse.suggestedVideos.length > 0) {
          suggestionsFromGemini = parsedResponse.suggestedVideos; 
          answerText = "Based on your query, I found these videos:";
        } else if (parsedResponse && Array.isArray(parsedResponse.suggestedVideos)) {
          answerText = "I could not find any videos matching your query in this playlist.";
        } else {
          console.error("Gemini response was valid JSON but not the expected format (expected {suggestedVideos: [...]}). Text:", cleanedJsonText);
          answerText = "Received an unexpected format from the AI.";
        }
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON response:", parseError, "Cleaned text:", cleanedJsonText, "Original text:", text);
        answerText = `Error processing AI response. Raw AI output: ${text}`;
      }
      
      const suggestedVideosFull = [];
      if (suggestionsFromGemini.length > 0) {
        suggestionsFromGemini.forEach(suggestion => {
          const foundVideo = videosForPlaylist.find(v => v.videoId === suggestion.videoId);
          if (foundVideo) {
            suggestedVideosFull.push({
              ...foundVideo, 
              reason: suggestion.reason 
            });
          } else {
            console.error(`[${new Date().toISOString()}] Video ID ${suggestion.videoId} suggested by Gemini was not found in the current videosForPlaylist array (length: ${videosForPlaylist.length}).`);
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

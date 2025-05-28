const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai'); // Added HarmCategory and HarmBlockThreshold
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
let genAI; // Will be initialized after fetching API key

const VIDEOS_ENTITY = 'Videos'; // Only VIDEOS_ENTITY is needed now

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
      // Removed userId as it's not used in single-shot approach
      const { query, playlistId, modelId } = req.body; 

      if (!query || !playlistId) {
        res.status(400).json({ error: 'Missing query or playlistId in request body' });
        return;
      }
      
      const effectiveModelId = modelId || "gemini-2.5-flash-preview-05-20";
      console.log(`[${new Date().toISOString()}] Playlist: ${playlistId}, Query: "${query}"`);
      console.log(`[${new Date().toISOString()}] Using Gemini model: ${effectiveModelId}`);

      // 1. Fetch all videos for the given playlistId from Datastore
      console.log(`[${new Date().toISOString()}] Fetching videos from Datastore for playlistId: ${playlistId}...`);
      const datastoreQuery = datastore.createQuery(VIDEOS_ENTITY)
        .filter('playlistId_original', '=', playlistId);
      const [videosForPlaylist] = await datastore.runQuery(datastoreQuery);
      console.log(`[${new Date().toISOString()}] Fetched ${videosForPlaylist ? videosForPlaylist.length : 0} videos from Datastore for playlistId: ${playlistId}`);

      if (!videosForPlaylist || videosForPlaylist.length === 0) {
        res.status(200).json({ answer: `No videos found in Datastore for playlist ID ${playlistId}.`, suggestedVideos: [] });
        return;
      }

      // 2. Construct context for Gemini
      console.log(`[${new Date().toISOString()}] Starting videoContext construction...`);
      let videoContext = "Video List:\n";
      videosForPlaylist.forEach(video => {
        const descSnippet = video.description ? video.description.substring(0, 800) + '...' : 'N/A';
        videoContext += `- ID: ${video.videoId}, Title: "${video.title}", Description: "${descSnippet}"\n`;
      });
      console.log(`[${new Date().toISOString()}] Finished videoContext construction.`);
      
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
      
      const singleShotPrompt = `Analyze the following 'Video List' based on the 'User Query'.

User Query: "${query}"

Video List:
${videoContext}

Task:
Identify all videos from the 'Video List' where the 'User Query' text appears in either the video's 'Title' or 'Description'.

Response Format:
Return a JSON object with a single key: "matchingVideoIds".
The value of "matchingVideoIds" MUST be an array of strings. Each string in the array MUST be the 'ID' of a video from the 'Video List' that matches the criteria.
If no videos match, the "matchingVideoIds" array MUST be empty.

Example for User Query "Cory Henry":
If a video has ID "vid2" and Title "Cory Henry Live Concert", then "vid2" should be in the "matchingVideoIds" array.

Output ONLY the JSON object.
`;

      console.log(`[${new Date().toISOString()}] Sending single-shot prompt to Gemini...`);
      const result = await model.generateContent(singleShotPrompt); // Using generateContent directly
      const response = await result.response;
      const text = response.text();
      console.log(`[${new Date().toISOString()}] Gemini response text:`, text);
      
      let cleanedJsonText = text.trim();
      if (cleanedJsonText.startsWith("```json")) {
        cleanedJsonText = cleanedJsonText.substring(7); // Remove ```json\n
      }
      if (cleanedJsonText.endsWith("```")) {
        cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - 3);
      }
      cleanedJsonText = cleanedJsonText.trim(); // Trim any remaining whitespace

      let parsedResponse;
      let suggestedVideoIds = [];
      let answerText = "Could not find any videos matching your query in this playlist.";

      try {
        parsedResponse = JSON.parse(cleanedJsonText);
        if (parsedResponse && parsedResponse.matchingVideoIds && parsedResponse.matchingVideoIds.length > 0) {
          suggestedVideoIds = parsedResponse.matchingVideoIds;
          answerText = "Based on your query, I found these videos:";
        } else if (parsedResponse && parsedResponse.matchingVideoIds) {
          // It's valid JSON with an empty array, so no matches found
          answerText = "I could not find any videos matching your query in this playlist.";
        } else {
          // Valid JSON but not the expected format
          console.error("Gemini response was valid JSON but not the expected format. Text:", cleanedJsonText);
          answerText = "Received an unexpected format from the AI.";
        }
      } catch (parseError) {
        console.error("Failed to parse Gemini JSON response:", parseError, "Cleaned text:", cleanedJsonText, "Original text:", text);
        // If parsing fails, use the raw text as the answer, and no suggested videos.
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

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

// Helper function to format duration (copied from getWatchLaterPlaylist)
function formatSecondsToHHMMSS(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return "00:00"; // Default or error format
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
1. The 'Video List' is provided in JSON format. Parse this JSON data. Each video object includes fields like 'ID', 'Title', 'Description', 'DurationSeconds', 'Topics', 'PublishedTimestamp'.
2. Carefully analyze the 'User Query' to understand all criteria (e.g., keywords, duration constraints, topic requests).
3. For each video in the 'Video List', evaluate it against ALL criteria from the 'User Query'.
   - For keyword matching, check 'Title' and 'Description'.
   - For duration, use 'DurationSeconds' (total seconds). For example, "longer than 1 hr" means 'DurationSeconds' > 3600.
   - For topics, check the 'Topics' string.
4. A video is a match ONLY IF it satisfies ALL specified criteria in the 'User Query'.
5. Your response MUST be a JSON object with a single key: "suggestedVideos".
   The value of "suggestedVideos" MUST be an array of objects. Each object in the array MUST have two keys:
     - "videoId": The 'ID' of a video from the 'Video List' that strictly matches ALL criteria.
     - "reason": A brief explanation (1-2 sentences) detailing how this specific video meets ALL criteria from the User Query.
   If NO videos strictly match ALL criteria, the "suggestedVideos" array MUST be empty. It is critical to return an empty array in this case, rather than an error or no response.
Output ONLY the JSON object.

Example for User Query "documentaries longer than 1 hour":
If a video has ID "vid3", Topics contains "Documentary", and DurationSeconds is 4000:
{
  "suggestedVideos": [
    {
      "videoId": "vid3",
      "reason": "This video is a Documentary and its duration of 4000 seconds is longer than 1 hour (3600 seconds)."
    }
  ]
}

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
      
      let cleanedJsonText = text.trim();

      // Step 1: Remove optional markdown fences
      if (cleanedJsonText.startsWith("```json")) {
        cleanedJsonText = cleanedJsonText.substring(7);
      }
      // Remove trailing markdown fence if it exists, even after initial strip
      if (cleanedJsonText.endsWith("```")) {
        cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - 3);
      }
      cleanedJsonText = cleanedJsonText.trim(); // Trim again after potential markdown removal

      // Step 2: Extract the first complete JSON object using brace balancing
      // This will run regardless of whether markdown was stripped or not.
      const firstBrace = cleanedJsonText.indexOf('{');
      if (firstBrace !== -1) {
        let balance = 0;
        let lastBraceIndex = -1;
        for (let i = firstBrace; i < cleanedJsonText.length; i++) {
          if (cleanedJsonText[i] === '{') {
            balance++;
          } else if (cleanedJsonText[i] === '}') {
            balance--;
            if (balance === 0) {
              lastBraceIndex = i;
              break; 
            }
          }
        }
        if (lastBraceIndex !== -1) {
          cleanedJsonText = cleanedJsonText.substring(firstBrace, lastBraceIndex + 1);
        } else {
          // Mismatched braces, likely not valid JSON from the start
          console.warn(`[${new Date().toISOString()}] JSON parsing warning: Mismatched braces in Gemini response after initial cleaning. Text: ${cleanedJsonText}`);
        }
      } else {
        // No opening brace found, definitely not JSON
         console.warn(`[${new Date().toISOString()}] JSON parsing warning: No opening brace found in Gemini response after initial cleaning. Text: ${cleanedJsonText}`);
      }
      // Final trim, though the substring should be tight
      cleanedJsonText = cleanedJsonText.trim();

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
            // Ensure the 'duration' field (formatted string) is present for the frontend
            const videoWithFormattedDuration = {
              ...foundVideo,
              duration: formatSecondsToHHMMSS(foundVideo.durationSeconds), // Add/overwrite with formatted duration
              reason: suggestion.reason
            };
            suggestedVideosFull.push(videoWithFormattedDuration);
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

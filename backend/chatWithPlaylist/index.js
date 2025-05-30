const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore, PropertyFilter } = require('@google-cloud/datastore'); // Added PropertyFilter
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();
let genAI; // Will be initialized after fetching API key

const VIDEOS_ENTITY = 'Videos';

// CORS Configuration
const corsOptions = {
  origin: ['https://drensin.github.io', 'https://dkr.bio', 'http://localhost:3000'],
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
        .filter(new PropertyFilter('playlistId_original', '=', playlistId));
      const [videosForPlaylist] = await datastore.runQuery(datastoreQuery);
      console.log(`[${new Date().toISOString()}] Fetched ${videosForPlaylist ? videosForPlaylist.length : 0} videos from Datastore for playlistId: ${playlistId}`);

      if (!videosForPlaylist || videosForPlaylist.length === 0) {
        res.status(200).json({ answer: `No videos found in Datastore for playlist ID ${playlistId}.`, suggestedVideos: [] });
        return;
      }

      // User requested to remove pre-filtering and the 150 video cap.
      // We will use the full list from Datastore.
      // This may lead to very large prompts and potentially long latencies or timeouts from Gemini.
      let videosToSendToGemini = videosForPlaylist;
      console.log(`[${new Date().toISOString()}] Sending all ${videosToSendToGemini.length} fetched videos to Gemini context.`);
      
      console.log(`[${new Date().toISOString()}] Starting videoContext construction (JSON format) for ${videosToSendToGemini.length} videos...`);
      const videoListForContext = videosToSendToGemini.map(video => ({
        ID: video.videoId,
        Title: video.title,
        Description: video.description || 'N/A', // Removed 800 char truncation
        DurationSeconds: video.durationSeconds,
        Views: video.viewCount ? parseInt(video.viewCount, 10) : null,
        Likes: video.likeCount ? parseInt(video.likeCount, 10) : null,
        Topics: Array.isArray(video.topicCategories) ? video.topicCategories : [], // Send as array
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
      const generationConfig = {
        temperature: 0,
        responseMimeType: 'application/json',
      };
      const thinkingConfig = { // As per user's feedback for optimization
        thinkingBudget: 0,
      };
      const model = genAI.getGenerativeModel({ model: effectiveModelId, safetySettings, generationConfig, thinkingConfig }); 
      
      const singleShotPrompt = `You are an AI assistant. I will provide a 'User Query' and a 'Video List'.
Your task is to recommend videos from the 'Video List' that best match the 'User Query'.
Use your best judgment. For each video you recommend, provide a short explanation for your selection.

User Query: "${query}"

Video List (JSON format):
${videoContext}
// Each video in the list has: ID, Title, Description, DurationSeconds, Topics (an array of strings), PublishedTimestamp.

Your response MUST be a valid JSON object with a single key: "suggestedVideos".
The value of "suggestedVideos" MUST be an array.
Each object in the array MUST have two keys:
  - "videoId": The 'ID' of a recommended video.
  - "reason": Your brief explanation for the recommendation.
If NO videos match, "suggestedVideos" MUST be an empty array.
Output ONLY the JSON object.
`;
      
      console.log(`[${new Date().toISOString()}] Sending single-shot prompt to Gemini...`);
      const result = await model.generateContent(singleShotPrompt);
      const genResponse = result.response; // Use genResponse to avoid conflict with http res
      
      let text = ""; // Declare here for broader scope
      
      if (!genResponse) {
        console.error(`[${new Date().toISOString()}] Gemini returned no response object. Full API Result:`, JSON.stringify(result, null, 2));
        // text remains ""
      } else {
        if (genResponse.promptFeedback && genResponse.promptFeedback.blockReason) {
          console.error(`[${new Date().toISOString()}] Gemini prompt was blocked. Reason: ${genResponse.promptFeedback.blockReason}. Details:`, JSON.stringify(genResponse.promptFeedback.safetyRatings, null, 2));
          // If prompt is blocked, text might be empty or contain error info not suitable for parsing.
          // For safety, we might want to ensure text is empty if blocked.
        }
        if (!genResponse.candidates || genResponse.candidates.length === 0) {
          console.error(`[${new Date().toISOString()}] Gemini returned no candidates. Full API Result:`, JSON.stringify(result, null, 2));
          // text might still be empty or from a non-candidate part of response if any.
        } else {
          const candidate = genResponse.candidates[0];
          // It's possible to have candidates but still have a blockReason at the promptFeedback level.
          // Log finishReason even if there are candidates.
          if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
            console.warn(`[${new Date().toISOString()}] Gemini generation finished with reason: ${candidate.finishReason}. Content may be incomplete or missing.`);
            if (candidate.finishReason === 'SAFETY' && candidate.safetyRatings) {
                console.warn(`[${new Date().toISOString()}] Safety ratings for candidate:`, JSON.stringify(candidate.safetyRatings, null, 2));
            }
          }
        }
        // text() helper usually gets text from the first candidate if available.
        // If candidates array is empty or content is missing, text() might return empty or throw.
        // Safely get text:
        text = (genResponse.candidates && genResponse.candidates.length > 0 && genResponse.candidates[0].content && genResponse.candidates[0].content.parts && genResponse.candidates[0].content.parts.length > 0 && genResponse.candidates[0].content.parts[0].text)
               ? genResponse.candidates[0].content.parts[0].text
               : "";
        if (genResponse.text && typeof genResponse.text === 'function' && !text) { // Fallback to text() if direct access failed
            try {
                text = genResponse.text() || "";
            } catch (e) {
                console.warn(`[${new Date().toISOString()}] Error calling genResponse.text(): ${e.message}. Defaulting text to empty.`);
                text = "";
            }
        }
      }
      
      console.log(`[${new Date().toISOString()}] Gemini response text (length ${text.length}):`, text);
      let cleanedJsonText = text.trim(); // Now cleanedJsonText is defined in the correct scope for subsequent logic

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
      let answerText = "Could not find any videos matching your query in this playlist."; // Default answer

      if (!cleanedJsonText) { // Check if cleanedJsonText is empty
        console.warn(`[${new Date().toISOString()}] Gemini response was empty after cleaning. Assuming no suggestions.`);
        // suggestionsFromGemini remains [], answerText remains default.
      } else {
        try {
          parsedResponse = JSON.parse(cleanedJsonText);
          if (parsedResponse && Array.isArray(parsedResponse.suggestedVideos) && parsedResponse.suggestedVideos.length > 0) {
            suggestionsFromGemini = parsedResponse.suggestedVideos; 
            answerText = "Based on your query, I found these videos:";
          } else if (parsedResponse && Array.isArray(parsedResponse.suggestedVideos)) {
            // This case means suggestedVideos is an empty array, which is valid.
            answerText = "I could not find any videos matching your query in this playlist.";
          } else {
            // Valid JSON, but not the expected {suggestedVideos: Array} structure
            console.error(`[${new Date().toISOString()}] Gemini response was valid JSON but not the expected format. Expected {suggestedVideos: [...]}. Received:`, cleanedJsonText);
            answerText = "The AI returned data in an unexpected format. Please try rephrasing your query.";
            suggestionsFromGemini = []; // Ensure empty
          }
        } catch (parseError) {
          console.error(`[${new Date().toISOString()}] Failed to parse Gemini JSON response. Error: ${parseError.message}. Cleaned text: "${cleanedJsonText}". Original text: "${text}"`);
          answerText = `There was an issue processing the AI's response. You could try rephrasing your query. Raw AI output (if any): ${text}`;
          suggestionsFromGemini = []; // Ensure empty on error
        }
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

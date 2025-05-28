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
      const { query, playlistId, modelId } = req.body; // Add modelId

      if (!query || !playlistId) {
        res.status(400).json({ error: 'Missing query or playlistId in request body' });
        return;
      }
      
      const effectiveModelId = modelId || "gemini-2.5-flash-preview-05-20"; // Default to specific flash preview model
      console.log(`Using Gemini model: ${effectiveModelId}`);

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
      let videoContext = "Video List:\n";
      videosForPlaylist.forEach(video => {
        // Increase description length, ensure it's not null before substring
        const descSnippet = video.description ? video.description.substring(0, 400) + '...' : 'N/A';
        videoContext += `- ID: ${video.videoId}, Title: "${video.title}", Description: "${descSnippet}"\n`;
      });

      // 3. Prepare prompt for Gemini
      const model = genAI.getGenerativeModel({ model: effectiveModelId }); 
      const prompt = `You are a helpful assistant for recommending videos from a specific playlist.
Your task is to analyze the user's query and suggest relevant videos from the provided "Video List".

User Query: "${query}"

${videoContext}

Instructions for your response:
1. Carefully read the User Query.
2. Examine the Title and Description of each video in the Video List provided below.
3. Identify videos from the list that are highly relevant to the User Query.
   - If the User Query is a name (e.g., "Cory Henry"), find videos where this name appears in the Title or Description.
   - If the User Query is a topic, find videos whose Title or Description discuss this topic.
   - A video is relevant if its title or description contains the exact keywords, names, or closely related terms from the User Query.
4. Your response MUST be a JSON object with exactly two keys:
   - "answer": A string providing a brief textual response. If relevant videos are found, say something like "Based on your query, I found these videos:". If no relevant videos are found, state that clearly, for example: "I could not find any videos matching your query in this playlist."
   - "suggestedVideoIds": An array of strings. Each string MUST be a video ID from the provided Video List that you identified as highly relevant. If no videos are relevant, this array MUST be empty. Do not include IDs not present in the list.

Example:
User Query: "cats playing piano"
Video List:
- ID: "vid1", Title: "Funny Cats Compilation", Description: "Cats doing funny things."
- ID: "vid2", Title: "Piano Masterclass", Description: "Learn to play piano."
- ID: "vid3", Title: "Cat Plays Piano Concerto", Description: "My talented cat plays a beautiful piano piece."
Response:
{
  "answer": "Based on your query, I found these videos:",
  "suggestedVideoIds": ["vid3"]
}
`;
      
      console.log("Sending prompt to Gemini...");
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      console.log("Gemini response text:", text);

      let cleanedJsonText = text.trim();
      if (cleanedJsonText.startsWith("```json")) {
        cleanedJsonText = cleanedJsonText.substring(7); // Remove ```json\n
      }
      if (cleanedJsonText.endsWith("```")) {
        cleanedJsonText = cleanedJsonText.substring(0, cleanedJsonText.length - 3);
      }
      cleanedJsonText = cleanedJsonText.trim(); // Trim any remaining whitespace

      let geminiJson = { answer: "Could not parse suggestion from AI.", suggestedVideoIds: [] };
      try {
        geminiJson = JSON.parse(cleanedJsonText);
      } catch (parseError) {
        console.error("Failed to parse cleaned Gemini JSON response:", parseError, "Cleaned text:", cleanedJsonText, "Original text:", text);
        // Fallback: use the original raw text as the answer if JSON parsing still fails
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

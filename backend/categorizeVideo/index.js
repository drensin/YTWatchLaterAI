const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { Datastore } = require('@google-cloud/datastore');
const { VertexAI } = require('@google-cloud/vertexai'); // Using Vertex AI SDK for Gemini
const cors = require('cors');

// Initialize GCP clients
const secretManagerClient = new SecretManagerServiceClient();
const datastore = new Datastore();

// --- CORS Configuration ---
// Required if this function can be triggered via HTTP by the frontend
const corsOptions = {
  origin: 'https://drensin.github.io', // IMPORTANT: Replace with your actual GitHub Pages URL
  methods: ['POST', 'OPTIONS'],
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

// --- Gemini Configuration ---
let vertex_ai;
let generativeModel;

async function initializeGeminiClient() {
  if (generativeModel) return generativeModel;

  const projectId = await getSecret('GCP_PROJECT_ID'); // Or hardcode if it's the same as the function's project
  const location = 'us-central1'; // Or your preferred GCP region for Vertex AI

  vertex_ai = new VertexAI({ project: projectId, location: location });

  // Instantiate the model
  // Use "gemini-1.0-pro-vision" for multimodal (text and image)
  // Use "gemini-1.0-pro" for text only
  generativeModel = vertex_ai.getGenerativeModel({
    model: 'gemini-1.0-pro', // Choose the appropriate model
  });
  console.log("Gemini client initialized.");
  return generativeModel;
}


// --- Cloud Function Entry Point ---
// This function can be HTTP-triggered (e.g., for a specific video or a batch)
// or Pub/Sub-triggered (e.g., after new videos are added by getWatchLaterPlaylist).
exports.categorizeVideo = async (req, res) => {
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
      await initializeGeminiClient();
      const geminiApiKey = await getSecret('GEMINI_API_KEY'); // This might not be directly used if using Vertex AI SDK with service account auth

      // Determine video(s) to categorize.
      // For HTTP trigger, expect videoId(s) in the request body.
      // For Pub/Sub, message data would contain videoId(s).
      const videoId = req.body?.videoId; // Example: categorize a single video
      const videoIds = req.body?.videoIds; // Example: categorize a batch of videos

      if (!videoId && (!videoIds || videoIds.length === 0)) {
        res.status(400).json({ error: 'Missing videoId or videoIds in request body.' });
        return;
      }

      let videosToProcess = [];
      if (videoId) {
        videosToProcess.push(videoId);
      } else {
        videosToProcess = videoIds;
      }

      let categorizedCount = 0;
      let errors = [];

      for (const currentVideoId of videosToProcess) {
        const videoKey = datastore.key(['Videos', currentVideoId]);
        const [videoEntity] = await datastore.get(videoKey);

        if (!videoEntity) {
          console.warn(`Video ${currentVideoId} not found in Datastore. Skipping.`);
          errors.push({ videoId: currentVideoId, error: 'Not found in Datastore' });
          continue;
        }

        const textToCategorize = `Title: ${videoEntity.title}\nDescription: ${videoEntity.description}`;
        // Simple prompt, can be much more sophisticated
        const prompt = `Analyze the following YouTube video information and suggest 3-5 relevant categories or tags.
        Focus on topics, themes, and potential areas of interest. Output as a comma-separated list.
        Video Information:
        ${textToCategorize}

        Categories:`;

        try {
          const request = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          };
          const streamingResp = await generativeModel.generateContentStream(request);
          // Wait for the stream to complete and concatenate the response
          let fullResponseText = "";
          for await (const item of streamingResp.stream) {
            if (item.candidates && item.candidates[0].content && item.candidates[0].content.parts[0]) {
                 fullResponseText += item.candidates[0].content.parts[0].text;
            }
          }

          if (!fullResponseText) {
            throw new Error('No content returned from Gemini.');
          }

          const categories = fullResponseText.split(',').map(cat => cat.trim()).filter(cat => cat);
          console.log(`Video ${currentVideoId} categories by Gemini: ${categories.join(', ')}`);

          // Update Datastore with Gemini categories
          videoEntity.geminiCategories = categories;
          videoEntity.lastCategorized = new Date();
          await datastore.update({
            key: videoKey,
            data: videoEntity,
          });
          categorizedCount++;
        } catch (geminiError) {
          console.error(`Error categorizing video ${currentVideoId} with Gemini:`, geminiError);
          errors.push({ videoId: currentVideoId, error: `Gemini API error: ${geminiError.message}` });
        }
      }

      if (errors.length > 0) {
        res.status(207).json({
            message: `Processed ${videosToProcess.length} videos. ${categorizedCount} categorized, ${errors.length} failed.`,
            categorizedCount,
            errors
        });
      } else {
        res.status(200).json({
            message: `Successfully categorized ${categorizedCount} videos.`,
            categorizedCount
        });
      }

    } catch (error) {
      console.error('Error in categorizeVideo function:', error);
      res.status(500).json({ error: 'Failed to categorize video(s).', details: error.message });
    }
  });
};

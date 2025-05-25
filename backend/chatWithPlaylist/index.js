const { Datastore } = require('@google-cloud/datastore');
const { VertexAI } = require('@google-cloud/vertexai'); // If using Gemini for query understanding
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const cors = require('cors');

// Initialize GCP clients
const datastore = new Datastore();
const secretManagerClient = new SecretManagerServiceClient();


// --- CORS Configuration ---
const corsOptions = {
  origin: 'https://drensin.github.io', // IMPORTANT: Replace with your actual GitHub Pages URL
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
const corsMiddleware = cors(corsOptions);

// Helper function to get secrets (if needed for Gemini API key directly, though VertexAI SDK usually uses service account)
async function getSecret(secretName) {
  const [version] = await secretManagerClient.accessSecretVersion({
    name: `projects/watchlaterai-460918/secrets/${secretName}/versions/latest`, // IMPORTANT: Replace YOUR_PROJECT_ID
  });
  return version.payload.data.toString('utf8');
}

// --- Gemini Configuration (Optional, for advanced query understanding) ---
let vertex_ai_chat;
let generativeModelChat;

async function initializeGeminiChatClient() {
  if (generativeModelChat) return generativeModelChat;

  // This assumes you might use Gemini to parse the user's query into structured search terms
  // or to understand intent. If your query logic is simpler (e.g., direct keyword search on titles/descriptions),
  // you might not need Gemini here.
  const projectId = await getSecret('GCP_PROJECT_ID');
  const location = 'us-central1';
  vertex_ai_chat = new VertexAI({ project: projectId, location: location });
  generativeModelChat = vertex_ai_chat.getGenerativeModel({
    model: 'gemini-1.0-pro', // Or another suitable model
  });
  console.log("Gemini Chat client initialized for query processing.");
  return generativeModelChat;
}

// --- Cloud Function Entry Point ---
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
      const userQuery = req.body?.query;
      if (!userQuery || typeof userQuery !== 'string' || userQuery.trim() === "") {
        res.status(400).json({ error: 'Missing or invalid query in request body.' });
        return;
      }

      console.log(`Received query: "${userQuery}"`);

      // Placeholder for search/filtering logic.
      // This is where you'd implement how to find videos based on the query.
      //
      // Option 1: Simple keyword search in Datastore (title, description, geminiCategories)
      // Option 2: Use Gemini to parse `userQuery` into more structured search parameters
      //           or to generate embeddings for semantic search if you have video embeddings.

      // --- Example: Simple Keyword Search (Case-insensitive) ---
      const query = datastore.createQuery('Videos');
      // This is a very basic example. Datastore doesn't support full-text search directly.
      // For more complex searching, consider:
      // 1. Storing keywords in an array property and using "IN" or "=" filters.
      // 2. Using a dedicated search service like Elasticsearch or Algolia, populated from Datastore.
      // 3. If using Gemini categories, you can filter by those.

      // A more robust simple search might involve fetching all and filtering in memory,
      // or breaking the query into keywords and trying to match them.
      // This example will be very limited.

      const [allVideos] = await datastore.runQuery(query);
      const lowerCaseUserQuery = userQuery.toLowerCase();
      
      const suggestedVideos = allVideos.filter(video => {
        const titleMatch = video.title?.toLowerCase().includes(lowerCaseUserQuery);
        const descriptionMatch = video.description?.toLowerCase().includes(lowerCaseUserQuery);
        const categoryMatch = video.geminiCategories?.some(cat => cat.toLowerCase().includes(lowerCaseUserQuery));
        return titleMatch || descriptionMatch || categoryMatch;
      }).slice(0, 20); // Limit results

      console.log(`Found ${suggestedVideos.length} videos matching query (simple search).`);

      // --- Example: Using Gemini for query understanding (more advanced) ---
      // Uncomment and adapt if you want to use Gemini to refine the search.
      /*
      await initializeGeminiChatClient();
      const promptForGemini = `
        Given the user query "${userQuery}" about their YouTube Watch Later playlist,
        identify key terms or topics the user is interested in.
        Also, suggest if the query implies a desire for videos that are "short", "medium", or "long" in duration,
        or if it mentions specific channels or upload dates (e.g., "recent", "last week").
        Output a JSON object with fields like "keywords" (array of strings), "duration_preference" (string),
        "channel_preference" (string), "recency_preference" (string).
        If a field is not applicable, omit it or set its value to null.

        Example: User query "funny cat videos from last month"
        Output:
        {
          "keywords": ["funny", "cat"],
          "recency_preference": "last month"
        }
      `;
      const geminiRequest = { contents: [{ role: 'user', parts: [{ text: promptForGemini }] }] };
      const streamingResp = await generativeModelChat.generateContentStream(geminiRequest);
      let geminiResponseText = "";
      for await (const item of streamingResp.stream) {
          geminiResponseText += item.candidates[0].content.parts[0].text;
      }
      let searchParams;
      try {
        searchParams = JSON.parse(geminiResponseText);
        console.log("Gemini parsed search params:", searchParams);
        // Now use searchParams to build a more targeted Datastore query or filter results
      } catch (e) {
        console.error("Could not parse Gemini response for query understanding:", e, geminiResponseText);
        // Fallback to simple search or return an error
      }
      */


      res.status(200).json({
        query: userQuery,
        suggestedVideos: suggestedVideos, // Replace with results from your chosen search logic
      });

    } catch (error) {
      console.error('Error in chatWithPlaylist function:', error);
      res.status(500).json({ error: 'Failed to process chat query.', details: error.message });
    }
  });
};

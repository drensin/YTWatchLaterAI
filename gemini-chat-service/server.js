/**
 * @fileoverview WebSocket server for the ReelWorthy Gemini chat service.
 * Handles chat initialization with playlist context from Datastore,
 * processes user queries with the Gemini API, and streams responses.
 * It maintains active chat sessions in memory.
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const { Datastore } = require('@google-cloud/datastore');

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
}

// --- Initialize Clients ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const datastore = new Datastore();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      level: 6 // Compression level (0-9)
    },
    // clientNoContextTakeover: true, // Default is true
    // serverNoContextTakeover: true  // Default is true
  }
});

// In-memory store for active Gemini chat sessions
// ws -> { chat: GeminiChatSession, playlistId: string, modelId: string, videosForPlaylist: Array }
const activeSessions = new Map();

// --- WebSocket Server Logic ---
wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected');

    ws.on('message', async (messageString) => {
        let message;
        try {
            message = JSON.parse(messageString);
            console.log('[WebSocket] Received message:', message);
        } catch (error) {
            console.error('[WebSocket] Failed to parse message:', messageString, error);
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid message format' }));
            return;
        }

        const currentSession = activeSessions.get(ws);

        if (message.type === 'INIT_CHAT') {
            /**
             * Handles the 'INIT_CHAT' message from a client.
             * Initializes a new Gemini chat session for the specified playlist.
             * Fetches video data for the playlist from Datastore to provide context.
             * Expected message.payload: { playlistId: string, modelId?: string }
             * Sends 'CHAT_INITIALIZED' on success or 'ERROR' on failure.
             */
            const { playlistId, modelId: clientModelId } = message.payload;
            const effectiveModelId = clientModelId || "gemini-2.5-flash-preview-05-20";

            if (!playlistId) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'playlistId is required for INIT_CHAT' }));
                return;
            }

            try {
                console.log(`[INIT_CHAT] Fetching videos for playlist: ${playlistId}`);
                const videosQuery = datastore.createQuery('Videos')
                    .filter('associatedPlaylistIds', '=', playlistId);
                const [videosForPlaylist] = await datastore.runQuery(videosQuery);
                
                if (!videosForPlaylist || videosForPlaylist.length === 0) {
                    ws.send(JSON.stringify({ type: 'ERROR', error: `No videos found for playlist ${playlistId}` }));
                    activeSessions.delete(ws);
                    return;
                }
                console.log(`[INIT_CHAT] Fetched ${videosForPlaylist.length} videos.`);

                const videoListForContext = videosForPlaylist.map(video => ({
                    ID: video.videoId, Title: video.title, Description: video.description || 'N/A',
                    DurationSeconds: video.durationSeconds, Views: video.viewCount ? parseInt(video.viewCount, 10) : null,
                    Likes: video.likeCount ? parseInt(video.likeCount, 10) : null, Topics: Array.isArray(video.topicCategories) ? video.topicCategories : [],
                    PublishedTimestamp: video.publishedAt ? new Date(video.publishedAt).getTime() : null
                }));
                const videoContextString = `Video List (JSON format):\n${JSON.stringify(videoListForContext, null, 2)}`;
                
                const safetySettings = [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ];
                const generationConfig = { temperature: 0, responseMimeType: 'application/json' };
                
                const modelInstance = genAI.getGenerativeModel({ model: effectiveModelId, safetySettings: safetySettings });
                const chat = modelInstance.startChat({
                    history: [
                        { role: "user", parts: [{ text: "You are an AI assistant. I will provide a 'Video List'. Your task is to recommend videos from this list that best match the 'User Query'. Your response MUST be a valid JSON object with a single key: 'suggestedVideos'. The value of 'suggestedVideos' MUST be an array. Each object in the array MUST have two keys: 'videoId' and 'reason'. If NO videos match, 'suggestedVideos' MUST be an empty array. Output ONLY the JSON object." }] },
                        { role: "model", parts: [{ text: "Understood. I will use the provided video list and user query to make recommendations in the specified JSON format." }] },
                        { role: "user", parts: [{ text: videoContextString }] }
                    ],
                    generationConfig: generationConfig
                });

                activeSessions.set(ws, { chat, playlistId, modelId: effectiveModelId, videosForPlaylist });
                ws.send(JSON.stringify({ type: 'CHAT_INITIALIZED', payload: { playlistId, modelId: effectiveModelId } }));
                console.log(`[INIT_CHAT] Chat initialized for playlist: ${playlistId} with model ${effectiveModelId}`);

            } catch (error) {
                console.error('[INIT_CHAT] Error initializing chat:', error);
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to initialize chat session: ' + error.message }));
                activeSessions.delete(ws);
            }

        } else if (message.type === 'USER_QUERY') {
            /**
             * Handles a 'USER_QUERY' message from a client.
             * Uses the existing chat session to send the query to Gemini.
             * Streams 'STREAM_CHUNK' messages back to the client for the response,
             * followed by a 'STREAM_END' message with the full answer and suggested videos.
             * Expected message.payload: { query: string }
             * Sends 'ERROR' if the chat is not initialized or other issues occur.
             */
            if (!currentSession || !currentSession.chat) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Chat not initialized. Send INIT_CHAT first.' }));
                return;
            }
            const { query } = message.payload;
            const { videosForPlaylist, chat: userChatSession } = currentSession;

            if (!query) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Query is required for USER_QUERY' }));
                return;
            }

            try {
                console.log(`[USER_QUERY][${new Date().toISOString()}] Sending query to Gemini for playlist ${currentSession.playlistId}: "${query}"`);
                
                const streamResult = await userChatSession.sendMessageStream(query);
                let accumulatedText = "";
                let firstByteReceived = false;

                for await (const chunk of streamResult.stream) {
                    if (!firstByteReceived) {
                        console.log(`[USER_QUERY_RESPONSE_START][${new Date().toISOString()}] First byte received from Gemini for playlist ${currentSession.playlistId}, query: "${query}"`);
                        firstByteReceived = true;
                    }

                    if (ws.readyState !== WebSocket.OPEN) {
                        console.log(`[USER_QUERY][${new Date().toISOString()}] WebSocket closed by client during stream. Aborting.`);
                        return; 
                    }
                    const chunkText = chunk.text();
                    accumulatedText += chunkText;
                    ws.send(JSON.stringify({ type: 'STREAM_CHUNK', payload: { textChunk: chunkText } }));
                }

                let numSuggestedItems = 0;
                try {
                    const parsedResponse = JSON.parse(accumulatedText);
                    if (parsedResponse && Array.isArray(parsedResponse.suggestedVideos)) {
                        numSuggestedItems = parsedResponse.suggestedVideos.length;
                    }
                } catch (e) { /* Ignore parsing error for logging num items */ }
                console.log(`[USER_QUERY_RESPONSE_END][${new Date().toISOString()}] Full response received from Gemini for playlist ${currentSession.playlistId}, query: "${query}". Number of suggested items: ${numSuggestedItems}`);
                
                console.log(`[USER_QUERY][${new Date().toISOString()}] Stream finished. Accumulated text length: ${accumulatedText.length}`);

                let sanitizedText = accumulatedText.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
                    if (match === '\t' || match === '\n' || match === '\r') return match;
                    return '';
                });

                let allSuggestedVideos = [];
                let currentTextToParse = sanitizedText.trim();
                if (currentTextToParse.startsWith("```json")) currentTextToParse = currentTextToParse.substring(7);
                if (currentTextToParse.endsWith("```")) currentTextToParse = currentTextToParse.substring(0, currentTextToParse.length - 3);
                currentTextToParse = currentTextToParse.trim();
                
                let startIndex = 0;
                while (startIndex < currentTextToParse.length) {
                    const firstBrace = currentTextToParse.indexOf('{', startIndex);
                    if (firstBrace === -1) break;
                    let balance = 0;
                    let lastBraceIndex = -1;
                    for (let i = firstBrace; i < currentTextToParse.length; i++) {
                        if (currentTextToParse[i] === '{') balance++;
                        else if (currentTextToParse[i] === '}') {
                            balance--;
                            if (balance === 0) { lastBraceIndex = i; break; }
                        }
                    }
                    if (lastBraceIndex !== -1) {
                        const jsonCandidate = currentTextToParse.substring(firstBrace, lastBraceIndex + 1);
                        try {
                            const parsedPart = JSON.parse(jsonCandidate);
                            if (parsedPart && Array.isArray(parsedPart.suggestedVideos)) {
                                allSuggestedVideos = allSuggestedVideos.concat(parsedPart.suggestedVideos);
                            } else {
                                console.warn(`[JSON_PARSE] Parsed JSON part not expected format. Snippet: ${jsonCandidate.substring(0, 200)}`);
                            }
                        } catch (parseError) {
                            console.warn(`[JSON_PARSE] Failed to parse JSON part. Error: ${parseError.message}. Snippet: ${jsonCandidate.substring(0, 200)}`);
                        }
                        startIndex = lastBraceIndex + 1;
                    } else {
                        console.warn(`[JSON_PARSE] Mismatched braces in remaining text. Snippet: ${currentTextToParse.substring(startIndex, startIndex + 200)}`);
                        break;
                    }
                }

                let suggestionsFromGemini = [];
                let answerText = "Could not find any videos matching your query in this playlist.";
                if (allSuggestedVideos.length > 0) {
                    suggestionsFromGemini = allSuggestedVideos;
                    answerText = "Based on your query, I found these videos:";
                } else if (sanitizedText.trim().length > 0) {
                    answerText = `The AI returned data but no matching videos were found or the format was unexpected.`;
                }
                
                /**
                 * Formats total seconds into HH:MM:SS or MM:SS string.
                 * @param {number|null|undefined} totalSeconds The total seconds.
                 * @return {string} The formatted time string (e.g., "01:23:45" or "23:45"). Returns "00:00" if input is invalid.
                 */
                function formatSecondsToHHMMSS(totalSeconds) {
                    if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) return "00:00";
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    const s = Math.floor(totalSeconds % 60); // Ensure seconds are integers
                    return `${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
                
                const suggestedVideosFull = suggestionsFromGemini.map(suggestion => {
                    const foundVideo = videosForPlaylist.find(v => v.videoId === suggestion.videoId);
                    return foundVideo ? { ...foundVideo, duration: formatSecondsToHHMMSS(foundVideo.durationSeconds), reason: suggestion.reason } : null;
                }).filter(v => v !== null);

                ws.send(JSON.stringify({ 
                    type: 'STREAM_END', 
                    payload: { answer: answerText, suggestedVideos: suggestedVideosFull } 
                }));

            } catch (error) {
                console.error('[USER_QUERY] Error processing stream or sending message to Gemini:', error);
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to get response from AI: ' + error.message }));
            }
        } else if (message.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG' }));
            console.log('[WebSocket] Sent PONG to client.');
        } else {
            ws.send(JSON.stringify({ type: 'ERROR', error: `Unknown message type: ${message.type}` }));
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        activeSessions.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        activeSessions.delete(ws);
    });
});

app.get('/', (req, res) => {
    res.status(200).send('Gemini Chat Service is running.');
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

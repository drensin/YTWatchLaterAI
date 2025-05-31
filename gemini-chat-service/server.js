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
const wss = new WebSocket.Server({ server });

// In-memory store for active Gemini chat sessions, mapping WebSocket connection to ChatSession object
const activeSessions = new Map(); // ws -> { chat: GeminiChatSession, playlistId: string, modelId: string }

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
            const { playlistId, modelId: clientModelId } = message.payload;
            const effectiveModelId = clientModelId || "gemini-2.5-flash-preview-05-20"; // Corrected default model ID

            if (!playlistId) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'playlistId is required for INIT_CHAT' }));
                return;
            }

            try {
                // 1. Fetch video list from Datastore for the playlistId
                console.log(`[INIT_CHAT] Fetching videos for playlist: ${playlistId}`);
                const videosQuery = datastore.createQuery('Videos') 
                    .filter('playlistId_original', '=', playlistId); 
                const [videosForPlaylist] = await datastore.runQuery(videosQuery);
                
                if (!videosForPlaylist || videosForPlaylist.length === 0) {
                    ws.send(JSON.stringify({ type: 'ERROR', error: `No videos found for playlist ${playlistId}` }));
                    activeSessions.delete(ws); 
                    return;
                }
                console.log(`[INIT_CHAT] Fetched ${videosForPlaylist.length} videos.`);

                // 2. Construct videoContextString (adapt your existing logic)
                const videoListForContext = videosForPlaylist.map(video => ({
                    ID: video.videoId,
                    Title: video.title,
                    Description: video.description || 'N/A',
                    DurationSeconds: video.durationSeconds,
                    Views: video.viewCount ? parseInt(video.viewCount, 10) : null,
                    Likes: video.likeCount ? parseInt(video.likeCount, 10) : null,
                    Topics: Array.isArray(video.topicCategories) ? video.topicCategories : [],
                    PublishedTimestamp: video.publishedAt ? new Date(video.publishedAt).getTime() : null
                }));
                const videoContextString = `Video List (JSON format):\n${JSON.stringify(videoListForContext, null, 2)}`;
                
                // 3. Define Gemini safety and generation configurations
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
                
                // 4. Initialize Gemini model and chat session
                const modelInstance = genAI.getGenerativeModel({ 
                    model: effectiveModelId,
                    safetySettings: safetySettings
                });

                const chat = modelInstance.startChat({
                    history: [
                        { role: "user", parts: [{ text: "You are an AI assistant. I will provide a 'Video List'. Your task is to recommend videos from this list that best match the 'User Query'. Your response MUST be a valid JSON object with a single key: 'suggestedVideos'. The value of 'suggestedVideos' MUST be an array. Each object in the array MUST have two keys: 'videoId' and 'reason'. If NO videos match, 'suggestedVideos' MUST be an empty array. Output ONLY the JSON object." }] },
                        { role: "model", parts: [{ text: "Understood. I will use the provided video list and user query to make recommendations in the specified JSON format." }] },
                        { role: "user", parts: [{ text: videoContextString }] }
                    ],
                    generationConfig: generationConfig 
                });

                // Store videosForPlaylist along with the chat session
                activeSessions.set(ws, { chat, playlistId, modelId: effectiveModelId, videosForPlaylist });
                ws.send(JSON.stringify({ type: 'CHAT_INITIALIZED', payload: { playlistId, modelId: effectiveModelId } }));
                console.log(`[INIT_CHAT] Chat initialized for playlist: ${playlistId} with model ${effectiveModelId}`);

            } catch (error) {
                console.error('[INIT_CHAT] Error initializing chat:', error);
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to initialize chat session: ' + error.message }));
                activeSessions.delete(ws); 
            }

        } else if (message.type === 'USER_QUERY') {
            if (!currentSession || !currentSession.chat) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Chat not initialized. Send INIT_CHAT first.' }));
                return;
            }
            const { query } = message.payload;
            // Retrieve videosForPlaylist from the current session
            const { videosForPlaylist } = currentSession; 

            if (!query) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Query is required for USER_QUERY' }));
                return;
            }

            try {
                console.log(`[USER_QUERY] Sending query to Gemini for playlist ${currentSession.playlistId}: "${query}"`);
                const result = await currentSession.chat.sendMessage(query);
                
                let text = "";
                if (!result.response) {
                    console.error(`[${new Date().toISOString()}] Gemini returned no response object. Full API Result:`, JSON.stringify(result, null, 2));
                } else {
                    if (result.response.promptFeedback && result.response.promptFeedback.blockReason) {
                        console.error(`[${new Date().toISOString()}] Gemini prompt was blocked. Reason: ${result.response.promptFeedback.blockReason}. Details:`, JSON.stringify(result.response.promptFeedback.safetyRatings, null, 2));
                    }
                    if (!result.response.candidates || result.response.candidates.length === 0) {
                        console.error(`[${new Date().toISOString()}] Gemini returned no candidates. Full API Result:`, JSON.stringify(result, null, 2));
                    } else {
                        const candidate = result.response.candidates[0];
                        if (candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                            console.warn(`[${new Date().toISOString()}] Gemini generation finished with reason: ${candidate.finishReason}. Content may be incomplete or missing.`);
                            if (candidate.finishReason === 'SAFETY' && candidate.safetyRatings) {
                                console.warn(`[${new Date().toISOString()}] Safety ratings for candidate:`, JSON.stringify(candidate.safetyRatings, null, 2));
                            }
                        }
                    }
                    text = (result.response.candidates && result.response.candidates.length > 0 && result.response.candidates[0].content && result.response.candidates[0].content.parts && result.response.candidates[0].content.parts.length > 0 && result.response.candidates[0].content.parts[0].text)
                           ? result.response.candidates[0].content.parts[0].text
                           : "";
                    if (result.response.text && typeof result.response.text === 'function' && !text) {
                        try {
                            text = result.response.text() || "";
                        } catch (e) {
                            console.warn(`[${new Date().toISOString()}] Error calling result.response.text(): ${e.message}. Defaulting text to empty.`);
                            text = "";
                        }
                    }
                }

                // Sanitize text to remove invalid JSON control characters before parsing
                // Sanitize text to remove invalid JSON control characters before parsing.
                // This regex matches C0 (U+0000–U+001F) and C1 (U+007F–U+009F) Unicode control character blocks.
                // It preserves tab (\t), newline (\n), and carriage return (\r) as these are valid in JSON strings (when escaped).
                text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
                    if (match === '\t' || match === '\n' || match === '\r') {
                        return match; 
                    }
                    return ''; // Remove other control characters
                });

                let allSuggestedVideos = [];
                let currentText = text.trim();
                let startIndex = 0;

                // Remove markdown fences if present at the very beginning/end
                if (currentText.startsWith("```json")) {
                    currentText = currentText.substring(7);
                }
                if (currentText.endsWith("```")) {
                    currentText = currentText.substring(0, currentText.length - 3);
                }
                currentText = currentText.trim(); // Trim again after potential markdown removal

                // Loop to find and parse all JSON objects in the text
                while (startIndex < currentText.length) {
                    const firstBrace = currentText.indexOf('{', startIndex);
                    if (firstBrace === -1) break; // No more opening braces found

                    let balance = 0;
                    let lastBraceIndex = -1;
                    for (let i = firstBrace; i < currentText.length; i++) {
                        if (currentText[i] === '{') {
                            balance++;
                        } else if (currentText[i] === '}') {
                            balance--;
                            if (balance === 0) {
                                lastBraceIndex = i;
                                break; // Found a complete JSON object
                            }
                        }
                    }

                    if (lastBraceIndex !== -1) {
                        const jsonCandidate = currentText.substring(firstBrace, lastBraceIndex + 1);
                        try {
                            const parsedPart = JSON.parse(jsonCandidate);
                            // Check if the parsed part has the expected 'suggestedVideos' array
                            if (parsedPart && Array.isArray(parsedPart.suggestedVideos)) {
                                allSuggestedVideos = allSuggestedVideos.concat(parsedPart.suggestedVideos);
                            } else {
                                console.warn(`[${new Date().toISOString()}] Parsed JSON part was not expected format {suggestedVideos: [...]}. Part (snippet): ${jsonCandidate.substring(0, Math.min(jsonCandidate.length, 200))}...`);
                            }
                        } catch (parseError) {
                            console.warn(`[${new Date().toISOString()}] Failed to parse JSON part. Error: ${parseError.message}. Part (snippet): ${jsonCandidate.substring(0, Math.min(jsonCandidate.length, 200))}...`);
                        }
                        startIndex = lastBraceIndex + 1; // Continue search after this found JSON object
                    } else {
                        // Mismatched braces or incomplete JSON object from this point onwards
                        console.warn(`[${new Date().toISOString()}] JSON parsing warning: Mismatched braces or incomplete JSON in remaining text (snippet): ${currentText.substring(startIndex, Math.min(currentText.length, startIndex + 500))}...`);
                        break; // Stop trying to parse if a complete object cannot be found
                    }
                }

                let suggestionsFromGemini = [];
                let answerText = "I could not find any videos matching your query in this playlist.";

                if (allSuggestedVideos.length > 0) {
                    suggestionsFromGemini = allSuggestedVideos;
                    answerText = "Based on your query, I found these videos:";
                } else {
                    // If no suggestions found, check if original text had any content at all
                    if (text.trim().length > 0) {
                        answerText = `The AI returned data but no matching videos were found or the format was unexpected. Raw AI output (snippet): ${text.substring(0, Math.min(text.length, 200))}...`;
                    }
                }

                // Helper function to format duration (copied from getWatchLaterPlaylist)
                function formatSecondsToHHMMSS(totalSeconds) {
                    if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
                        return "00:00";
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
                
                const suggestedVideosFull = [];
                if (suggestionsFromGemini.length > 0) {
                    suggestionsFromGemini.forEach(suggestion => {
                        const foundVideo = videosForPlaylist.find(v => v.videoId === suggestion.videoId);
                        if (foundVideo) {
                            const videoWithFormattedDuration = {
                                ...foundVideo,
                                duration: formatSecondsToHHMMSS(foundVideo.durationSeconds),
                                reason: suggestion.reason
                            };
                            suggestedVideosFull.push(videoWithFormattedDuration);
                        } else {
                            console.error(`[${new Date().toISOString()}] Video ID ${suggestion.videoId} suggested by Gemini was not found in the current videosForPlaylist array.`);
                        }
                    });
                }

                ws.send(JSON.stringify({ 
                    type: 'AI_RESPONSE', 
                    payload: { 
                        answer: answerText, 
                        suggestedVideos: suggestedVideosFull 
                    } 
                }));

            } catch (error) {
                console.error('[USER_QUERY] Error sending message to Gemini:', error);
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to get response from AI: ' + error.message }));
            }
        } else if (message.type === 'PING') {
            // Respond to PING with PONG to keep the connection alive
            ws.send(JSON.stringify({ type: 'PONG' }));
            console.log('[WebSocket] Sent PONG to client.');
        } else {
            ws.send(JSON.stringify({ type: 'ERROR', error: `Unknown message type: ${message.type}` }));
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        activeSessions.delete(ws); // Clean up the session from memory
    });

    ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        activeSessions.delete(ws); // Clean up on error too
    });
});

// Basic HTTP route for health checks (good practice for Cloud Run)
app.get('/', (req, res) => {
    res.status(200).send('Gemini Chat Service is running.');
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

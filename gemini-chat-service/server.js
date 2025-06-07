/**
 * @fileoverview WebSocket server for the ReelWorthy Gemini chat service.
 * Handles chat initialization with playlist context from Datastore,
 * processes user queries with the Gemini API, and streams responses.
 * It maintains active chat sessions in memory.
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Changed from VertexAI
const { Datastore } = require('@google-cloud/datastore');

// --- Configuration ---
const PORT = process.env.PORT || 8080;
// API Key for @google/generative-ai.
// IMPORTANT: In production, this MUST be from a secure environment variable (e.g., set by Secret Manager).
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// --- Initialize Clients ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY); // Changed client
const datastore = new Datastore();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      level: 6 // Compression level (0-9)
    },
  }
});

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
            const { playlistId, modelId: clientModelId, includeSubscriptionFeed, userId } = message.payload;
            // Use a model compatible with @google/generative-ai, e.g., gemini-pro or a specific preview version.
            // The test script used 'gemini-2.5-pro-preview-05-06', let's ensure consistency or use a generally available one.
            const effectiveModelId = clientModelId || 'gemini-2.5-pro-latest'; // Or 'gemini-2.5-pro-preview-05-06' if available & preferred

            if (!playlistId) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'playlistId is required for INIT_CHAT' }));
                return;
            }

            try {
                console.log(`[INIT_CHAT] Fetching videos for playlist: ${playlistId}`);
                const videosQuery = datastore.createQuery('Videos')
                    .filter('associatedPlaylistIds', '=', playlistId);
                const [playlistVideos] = await datastore.runQuery(videosQuery);
                
                let combinedVideos = playlistVideos || [];
                console.log(`[INIT_CHAT] Fetched ${combinedVideos.length} videos for playlist ${playlistId}.`);

                if (includeSubscriptionFeed && userId) {
                    console.log(`[INIT_CHAT] includeSubscriptionFeed is true for userId: ${userId}. Fetching feed cache.`);
                    try {
                        const feedCacheKey = datastore.key(['UserSubscriptionFeedCache', userId]);
                        const [feedCacheEntity] = await datastore.get(feedCacheKey);
                        if (feedCacheEntity && Array.isArray(feedCacheEntity.videos) && feedCacheEntity.videos.length > 0) {
                            console.log(`[INIT_CHAT] Fetched ${feedCacheEntity.videos.length} videos from subscription feed cache for userId: ${userId}.`);
                            const feedVideosMap = new Map(feedCacheEntity.videos.map(v => [v.videoId, v]));
                            const playlistVideosMap = new Map(combinedVideos.map(v => [v.videoId, v]));
                            const mergedVideosMap = new Map([...playlistVideosMap, ...feedVideosMap]);
                            combinedVideos = Array.from(mergedVideosMap.values());
                            console.log(`[INIT_CHAT] Combined and de-duplicated videos. Total: ${combinedVideos.length}`);
                        } else {
                            console.log(`[INIT_CHAT] No videos found in subscription feed cache for userId: ${userId} or cache is empty.`);
                        }
                    } catch (cacheError) {
                        console.error(`[INIT_CHAT] Error fetching UserSubscriptionFeedCache for userId ${userId}:`, cacheError);
                    }
                }

                if (combinedVideos.length === 0) {
                    ws.send(JSON.stringify({ type: 'ERROR', error: `No videos found for playlist ${playlistId} (and subscription feed if applicable).` }));
                    activeSessions.delete(ws);
                    return;
                }
                console.log(`[INIT_CHAT] Total videos for context after potential merge: ${combinedVideos.length}.`);

                const videoListForContext = combinedVideos.map(video => ({
                    ID: video.videoId, Title: video.title, Description: video.description || 'N/A',
                    DurationSeconds: video.durationSeconds, Views: video.viewCount ? parseInt(video.viewCount, 10) : null,
                    Likes: video.likeCount ? parseInt(video.likeCount, 10) : null, Topics: Array.isArray(video.topicCategories) ? video.topicCategories : [],
                    PublishedTimestamp: video.publishedAt ? new Date(video.publishedAt).getTime() : null
                }));
                const videoContextString = `Video List (JSON format):\n${JSON.stringify(videoListForContext, null, 2)}`;
                
                const generativeModel = genAI.getGenerativeModel({ model: effectiveModelId });
                
                const initialHistory = [
                    { role: 'user', parts: [{ text: "You are an AI assistant. I will provide a 'Video List' containing videos from a specific playlist and potentially from the user's recent subscriptions. Your task is to recommend videos from this combined list that best match the 'User Query'. Your response MUST be a valid JSON object with a single key: 'suggestedVideos'. The value of 'suggestedVideos' MUST be an array. Each object in the array MUST have two keys: 'videoId' (the YouTube video ID) and 'reason' (your concise explanation for suggesting it). If NO videos match the query from the provided list, 'suggestedVideos' MUST be an empty array. Output ONLY the JSON object." }] },
                    { role: 'model', parts: [{ text: "Understood. I will use the provided video list (from playlist and/or subscriptions) and user query to make recommendations in the specified JSON format." }] },
                    { role: 'user', parts: [{ text: videoContextString }] }
                ];

                // const chat = generativeModel.startChat({ history: initialHistory }); // Not strictly needed if we use model.generateContentStream and manage history manually for it

                // Store the initialContextHistory, the model instance, and other relevant data
                activeSessions.set(ws, { 
                    // chat, // Removing stateful chat object as each query will be standalone with initial context
                    playlistId, 
                    modelId: effectiveModelId, 
                    videosForContext: combinedVideos, 
                    userId: userId, 
                    genModel: generativeModel, // Keep the model instance
                    initialContextHistory: initialHistory // Store the static initial history/context
                });
                ws.send(JSON.stringify({ type: 'CHAT_INITIALIZED', payload: { playlistId, modelId: effectiveModelId } }));
                console.log(`[INIT_CHAT] Chat initialized for playlist: ${playlistId} with model ${effectiveModelId}. UserID: ${userId}, IncludeFeed: ${includeSubscriptionFeed}`);

            } catch (error) {
                console.error('[INIT_CHAT] Error initializing chat:', error);
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to initialize chat session: ' + error.message }));
                activeSessions.delete(ws);
            }

        } else if (message.type === 'USER_QUERY') {
            if (!currentSession || !currentSession.genModel || !currentSession.initialContextHistory) { 
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Chat not initialized properly (missing model or initial context history). Send INIT_CHAT first.' }));
                return;
            }
            const { query } = message.payload;
            // videosForContext is still useful for enriching the final response
            const { videosForContext, genModel, initialContextHistory } = currentSession; // Use initialContextHistory

            if (!query) {
                ws.send(JSON.stringify({ type: 'ERROR', error: 'Query is required for USER_QUERY' }));
                return;
            }

            try {
                // Construct payload for model.generateContentStream, using the static initialContextHistory
                const requestPayload = {
                    contents: [...initialContextHistory, { role: 'user', parts: [{ text: query }] }], // Use static initial context + current query
                    generationConfig: {
                        responseMimeType: "application/json",
                        thinkingConfig: {
                            includeThoughts: true,
                            thinkingBudget: 1024, 
                        },
                        temperature: 0, // Retain original temperature
                    },
                    safetySettings: [
                        {
                            category: 'HARM_CATEGORY_HARASSMENT',
                            threshold: 'BLOCK_NONE',
                        },
                        {
                            category: 'HARM_CATEGORY_HATE_SPEECH',
                            threshold: 'BLOCK_NONE',
                        },
                        {
                            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                            threshold: 'BLOCK_NONE',
                        },
                        {
                            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                            threshold: 'BLOCK_NONE',
                        },
                    ]
                };

                console.log(`[USER_QUERY][${new Date().toISOString()}] Sending query to Gemini (using @google/generative-ai) for playlist ${currentSession.playlistId}.`);
                console.log(`[USER_QUERY][${new Date().toISOString()}] Request payload for model.generateContentStream:`, JSON.stringify(requestPayload, null, 2));
                
                const streamResult = await genModel.generateContentStream(requestPayload);
                let accumulatedText = "";
                let thoughtHeaderPrinted = false;
                let answerHeaderPrinted = false;

                console.log(`[USER_QUERY][${new Date().toISOString()}] Called model.generateContentStream, awaiting stream data...`);

                for await (const chunk of streamResult.stream) {
                    console.log(`[USER_QUERY][STREAM_ITEM_RAW][${new Date().toISOString()}]`, JSON.stringify(chunk, null, 2));

                    if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            if (part.text === null || part.text === undefined) continue;

                            if (part.thought) {
                                if (!thoughtHeaderPrinted) {
                                    thoughtHeaderPrinted = true;
                                }
                                ws.send(JSON.stringify({ type: 'THINKING_CHUNK', payload: { textChunk: part.text } }));
                                console.log(`[USER_QUERY][THOUGHT_CHUNK_SENT][${new Date().toISOString()}] Text: ${part.text.substring(0,100)}...`);
                            } else {
                                if (!answerHeaderPrinted && part.text.trim() !== "") {
                                    answerHeaderPrinted = true;
                                }
                                accumulatedText += part.text;
                                ws.send(JSON.stringify({ type: 'STREAM_CHUNK', payload: { textChunk: part.text } }));
                                console.log(`[USER_QUERY][CONTENT_CHUNK_SENT][${new Date().toISOString()}] Length: ${part.text.length}`);
                            }
                        }
                    }
                }
                
                // Update server-side chat history after successful stream
                // Note: userChatSession.history is an accessor that rebuilds from internal _history.
                // To append, we typically send new messages.
                // For now, we'll rely on including the full history in each model.generateContentStream call.
                // If true stateful chat history update is needed with userChatSession,
                // we'd use userChatSession.sendMessageStream and ensure its history updates.
                // Since we used model.generateContentStream, the 'userChatSession' object's history
                // wasn't directly updated by that call. We'd need to manually update it if we want to keep it.
                // For simplicity and to match the test script's direct model call, we'll reconstruct history on each USER_QUERY.
                // This means the 'chat' object stored in activeSessions is mostly for holding the initial history setup.
                // A more robust chat history management would be needed if we strictly use chat.sendMessageStream.
                
                // DO NOT append to history, as each query is independent with the initial context.
                // currentSession.initialContextHistory.push({ role: 'user', parts: [{ text: query }] }); // REMOVED
                // currentSession.initialContextHistory.push({ role: 'model', parts: [{ text: accumulatedText }] }); // REMOVED


                const aggregatedResponse = await streamResult.response;
                if (aggregatedResponse && aggregatedResponse.usageMetadata) {
                    console.log(`[USER_QUERY][USAGE_METADATA][${new Date().toISOString()}]`, JSON.stringify(aggregatedResponse.usageMetadata, null, 2));
                } else {
                     // Try to get usage metadata from the last chunk if aggregatedResponse doesn't have it
                    // This logic for lastChunk might be complex if stream is already consumed.
                    // Prefer relying on aggregatedResponse.usageMetadata.
                    console.log(`[USER_QUERY][USAGE_METADATA][${new Date().toISOString()}] Aggregated response or usageMetadata not available or stream already consumed for last chunk.`);
                }
                
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
                } else if (sanitizedText.trim().length > 0 && !thoughtHeaderPrinted) { // Only use AI text if no thoughts were primary output
                    answerText = sanitizedText.trim(); // Use the direct AI response if no JSON
                } else if (sanitizedText.trim().length > 0 && thoughtHeaderPrinted && allSuggestedVideos.length === 0) {
                     answerText = `The AI provided thoughts but no matching videos were found or the format was unexpected.`;
                }
                
                function formatSecondsToHHMMSS(totalSeconds) {
                    if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) return "00:00";
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    const s = Math.floor(totalSeconds % 60);
                    return `${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
                
                const suggestedVideosFull = suggestionsFromGemini.map(suggestion => {
                    const foundVideo = videosForContext.find(v => v.videoId === suggestion.videoId); 
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

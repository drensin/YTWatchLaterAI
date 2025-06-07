// Test script using @google/generative-ai SDK for streaming thoughts
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- Configuration ---
// IMPORTANT: This API key should ideally be an environment variable in a real scenario.
// For this test, as requested, it's hardcoded. Ensure this file is in .gitignore.
const API_KEY = "AIzaSyDU-Gp0OkApVseF9oSSwGN4-zFTJzsMppM"; 
// Model: Use the one specified by the user, but be mindful of examples using slightly different ones like 'gemini-2.5-pro-preview-06-05'
const MODEL_ID = 'gemini-2.5-pro-preview-05-06'; 

// --- Initialize Google AI Client ---
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_ID });

async function testStreamThinkingWithGoogleAI() {
    console.log(`[TestScriptGoogleAI] Starting test with model: ${MODEL_ID}`);

    const simpleQueryText = "Tell me a short story about a curious robot, including its name, and make it about 200 words.";

    try {
        const chat = model.startChat({
            // history: [], // Optional: Add initial history if needed
            // generationConfig: { // This is where includeThoughts was in one example, but the latest doc uses it in the stream call's config
            //    includeThoughts: true, 
            // },
        });
        console.log(`[TestScriptGoogleAI] Chat session started with @google/generative-ai.`);

        const requestPayload = {
            contents: [{ role: 'user', parts: [{ text: simpleQueryText }] }],
            generationConfig: { // Changed 'config' to 'generationConfig'
                thinkingConfig: { // 'thinkingConfig' is nested within 'generationConfig'
                    includeThoughts: true,
                    // thinkingBudget: 1024 // Optional: to set a budget
                }
                // You can add other generationConfig params here too, e.g., temperature, maxOutputTokens
            }
        };

        console.log(`[TestScriptGoogleAI] Request payload for model.generateContentStream:`);
        console.log(JSON.stringify(requestPayload, null, 2));
        
        // Using model.generateContentStream() as it aligns best with the documentation example
        // for streaming thoughts with @google/generative-ai.
        // If a chat session is strictly needed, chat.sendMessageStream would be used,
        // potentially with a similar payload structure.
        const streamResult = await model.generateContentStream(requestPayload);

        console.log(`[TestScriptGoogleAI] model.generateContentStream() call initiated. Processing stream...`);
        let accumulatedText = "";
        let accumulatedThoughts = "";
        let thoughtHeaderPrinted = false;
        let answerHeaderPrinted = false;

        for await (const chunk of streamResult.stream) { // The example uses `for await (const chunk of response)` where response is the result of generateContentStream
                                                       // For chat, it was `for await (const chunk of result.stream)`
            console.log(`[TestScriptGoogleAI][STREAM_CHUNK_RAW]`, JSON.stringify(chunk, null, 2));

            // The documentation example iterates through chunk.candidates[0].content.parts
            if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    if (part.text === null || part.text === undefined) continue; // Skip parts without text

                    if (part.thought) {
                        if (!thoughtHeaderPrinted) {
                            console.log("\n[TestScriptGoogleAI] Thoughts summary:");
                            thoughtHeaderPrinted = true;
                        }
                        const thoughtText = part.text;
                        accumulatedThoughts += thoughtText;
                        console.log(`[TestScriptGoogleAI][THOUGHT_CHUNK] ${thoughtText}`);
                    } else {
                        if (!answerHeaderPrinted && part.text.trim() !== "") { // Only print header if there's actual text
                            console.log("\n[TestScriptGoogleAI] Answer:");
                            answerHeaderPrinted = true;
                        }
                        const contentText = part.text;
                        accumulatedText += contentText;
                        // process.stdout.write(contentText); // For continuous output
                        if (contentText.trim() !== "") {
                             console.log(`[TestScriptGoogleAI][CONTENT_CHUNK] ${contentText}`);
                        }
                    }
                }
            } else if (chunk.text && typeof chunk.text === 'function') {
                // This is another pattern seen for @google/generative-ai where chunk.text() is a function
                // For simplicity, the example iterates parts. Let's stick to that.
                // If the above doesn't work, we might need to check for chunk.text().
                console.log("[TestScriptGoogleAI] Chunk has a text function, but we are processing parts based on example.");
            }
        }
        // process.stdout.write("\n"); // Final newline

        console.log(`\n[TestScriptGoogleAI] Stream finished.`);
        if (accumulatedThoughts.length > 0) {
            console.log(`\n[TestScriptGoogleAI] Accumulated Thoughts (Final):\n-------------------\n${accumulatedThoughts}\n-------------------`);
        } else {
            console.log(`\n[TestScriptGoogleAI] No accumulated thoughts were captured from 'part.thought'.`);
        }
        if (accumulatedText.length > 0) {
            console.log(`\n[TestScriptGoogleAI] Accumulated Final Text:\n-------------------\n${accumulatedText}\n-------------------`);
        } else {
            console.log(`\n[TestScriptGoogleAI] No accumulated final text was captured.`);
        }

        // Log usage metadata from the aggregated response
        try {
            const aggregatedResponse = await streamResult.response; // Await the promise
            if (aggregatedResponse && aggregatedResponse.usageMetadata) {
                 console.log(`\n[TestScriptGoogleAI][AGGREGATED_RESPONSE_USAGE_METADATA]`, JSON.stringify(aggregatedResponse.usageMetadata, null, 2));
            } else if (aggregatedResponse) {
                // Log the full aggregated response if usageMetadata is not directly on it, or if it's structured differently
                console.log(`\n[TestScriptGoogleAI][AGGREGATED_RESPONSE_NO_USAGE_METADATA] Full aggregated response:`, JSON.stringify(aggregatedResponse, null, 2));
            } else {
                console.log(`\n[TestScriptGoogleAI] No aggregated response object available from streamResult.response.`);
            }
        } catch (responseError) {
            console.error(`\n[TestScriptGoogleAI] Error fetching or logging aggregated response:`, responseError);
        }


    } catch (error) {
        console.error(`[TestScriptGoogleAI] Error:`, error);
        if (error.stack) {
            console.error(`[TestScriptGoogleAI] Error stack:`, error.stack);
        }
    }
}

testStreamThinkingWithGoogleAI().then(() => {
    console.log("[TestScriptGoogleAI] Test finished.");
}).catch(e => {
    console.error("[TestScriptGoogleAI] Test failed with unhandled error:", e);
});

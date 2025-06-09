/**
 * @fileoverview Handles user authorization for the ReelWorthy application.
 * Verifies Firebase ID tokens, checks against an email allow-list in Datastore,
 * determines if the user's YouTube account is linked, checks the status of
 * their subscription feed cache, and fetches available Gemini AI models.
 */
const express = require('express');
const compression = require('compression'); // Renamed
const {Datastore} = require('@google-cloud/datastore');
const admin = require('firebase-admin');
// Removed GoogleGenerativeAI import

// Create an Express app
const app = express();

// Apply compression middleware
app.use(compression()); // Renamed

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (e) {
    console.error('Critical Firebase Admin SDK initialization error:', e.message);
    // Depending on function requirements, you might want to ensure the app doesn't run without Firebase Admin
    throw new Error(`Firebase Admin SDK failed to initialize: ${e.message}`);
  }
} else {
  console.log('Firebase Admin SDK was already initialized.');
}

// Initialize Datastore
const datastore = new Datastore();
const AUTHORIZED_EMAIL_KIND = 'AuthorizedEmail';
const TOKEN_KIND = 'Tokens';
const USER_SUBSCRIPTION_FEED_CACHE_KIND = 'UserSubscriptionFeedCache';
const THIRTEEN_HOURS_IN_MS = 13 * 60 * 60 * 1000;

const https = require('https'); // For direct HTTPS call

// GEMINI_API_KEY should be set as an environment variable for this function
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Removed commented-out genAI initialization block

/**
 * HTTP Cloud Function to check user authorization and retrieve available Gemini models.
 * Expects a Firebase ID token in the Authorization header (Bearer token).
 * Verifies the token, extracts the email, checks against an allow-list in Datastore,
 * checks YouTube linkage, and fetches a list of available Gemini models.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
const handleCheckUserAuthorization = async (req, res) => {
  // Set CORS headers for preflight requests and actual requests
  res.set('Access-Control-Allow-Origin', '*'); // Adjust to your frontend URL in production
  res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    // Send response to OPTIONS requests
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') { // Allow GET for simple tests if needed
    return res.status(405).send({error: 'Method Not Allowed'});
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({authorized: false, error: 'Unauthorized: No token provided.'});
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userEmail = decodedToken.email;

    if (!userEmail) {
      return res.status(400).send({authorized: false, error: 'Token did not contain an email address.'});
    }

    // Check if the email exists in the AuthorizedEmail Kind in Datastore
    const emailKey = datastore.key([AUTHORIZED_EMAIL_KIND, userEmail]);
    const [allowListEntity] = await datastore.get(emailKey);

    if (allowListEntity) {
      // Email is in the allow-list, now check for YouTube tokens
      const tokenKey = datastore.key([TOKEN_KIND, decodedToken.uid]);
      const [tokenEntity] = await datastore.get(tokenKey);

      const youtubeLinked = !!(tokenEntity && tokenEntity.refresh_token);

      // Check UserSubscriptionFeedCache
      let isSubscriptionFeedReady = false;
      if (youtubeLinked) { // Only check if YouTube is linked
        try {
          const feedCacheKey = datastore.key([USER_SUBSCRIPTION_FEED_CACHE_KIND, decodedToken.uid]);
          const [feedCacheEntity] = await datastore.get(feedCacheKey);
          if (feedCacheEntity && feedCacheEntity.lastUpdated) {
            // Define "recent" - e.g., updated in the last 13 hours for a twice-daily update
            const thirteenHoursAgo = new Date(Date.now() - THIRTEEN_HOURS_IN_MS);
            if (new Date(feedCacheEntity.lastUpdated) > thirteenHoursAgo) {
              isSubscriptionFeedReady = true;
            }
          }
        } catch (feedCacheError) {
          console.error(`Error checking UserSubscriptionFeedCache for ${decodedToken.uid}:`, feedCacheError);
          // Do not block authorization if this check fails, default to false
        }
      }

      let availableGeminiModels = [];
      if (GEMINI_API_KEY) {
        try {
            console.log("Fetching available Gemini models using direct HTTPS request...");
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models?key=${GEMINI_API_KEY}`,
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };

            availableGeminiModels = await new Promise((resolve, reject) => {
                const req = https.request(options, (apiRes) => {
                    let data = '';
                    apiRes.on('data', (chunk) => { data += chunk; });
                    apiRes.on('end', () => {
                        try {
                            if (apiRes.statusCode === 200) {
                                const parsedData = JSON.parse(data);
                                const modelNames = (parsedData.models || [])
                                    .filter(m => m.name && m.name.startsWith('models/gemini-') &&
                                                 (m.supportedGenerationMethods || []).includes('generateContent'))
                                    .map(m => m.name)
                                    .sort((a, b) => b.localeCompare(a));
                                resolve(modelNames);
                            } else {
                                console.error(`Error fetching models via HTTPS: ${apiRes.statusCode} ${apiRes.statusMessage}`, data);
                                resolve([]); // Resolve with empty on API error
                            }
                        } catch (e) {
                            console.error('Error parsing model list response from HTTPS:', e.message, data);
                            resolve([]); // Resolve with empty on parse error
                        }
                    });
                });
                req.on('error', (e) => {
                    console.error('Error making HTTPS request for models:', e.message);
                    resolve([]); // Resolve with empty on request error
                });
                req.end();
            });
            console.log(`Fetched ${availableGeminiModels.length} Gemini models via HTTPS.`);
        } catch (modelError) {
            console.error("Failed to fetch Gemini models (HTTPS attempt):", modelError.message, modelError.stack);
            availableGeminiModels = []; // Ensure it's an empty array on error
        }
      } else {
        console.warn("GEMINI_API_KEY is not available. Skipping model fetch.");
        availableGeminiModels = [];
      }

      return res.status(200).send({
        authorized: true,
        email: userEmail,
        uid: decodedToken.uid,
        youtubeLinked: youtubeLinked,
        isSubscriptionFeedReady: isSubscriptionFeedReady, // Add new flag
        availableModels: availableGeminiModels,
      });
    } else {
      // Email is not in the allow-list
      return res.status(403).send({authorized: false, error: 'User email not authorized.', youtubeLinked: false, isSubscriptionFeedReady: false, availableModels: []});
    }
  } catch (error) {
    console.error('Error verifying Firebase ID token, checking Datastore, or fetching models:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).send({authorized: false, error: 'Unauthorized: Token expired.'});
    }
    if (error.code === 'auth/argument-error') {
        return res.status(401).send({ authorized: false, error: 'Unauthorized: Invalid token format.' });
    }
    return res.status(500).send({authorized: false, error: 'Internal server error during authorization check.'});
  }
};

// Define the route for the Express app
app.all('/', handleCheckUserAuthorization);

// Export the Express app as the Cloud Function
exports.checkUserAuthorization = app;

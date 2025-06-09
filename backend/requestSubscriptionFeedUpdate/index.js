/**
 * @fileoverview HTTP Cloud Function to handle requests for updating a user's
 * YouTube subscription feed. It authenticates the user via a Firebase ID token
 * and then publishes a message containing the user's ID to a Pub/Sub topic,
 * which in turn triggers the actual feed fetching process.
 */
const { PubSub } = require('@google-cloud/pubsub');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    console.log('Firebase Admin SDK initialized successfully for requestSubscriptionFeedUpdate.');
  } catch (e) {
    console.error('Critical Firebase Admin SDK initialization error in requestSubscriptionFeedUpdate:', e.message);
    throw new Error(`Firebase Admin SDK failed to initialize: ${e.message}`);
  }
} else {
  // console.log('Firebase Admin SDK was already initialized.'); // Optional
}

const pubsub = new PubSub();
const topicName = 'user-feed-update-requests'; // Make sure this matches the created topic

/**
 * HTTP Cloud Function to request an update for a user's subscription feed.
 * It authenticates the user via Firebase ID token and publishes a message
 * to a Pub/Sub topic to trigger the actual feed update.
 *
 * @param {object} req The HTTP request object.
 * @param {object} res The HTTP response object.
 */
exports.requestSubscriptionFeedUpdate = async (req, res) => {
  // Set CORS headers for preflight requests
  res.set('Access-Control-Allow-Origin', '*'); // Allow all origins for development/flexibility. Be more specific in production.
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    // Send response to OPTIONS requests
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
    res.status(403).send('Unauthorized: No Firebase ID token.');
    return;
  }

  const idToken = authorization.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    if (!userId) {
      console.error('Could not extract UID from token.');
      res.status(403).send('Unauthorized: Invalid token.');
      return;
    }

    console.log(`Received request to update feed for userId: ${userId}`);

    // Publish a message to Pub/Sub to trigger the feed update
    const messageBuffer = Buffer.from(JSON.stringify({ userId: userId }));
    await pubsub.topic(topicName).publishMessage({ data: messageBuffer });

    console.log(`Message published to ${topicName} for userId: ${userId}`);
    res.status(202).send({ message: 'Subscription feed update requested.' });

  } catch (error) {
    console.error('Error verifying Firebase ID token or publishing message:', error);
    if (error.code === 'auth/id-token-expired') {
      res.status(401).send('Unauthorized: Token expired.');
    } else {
      res.status(500).send('Internal Server Error');
    }
  }
};

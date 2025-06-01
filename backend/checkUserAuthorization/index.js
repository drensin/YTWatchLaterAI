const {Datastore} = require('@google-cloud/datastore');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
  admin.initializeApp();
} catch (e) {
  console.error('Firebase Admin SDK initialization error:', e.message);
  // If already initialized, this error can be ignored in some environments (like local testing after first init)
  if (e.message.includes('already initialized')) {
    console.log('Firebase Admin SDK was already initialized.');
  } else {
    // For other errors, re-throw or handle as critical
    throw e;
  }
}

// Initialize Datastore
const datastore = new Datastore();
const AUTHORIZED_EMAIL_KIND = 'AuthorizedEmail';

/**
 * HTTP Cloud Function to check user authorization.
 * Expects a Firebase ID token in the Authorization header (Bearer token).
 * Verifies the token, extracts the email, and checks against an allow-list in Datastore.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.checkUserAuthorization = async (req, res) => {
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
    const [entity] = await datastore.get(emailKey);

    if (entity) {
      // Email is in the allow-list
      return res.status(200).send({authorized: true, email: userEmail, uid: decodedToken.uid});
    } else {
      // Email is not in the allow-list
      return res.status(403).send({authorized: false, error: 'User email not authorized.'});
    }
  } catch (error) {
    console.error('Error verifying Firebase ID token or checking Datastore:', error);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).send({authorized: false, error: 'Unauthorized: Token expired.'});
    }
    if (error.code === 'auth/argument-error') {
        return res.status(401).send({ authorized: false, error: 'Unauthorized: Invalid token format.' });
    }
    return res.status(500).send({authorized: false, error: 'Internal server error during authorization check.'});
  }
};

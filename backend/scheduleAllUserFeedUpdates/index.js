const { Datastore } = require('@google-cloud/datastore');
const { PubSub } = require('@google-cloud/pubsub');

const datastore = new Datastore();
const pubsub = new PubSub();
const topicName = 'user-feed-update-requests'; // Ensure this matches the created topic
const TOKEN_KIND = 'Tokens'; // Datastore Kind where user OAuth tokens (and thus UIDs) are stored

/**
 * HTTP Cloud Function triggered by Cloud Scheduler.
 * It queries for all users with linked YouTube accounts (identified by presence in TOKEN_KIND)
 * and publishes a message for each to the 'user-feed-update-requests' Pub/Sub topic.
 *
 * @param {object} req The HTTP request object (not directly used for scheduler triggers beyond invocation).
 * @param {object} res The HTTP response object.
 */
exports.scheduleAllUserFeedUpdates = async (req, res) => {
  // Scheduler invocations might not have a body or specific headers we need to check,
  // but good practice to ensure it's not easily callable by others if not secured.
  // For GCF HTTP triggers called by Scheduler, requests are authenticated as the Scheduler service account.
  // We can add a check for 'X-CloudScheduler' header if needed for extra security,
  // or rely on IAM permissions for the function.

  console.log('Scheduler job "scheduleAllUserFeedUpdates" started.');

  try {
    const query = datastore.createQuery(TOKEN_KIND).select('__key__'); // Select only keys to get UIDs
    const [entities] = await datastore.runQuery(query);

    if (!entities || entities.length === 0) {
      console.log('No users found in Tokens Kind. No messages to publish.');
      res.status(200).send('No users to process.');
      return;
    }

    let publishedCount = 0;
    const publishPromises = entities.map(async (entity) => {
      const userId = entity[datastore.KEY].name; // The UID is the name of the key for Token Kind
      if (userId) {
        try {
          const messageBuffer = Buffer.from(JSON.stringify({ userId: userId }));
          await pubsub.topic(topicName).publishMessage({ data: messageBuffer });
          console.log(`Published update request for userId: ${userId}`);
          publishedCount++;
        } catch (pubError) {
          console.error(`Failed to publish update request for userId ${userId}:`, pubError);
        }
      }
    });

    await Promise.all(publishPromises);

    console.log(`Scheduler job finished. Published ${publishedCount} update requests out of ${entities.length} users found.`);
    res.status(200).send(`Successfully published ${publishedCount} update requests.`);

  } catch (error) {
    console.error('Error in scheduleAllUserFeedUpdates function:', error);
    res.status(500).send('Internal Server Error');
  }
};

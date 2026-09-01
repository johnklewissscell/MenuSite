const functions = require('firebase-functions');
const { app } = require('../public/fatsecret-server/server');

exports.api = functions.https.onRequest(app);

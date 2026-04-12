'use strict';

const functions = require('firebase-functions');
const app = require('../index');

exports.mtgApi = functions.https.onRequest(app);

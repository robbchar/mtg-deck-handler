'use strict';

const functions = require('firebase-functions');
const app = require('../index');

exports.api = functions.https.onRequest(app);

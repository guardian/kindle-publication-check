import { handler } from './lambda';
let AWS = require('aws-sdk');

/**
 * For testing locally:
 * `yarn run local`
 */

AWS.config = new AWS.Config();
AWS.config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
AWS.config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
AWS.config.sessionToken = process.env.AWS_SESSION_TOKEN;
AWS.config.region = "eu-west-1";

async function run() {
    await handler()
        .then(result => console.log(result))
        .catch(err => console.log(err))
}

run();

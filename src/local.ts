import { checkPublication } from "./checkPublication";
import { Config } from "./config";
let AWS = require("aws-sdk");

/**
 * For testing locally:
 * `yarn run local`
 */

AWS.config = new AWS.Config();
AWS.config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
AWS.config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
AWS.config.sessionToken = process.env.AWS_SESSION_TOKEN;
AWS.config.region = "eu-west-1";

async function run(today) {
  console.log(`Checking publication for ${today}`);

  let config = new Config();
  config.Today = today;

  await checkPublication(config, sendEmail)
    .then(result => console.log(result))
    .catch(err => console.error(err));
}

async function sendEmail(
  subject: string,
  body: string,
  targetAddresses: string[]
): Promise<AWS.SES.SendEmailResponse> {
  console.log(`Subject: ${subject}\n`);
  console.log(body);
  return Promise.resolve({
    MessageId: "1234"
  });
}

if (process.argv.length < 3) {
  console.error("Run locally using: npm run local YYYY-MM-DD");
  process.exit(-1);
}

run(process.argv[2]);

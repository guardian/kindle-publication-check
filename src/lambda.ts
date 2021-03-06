import { SendEmailResponse } from "aws-sdk/clients/ses";
import { Config } from "./config";
import { checkPublication } from "./checkPublication";
import * as AWS from "aws-sdk";

let ses = new AWS.SES({ region: "eu-west-1" });

/**
 * The AWS Lambda handler function.
 * Runs a series of checks against today's Kindle publication, then sends an email
 */
export async function handler(event: { forceRun? : boolean }): Promise<AWS.SES.SendEmailResponse | string> {
  const now = new Date();
  
  const currentHour = now.getUTCHours();
  const isDST = now.getTimezoneOffset() > 0;

  let config = new Config();

  let shouldRun = !!event.forceRun || config.RunHours.indexOf(isDST ? currentHour + 1 : currentHour) >= 0;

  if (shouldRun) return checkPublication(config, sendEmail(config));
  else return Promise.resolve(`Not running because hour is ${currentHour}`);
}

let sendEmail = (config: Config) => (
  subject: string,
  body: string,
  targetAddresses: string[]
): Promise<AWS.SES.SendEmailResponse> => {
  let request: AWS.SES.SendEmailRequest = {
    Destination: {
      ToAddresses: targetAddresses
    },
    Message: {
      Subject: {
        Charset: "UTF-8",
        Data: subject
      },
      Body: {
        Text: {
          Charset: "UTF-8",
          Data: body
        }
      }
    },
    Source: config.SourceAddress,
    ReturnPath: config.ReturnPath
  };

  return ses.sendEmail(request).promise();
};

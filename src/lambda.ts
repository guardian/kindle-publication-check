import {SendEmailResponse} from 'aws-sdk/clients/ses';
import {Config} from './config';
import {checkPublication} from "./checkPublication";

/**
 * The AWS Lambda handler function.
 * Runs a series of checks against today's Kindle publication, then sends an email
 */
export async function handler(): Promise<SendEmailResponse | string> {
    let currentHour = new Date().getHours();

    let config = new Config();

    let shouldRun = config.RunHours.indexOf(currentHour) >= 0;

    if (shouldRun) return checkPublication(config);
    else return Promise.resolve(`Not running because hour is ${currentHour}`)
}

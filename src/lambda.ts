import {ListObjectsOutput} from 'aws-sdk/clients/s3';
import {SendEmailRequest, SendEmailResponse} from 'aws-sdk/clients/ses';
import {Config} from './config';
import S3 = require("aws-sdk/clients/s3");
import {RequestOptions} from "http";
import { URL } from "url"

let http = require('http');
let AWS = require('aws-sdk');
let s3 = new AWS.S3();
let ses = new AWS.SES({region: 'eu-west-1'});
let config = new Config();

type PublicationInfo = {
    articleCount: number
    imageCount: number
}

/**
 * The AWS Lambda handler function.
 * Runs a series of checks against today's Kindle publication, then sends an email
 */
export async function handler(): Promise<SendEmailResponse> {
    return getRedirect(config.ManifestURL)
        .then(testRedirect)
        .then(() => getS3Objects(config.KindleBucket, `${config.Stage}/${config.Today}`))
        .then(validatePublicationInfo)
        .then(sendSuccessEmail)
        .catch(sendFailureEmail)
}

let headRequestOptions = (url: URL): RequestOptions => {
    return {
        host: url.hostname,
        path: url.pathname,
        method: 'HEAD',
        protocol: url.protocol
    }
};

//Returns the redirect url, and also checks that it contains today's date
let getRedirect = (url: URL): Promise<URL> => {
    return new Promise((resolve, reject) => {
        http.request(headRequestOptions(url), response => {
            if (response.statusCode === 302) {
                if (response.headers.location.includes(config.Today))
                    resolve(new URL(response.headers.location));
                else
                    reject(`Expected today's date (${config.Today}), but got ${response.headers.location}`)
            } else {
                reject(`Expected status code 302 (moved permanently) for url ${url}, got ${response.statusCode}`)
            }
        }).end()
    })
};

let testRedirect = (url: URL): Promise<number> => {
    return new Promise((resolve, reject) => {
        http.request(headRequestOptions(url), response => {
            if (response.statusCode === 200)
                resolve(response.statusCode);
            else
                reject(`Expected status code 200 for url ${url}, got ${response.statusCode}`)
        }).end()
    })
};

let getS3Objects = (bucket: string, prefix: string): Promise<ListObjectsOutput> => {
    return s3.listObjects({
        Bucket: bucket,
        Prefix: prefix
    }).promise()
};

let validatePublicationInfo = (result: ListObjectsOutput): Promise<PublicationInfo> => {
    let info: PublicationInfo = {
        articleCount: result.Contents.filter(object => object.Key.endsWith('.nitf.xml')).length,
        imageCount: result.Contents.filter(object => object.Key.endsWith('.jpg')).length
    };

    if (info.articleCount >= config.MinimumArticleCount) {
        return Promise.resolve(info)
    } else {
        return Promise.reject(`Expected at least ${config.MinimumArticleCount} articles, but there are only ${info.articleCount}`)
    }
};

let sendEmail = (subject: string, body: string, targetAddresses: string[]): Promise<SendEmailResponse> => {
    let request: SendEmailRequest = {
        Destination: {
            ToAddresses: targetAddresses
        },
        Message: {
            Subject: {
                Charset: 'UTF-8',
                Data: subject
            },
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: body
                }
            }
        },
        Source: config.SourceAddress
    };

    return ses.sendEmail(request).promise()
};

let sendSuccessEmail = (info: PublicationInfo): Promise<SendEmailResponse> => sendEmail(
    `Kindle publication succeeded (${config.Today})`,
    `The Kindle edition for ${config.Today} was successfully published.\nIt contains ${info.articleCount} articles with ${info.imageCount} images.`,
    config.PassTargetAddresses
);

let sendFailureEmail = (error: string): Promise<SendEmailResponse> => sendEmail(
    `Kindle publication FAILED (${config.Today})`,
    `The Kindle edition for ${config.Today} was not successfully published. The error was: \n'${error}'`,
    config.FailureTargetAddresses
);

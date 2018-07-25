import {ListObjectsOutput} from 'aws-sdk/clients/s3';
import {SendEmailRequest, SendEmailResponse} from 'aws-sdk/clients/ses';
import {Config} from './config';
import S3 = require("aws-sdk/clients/s3");

let http = require('http');
let AWS = require('aws-sdk');
let s3 = new AWS.S3();
let ses = new AWS.SES({region: 'eu-west-1'});
let config = new Config();

type Url = string
type PublicationInfo = {
    articleCount: number
    imageCount: number
}

export async function handler(): Promise<SendEmailResponse> {
    return getRedirect(config.ManifestURL)
        .then(testRedirect)
        .then(() => getS3Objects(config.KindleBucket, `${config.Stage}/${config.Today}`))
        .then(validatePublicationInfo)
        .then(sendSuccessEmail)
        .catch(sendFailureEmail)
}

//Returns the redirect url, and also checks that it contains today's date
let getRedirect = (url: Url): Promise<Url> => {
    return new Promise((resolve, reject) => {
        http.get(url, response => {
            if (response.statusCode === 302) {
                if (response.headers.location.includes(config.Today))
                    resolve(response.headers.location);
                else
                    reject(`Expected today's date (${config.Today}), but got ${response.headers.location}`)
            } else {
                reject(`Expected status code 302 (moved permanently) for url ${url}, got ${response.statusCode}`)
            }
        })
    })
};

let testRedirect = (url: Url): Promise<number> => {
    return new Promise((resolve, reject) => {
        http.get(url, response => {
            if (response.statusCode === 200)
                resolve(response.statusCode);
            else
                reject(`Expected status code 200 for url ${url}, got ${response.statusCode}`)
        })
    })
};

let getS3Objects = (bucket: string, prefix: string): Promise<ListObjectsOutput> => {
    return s3.listObjects({
        Bucket: bucket,
        Prefix: prefix
    }).promise()
};

let validatePublicationInfo = (result: ListObjectsOutput): Promise<PublicationInfo> => {
    let articles: S3.Object[] = result.Contents.filter(object => object.Key.endsWith('.nitf.xml'));
    let images: S3.Object[] = result.Contents.filter(object => object.Key.endsWith('.jpg'));

    if (articles.length >= config.MinimumArticleCount) {
        return Promise.resolve({
            articleCount: articles.length,
            imageCount: images.length
        })
    } else {
        return Promise.reject(`Expected at least ${config.MinimumArticleCount} articles, but there are only ${articles.length}`)
    }
};

let sendEmail = (message: string, targetAddresses: string[]): Promise<SendEmailResponse> => {
    let request: SendEmailRequest = {
        Destination: {
            ToAddresses: targetAddresses
        },
        Message: {
            Subject: {
                Charset: 'UTF-8',
                Data: 'Kindle publication succeeded'
            },
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: message
                }
            }
        },
        Source: config.SourceAddress
    };

    return ses.sendEmail(request).promise()
};

let sendSuccessEmail = (info: PublicationInfo): Promise<SendEmailResponse> => sendEmail(
    `The Kindle edition for ${config.Today} was successfully published.\nIt contains ${info.articleCount} articles with ${info.imageCount} images.`,
    config.PassTargetAddresses
);

let sendFailureEmail = (error: string): Promise<SendEmailResponse> => sendEmail(
    `The Kindle edition for ${config.Today} was not successfully published. The error was: \n'${error}'`,
    config.FailureTargetAddresses
);

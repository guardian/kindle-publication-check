import { ListObjectsOutput } from "aws-sdk/clients/s3";
import { SendEmailRequest, SendEmailResponse } from "aws-sdk/clients/ses";
import { Config } from "./config";
import { URL } from "url";
import * as AWS from "aws-sdk";
import { request, RequestOptions } from "http";

let s3 = new AWS.S3();
let logs = new AWS.CloudWatchLogs({ region: "eu-west-1" });

type PublicationInfo = {
  articleCount: number;
  imageCount: number;
};

type SendEmailFn = (
  x: string,
  y: string,
  z: string[]
) => Promise<AWS.SES.SendEmailResponse>;

export function checkPublication(
  config: Config,
  sendEmail: SendEmailFn
): Promise<SendEmailResponse> {
  const logGroupName: string = `/aws/lambda/kindle-gen-${config.Stage}`;

  //This lambda runs either after midnight or after 1am. Default to 1am in case we want to manually run later
  let currentHourString = () => (new Date().getHours() === 0 ? "0000" : "0100");

  let headRequestOptions = (url: URL): RequestOptions => {
    return {
      host: url.hostname,
      path: url.pathname,
      method: "HEAD",
      protocol: url.protocol
    };
  };

  //Returns the redirect url, and also checks that it contains today's date
  let getRedirect = (url: URL): Promise<URL> => {
    return new Promise((resolve, reject) => {
      request(headRequestOptions(url), response => {
        if (response.statusCode === 302) {
          if (response.headers.location.includes(config.Today))
            resolve(new URL(response.headers.location));
          else
            reject(
              `Expected today's date (${config.Today}), but got ${
                response.headers.location
              }`
            );
        } else {
          reject(
            `Expected status code 302 (moved permanently) for url ${url}, got ${
              response.statusCode
            }`
          );
        }
      }).end();
    });
  };

  let testRedirect = (url: URL): Promise<number> => {
    return new Promise((resolve, reject) => {
      request(headRequestOptions(url), response => {
        if (response.statusCode === 200) resolve(response.statusCode);
        else
          reject(
            `Expected status code 200 for url ${url}, got ${
              response.statusCode
            }`
          );
      }).end();
    });
  };

  let getS3Objects = (
    bucket: string,
    prefix: string
  ): Promise<ListObjectsOutput> => {
    return s3
      .listObjects({
        Bucket: bucket,
        Prefix: prefix
      })
      .promise();
  };

  let validatePublicationInfo = (
    result: ListObjectsOutput
  ): Promise<PublicationInfo> => {
    let info: PublicationInfo = {
      articleCount: result.Contents.filter(object =>
        object.Key.endsWith(".nitf.xml")
      ).length,
      imageCount: result.Contents.filter(object => object.Key.endsWith(".jpg"))
        .length
    };

    if (info.articleCount >= config.MinimumArticleCount) {
      return Promise.resolve(info);
    } else {
      return Promise.reject(
        `Expected at least ${
          config.MinimumArticleCount
        } articles, but there are only ${info.articleCount}`
      );
    }
  };

  const getLogs = (
    logGroupName: string
  ): Promise<Array<AWS.CloudWatchLogs.OutputLogEvent>> =>
    findLogStreams(logGroupName).then(getCloudwatchLogs(logGroupName));

  const findLogStreams = (
    logGroupName: string
  ): Promise<Array<AWS.CloudWatchLogs.LogStream>> =>
    new Promise((resolve, reject) => {
      logs.describeLogStreams(
        {
          logGroupName,
          orderBy: "LastEventTime",
          descending: true,
          limit: 2
        },
        function(err, data) {
          if (err) {
            reject(err);
            return;
          }
          resolve(data.logStreams);
        }
      );
    });

  const getCloudwatchLogs = (logGroupName: string) => (
    logStreams: AWS.CloudWatchLogs.LogStream[]
  ): Promise<Array<AWS.CloudWatchLogs.OutputLogEvent>> => {
    const getLogsFor = (
      logStream: AWS.CloudWatchLogs.LogStream
    ): Promise<AWS.CloudWatchLogs.OutputLogEvent[]> =>
      new Promise((resolve, reject) => {
        logs.getLogEvents(
          {
            logGroupName,
            logStreamName: logStream.logStreamName,
            startFromHead: true
          },
          (err, data) => {
            if (err) {
              reject(err);
              return;
            } else if (
              !data.events.some(event =>
                event.message.includes(
                  `Starting to publish files for ${config.Today}`
                )
              )
            ) {
              resolve([]);
            }

            resolve(data.events);
          }
        );
      });
    return logStreams.reduce(
      (p, logStream) => p.then(logs => logs.length == 0 ? getLogsFor(logStream) : logs),
      Promise.resolve([])
    );
  };

  const checkLogs = (
    allLogs: Array<AWS.CloudWatchLogs.OutputLogEvent>
  ): Promise<void> => {
    const errorRegexp = /WARN|ERROR|FATAL/;
    const errors = allLogs.filter(log => errorRegexp.test(log.message));
    if (errors.length > 0) {
      return Promise.reject(errors);
    } else {
      return Promise.resolve();
    }
  };

  let sendSuccessEmail = (info: PublicationInfo): Promise<SendEmailResponse> =>
    sendEmail(
      `Kindle publication succeeded (${config.Today})`,
      `The Kindle edition for ${
        config.Today
      } was successfully published.\nIt contains ${
        info.articleCount
      } articles with ${info.imageCount} images.`,
      config.PassTargetAddresses
    );

  let sendFailureEmail = (error: string): Promise<SendEmailResponse> =>
    sendEmail(
      `Kindle publication FAILED (${config.Today})`,
      `The Kindle edition for ${
        config.Today
      } was not successfully published. The error was: \n'${error}'`,
      config.FailureTargetAddresses
    );

  return getLogs(logGroupName)
      .then(checkLogs)
      .then(() => getRedirect(config.ManifestURL))
      .then(testRedirect)
      .then(() =>
          getS3Objects(
              config.KindleBucket,
              `${config.Stage}/${config.Today}/${currentHourString()}`
          )
      )
      .then(validatePublicationInfo)
      .then(sendSuccessEmail)
      .catch(sendFailureEmail);
}

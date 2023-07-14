import { ListObjectsOutput } from "aws-sdk/clients/s3";
import { SendEmailRequest, SendEmailResponse } from "aws-sdk/clients/ses";
import { Config } from "./config";
import { URL } from "url";
import * as AWS from "aws-sdk";
import { request, RequestOptions } from "http";

const s3 = new AWS.S3();
const logs = new AWS.CloudWatchLogs({ region: "eu-west-1" });

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
  const currentHourString = () => (new Date().getHours() === 0 ? "0000" : "0100");

  const headRequestOptions = (url: URL): RequestOptions => {
    return {
      host: url.hostname,
      path: url.pathname,
      method: "HEAD",
      protocol: url.protocol
    };
  };

  //Returns the redirect url, and also checks that it contains today's date
  const getRedirect = (url: URL): Promise<URL> => {
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

  const testRedirect = (url: URL): Promise<number> => {
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

  const getS3Objects = (
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

  const validatePublicationInfo = (
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
    const errors = allLogs
        .filter(log => errorRegexp.test(log.message))
        .filter(log => log.message.startsWith("WARNING: sun.reflect.Reflection.getCallerClass is not supported"))
        .map(log => log.message);
    if (errors.length > 0) {
      return Promise.reject(errors);
    } else {
      return Promise.resolve();
    }
  };

  const sendSuccessEmail = (info: PublicationInfo): Promise<SendEmailResponse> =>
    sendEmail(
      `Kindle publication succeeded (${config.Today})`,
      `The Kindle edition for ${
        config.Today
      } was successfully published.\nIt contains ${
        info.articleCount
      } articles with ${info.imageCount} images.`,
      config.PassTargetAddresses
    );

  const addDaysToDate = (date: Date, days: number): Date => {
    // due to a JS quirk (see https://stackoverflow.com/questions/563406/how-to-add-days-to-date)
    // using (date.toString()) ensures the correct year is always used
    const d = new Date(date.toString());  
    d.setDate(date.getDate() + days);
    return d;
  };

  const isChristmasDay = (date: Date) : boolean => {
    const DECEMBER = 11;  // .getMonth returns zero-based values
    return (
        date.getMonth() === DECEMBER && 
        date.getDate() === 25
    );
  };

  const isBSTClockForwardTime = (date: Date) : boolean => {
    // The last Sunday in March is when UK clocks advance from GMT to BST
    // On this date, there is a 00:00 but there is no 01:00
    
    const SUNDAY = 0; // .getDay() returns zero-based values and Sunday is the first day of the week
    const MARCH = 2;  // .getMonth() also returns zero-based values 
    const APRIL = 3;  
    const nextWeek = addDaysToDate(date, 7);

    return (
        date.getDay() === SUNDAY && 
        date.getMonth() === MARCH && 
        date.getHours() === 2 && // we only care about this when 01:00 has become 02:00
        nextWeek.getMonth() === APRIL   
    );  
  };

  const buildPublicationErrorSubject = () : string => {
    let now = new Date();
    let subject = `Kindle publication FAILED (${config.Today})`;

    if (isChristmasDay(now)) {
      subject = 'No kindle publication on Christmas Day. Merry Christmas!';
    } else if (isBSTClockForwardTime(now)) {
      subject = `Kindle publication check failed (${config.Today}) due to BST clock change`;
    }

    return subject;
  };

  const sendFailureEmail = (error: string): Promise<SendEmailResponse> =>
    sendEmail(
      buildPublicationErrorSubject(),
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

let moment = require('moment');
import { URL } from "url"

export class Config {
    ManifestURL: URL = new URL(process.env.ManifestURL);
    KindleBucket: string = process.env.KindleBucket;
    Stage: string = process.env.Stage;
    SourceAddress: string = process.env.SourceAddress;
    PassTargetAddresses: string[] = process.env.PassTargetAddresses.split(',');
    FailureTargetAddresses: string[] = process.env.FailureTargetAddresses.split(',');
    MinimumArticleCount: number = parseInt(process.env.MinimumArticleCount);

    Today: string = moment().format('YYYY-MM-DD');
}

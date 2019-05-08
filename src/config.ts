let moment = require('moment');
import { URL } from "url"

export class Config {
    ManifestURL: URL = new URL(process.env.ManifestURL);
    KindleBucket: string = process.env.KindleBucket;
    Stage: string = process.env.Stage;
    SourceAddress: string = process.env.SourceAddress;
    ReturnPath: string = process.env.ReturnPath;
    PassTargetAddresses: string[] = process.env.PassTargetAddresses.split(',').map(a => a.trim());
    FailureTargetAddresses: string[] = process.env.FailureTargetAddresses.split(',').map(a => a.trim());
    MinimumArticleCount: number = parseInt(process.env.MinimumArticleCount);
    RunHours: number[] = process.env.RunHours.split(',').map(h => parseInt(h.trim()));

    Today: string = moment().format('YYYY-MM-DD');
}

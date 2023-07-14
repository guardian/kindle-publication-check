import {checkLogs} from "./checkPublication";
import * as AWS from "aws-sdk";

function makeEvent(message:string):AWS.CloudWatchLogs.OutputLogEvent {
    return {
        timestamp: (new Date()).getTime(),
        message,
    }
}

describe("checkLogs", ()=>{
    it("should not throw if there are no ERROR, WARN or FATAL messages", async ()=>{
        const lines = [
            "INFO something",
            "DEBUG something else",
            "TRACE yadayada"
        ];

        await checkLogs(lines.map(makeEvent));    //if we throw, the test fails.
    });

    it("should throw if there was a WARNING", async ()=>{
        const lines = [
            "INFO something",
            "DEBUG something else",
            "WARNING oh noes!",
            "TRACE yadayada"
        ];

        await expect(checkLogs(lines.map(makeEvent))).rejects.toEqual(["WARNING oh noes!"])
    });

    it("should include all ERROR, WARN or FATAL messages", async ()=>{
        const lines = [
            "INFO something",
            "ERROR uh-oh",
            "DEBUG something else",
            "WARNING oh noes!",
            "TRACE yadayada",
            "FATAL aaaaaarrrrgggghh!"
        ];

        await expect(checkLogs(lines.map(makeEvent))).rejects.toEqual([
            "ERROR uh-oh",
            "WARNING oh noes!",
            "FATAL aaaaaarrrrgggghh!"
        ]);
    });

    it("should not throw if we only get the getCallerClass error", async ()=>{
        const lines = [
            "WARNING: sun.reflect.Reflection.getCallerClass is not supported. This will impact performance.",
            "INFO something",
            "DEBUG something else",
            "TRACE yadayada"
        ];

        await checkLogs(lines.map(makeEvent));    //if we throw, the test fails.
    });

    it("should include all ERROR, WARN or FATAL messages but filter the spurious error", async ()=>{
        const lines = [
            "WARNING: sun.reflect.Reflection.getCallerClass is not supported. This will impact performance.",
            "INFO something",
            "ERROR uh-oh",
            "DEBUG something else",
            "WARNING oh noes!",
            "TRACE yadayada",
            "FATAL aaaaaarrrrgggghh!"
        ];

        await expect(checkLogs(lines.map(makeEvent))).rejects.toEqual([
            "ERROR uh-oh",
            "WARNING oh noes!",
            "FATAL aaaaaarrrrgggghh!"
        ]);
    });
})
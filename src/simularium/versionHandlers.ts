/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const si = require("si-prefix");

import {
    TrajectoryFileInfo,
    TrajectoryFileInfoAny,
    TrajectoryFileInfoV1,
} from "./types";

/*
Handles different trajectory file format versions.
Currently supported versions: 1, 2
*/
const LATEST_VERSION = 2;
const VERSION_NUM_ERROR = "Invalid version number in TrajectoryFileInfo:";

export const updateTrajectoryFileInfoFormat = (
    msg: TrajectoryFileInfoAny
): TrajectoryFileInfo => {
    let output = msg;

    switch (msg.version) {
        case LATEST_VERSION:
            break;
        case 1:
            const v1Data = msg as TrajectoryFileInfoV1;

            // Can't manipulate v1Data in place because TypeScript doesn't allow deleting of
            // non-optional keys
            output = {
                connId: v1Data.connId,
                msgType: v1Data.msgType,
                size: v1Data.size,
                spatialUnits: {
                    magnitude: v1Data.spatialUnitFactorMeters,
                    name: "m",
                },
                timeUnits: {
                    magnitude: 1,
                    name: "s",
                },
                timeStepSize: v1Data.timeStepSize,
                totalSteps: v1Data.totalSteps,
                typeMapping: v1Data.typeMapping,
                version: 2,
            };
            break;
        default:
            throw new RangeError(VERSION_NUM_ERROR + msg.version);
    }

    return output as TrajectoryFileInfo;
};

export const createScaleBarLabel = (
    originalVersion: number,
    tickIntervalLength: number,
    spatialUnits: { magnitude: number; name: string }
): string => {
    let scaleBarLabelNumber: number;
    let scaleBarLabelUnit: string;

    switch (originalVersion) {
        case LATEST_VERSION:
            // Honor the user's unit specifications
            scaleBarLabelNumber = tickIntervalLength * spatialUnits.magnitude;
            scaleBarLabelUnit = spatialUnits.name;
            break;
        case 1:
            // Determine the best unit for the scale bar label, e.g.:
            // 0.000000015 -> [15, "nm"]
            const scaleBarLabelArray = si.meter.convert(
                tickIntervalLength * spatialUnits.magnitude
            );

            scaleBarLabelNumber = scaleBarLabelArray[0];
            // The si-prefix library abbreviates "micro" as "mc", so swap it out with "µ"
            scaleBarLabelUnit = scaleBarLabelArray[1].replace("mc", "µ");
            break;
        default:
            throw new RangeError(VERSION_NUM_ERROR + originalVersion);
    }

    scaleBarLabelNumber = parseFloat(scaleBarLabelNumber.toPrecision(2));
    return scaleBarLabelNumber + " " + scaleBarLabelUnit;
};

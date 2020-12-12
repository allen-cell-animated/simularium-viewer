export interface VisDataFrame {
    data: number[];
    frameNumber: number;
    time: number;
}

export interface VisDataMessage {
    msgType: number;
    bundleStart: number;
    bundleSize: number;
    bundleData: VisDataFrame[];
    fileName: string;
}

interface ScatterTrace {
    x: number[];
    y: number[];
    mode: "markers" | "lines" | "lines+markers";
    type: "scatter";
    name?: string;
}
interface HistogramTrace {
    x: number[];
    y: number[];
    type: "histogram";
    name?: string;
}

interface Layout {
    title: string;
    xaxis: { title: string };
    yaxis: { title: string };
}

interface Plot {
    data: ScatterTrace[] | HistogramTrace[];
    layout?: Layout;
}

type CachedObservables = Plot[];

export interface AgentDisplayData {
    name: string;
    pdb?: string;
    mesh?: string;
}
export interface EncodedTypeMapping {
    [key: number]: AgentDisplayData;
}

export interface TrajectoryFileInfo {
    version: number;
    timeStepSize: number;
    totalSteps: number;
    spatialUnitFactorMeters: number;
    size: {
        x: number;
        y: number;
        z: number;
    };
    typeMapping: EncodedTypeMapping;
}

export interface SimulariumFileFormat {
    trajectoryInfo: TrajectoryFileInfo;
    spatialData: VisDataMessage;
    plotData: CachedObservables;
}

export const FILE_STATUS_SUCCESS = "success";
export const FILE_STATUS_FAIL = "fail";

type FileStatusSuccess = typeof FILE_STATUS_SUCCESS;
type FileStatusFail = typeof FILE_STATUS_FAIL;

export type FileStatus = FileStatusSuccess | FileStatusFail;

export interface FileReturn {
    status: FileStatus;
    message?: string;
}

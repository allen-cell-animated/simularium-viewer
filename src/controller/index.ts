import jsLogger from "js-logger";
import { noop } from "lodash";
import {
    RemoteSimulator,
    NetConnectionParams,
    VisData,
    VisDataMessage,
    TrajectoryFileInfo,
    VisGeometry,
} from "../simularium";
import {
    SimulariumFileFormat,
    FileReturn,
    FILE_STATUS_SUCCESS,
    FILE_STATUS_FAIL,
} from "../simularium/types";

import { ClientSimulator } from "../simularium/ClientSimulator";
import { ClientSimulatorParams } from "../simularium/localSimulators/ClientSimulatorFactory";
import { ISimulator } from "../simularium/ISimulator";
import { LocalFileSimulator } from "../simularium/LocalFileSimulator";

jsLogger.setHandler(jsLogger.createDefaultHandler());

// TODO: refine this as part of the public API for initializing the
// controller (also see SimulatorConnectionParams below)
interface SimulariumControllerParams {
    remoteSimulator?: RemoteSimulator;
    netConnectionSettings?: NetConnectionParams;
    trajectoryPlaybackFile?: string;
    trajectoryGeometryFile?: string;
    // a URL prefix to locate the assets in the trajectoryGeometryFile
    assetLocation?: string;
}

// TODO: refine this as part of the public API for initializing the
// controller with a simulator connection
interface SimulatorConnectionParams {
    netConnectionSettings?: NetConnectionParams;
    clientSimulatorParams?: ClientSimulatorParams;
    simulariumFile?: SimulariumFileFormat;
}

const DEFAULT_ASSET_PREFIX =
    "https://aics-agentviz-data.s3.us-east-2.amazonaws.com/meshes/obj";

export default class SimulariumController {
    public simulator?: ISimulator;
    public visData: VisData;
    public visGeometry: VisGeometry | undefined;
    public tickIntervalLength: number;
    public handleTrajectoryInfo: (TrajectoryFileInfo) => void;
    public postConnect: () => void;
    public onError?: (errorMessage: string) => void;

    private networkEnabled: boolean;
    private isPaused: boolean;
    private isFileChanging: boolean;
    private playBackFile: string;
    // used to map geometry to agent types
    private geometryFile: string;
    // used to locate geometry assets
    private assetPrefix: string;

    public constructor(params: SimulariumControllerParams) {
        this.visData = new VisData();
        this.tickIntervalLength = 0; // Will be overwritten when a trajectory is loaded
        this.postConnect = () => noop;

        this.handleTrajectoryInfo = (/*msg: TrajectoryFileInfo*/) => noop;
        this.onError = (/*errorMessage*/) => noop;
        if (params.remoteSimulator) {
            this.simulator = params.remoteSimulator;
            this.simulator.setTrajectoryFileInfoHandler(
                (trajFileInfo: TrajectoryFileInfo) => {
                    this.handleTrajectoryInfo(trajFileInfo);
                }
            );
            this.simulator.setTrajectoryDataHandler(
                this.visData.parseAgentsFromNetData.bind(this.visData)
            );
        } else if (params.netConnectionSettings) {
            this.createSimulatorConnection(
                params.netConnectionSettings,
                undefined,
                undefined
            );
        } else {
            // No network information was passed in
            //  the viewer will be initialized blank

            this.simulator = undefined;

            // @TODO: Pass this warning upwards (to installing app)
            if (params.trajectoryPlaybackFile) {
                console.warn(
                    "trajectoryPlaybackFile param ignored, no network config provided"
                );
            }
        }

        this.networkEnabled = true;
        this.isPaused = false;
        this.isFileChanging = false;
        this.playBackFile = params.trajectoryPlaybackFile || "";
        this.geometryFile = this.resolveGeometryFile(
            params.trajectoryGeometryFile || "",
            this.playBackFile
        );
        this.assetPrefix = params.assetLocation || DEFAULT_ASSET_PREFIX;
    }

    private resolveGeometryFile(
        geometryFile: string,
        playbackFileName: string
    ): string {
        // if we got a geometryFile, assume it's a complete URL
        if (geometryFile) {
            return geometryFile;
        }
        // if there's no geometryFile, then make an assumption about the playbackFileName
        if (playbackFileName) {
            return `https://aics-agentviz-data.s3.us-east-2.amazonaws.com/visdata/${playbackFileName}.json`;
        }
        return "";
    }

    private createSimulatorConnection(
        netConnectionConfig?: NetConnectionParams,
        clientSimulatorParams?: ClientSimulatorParams,
        localFile?: SimulariumFileFormat
    ): void {
        if (clientSimulatorParams) {
            this.simulator = new ClientSimulator(clientSimulatorParams);
        } else if (localFile) {
            this.simulator = new LocalFileSimulator(
                this.playBackFile,
                localFile
            );
        } else if (netConnectionConfig) {
            this.simulator = new RemoteSimulator(netConnectionConfig);
        } else {
            throw new Error(
                "Insufficient data to determine and configure simulator connection"
            );
        }

        this.simulator.setTrajectoryFileInfoHandler(
            (trajFileInfo: TrajectoryFileInfo) => {
                this.handleTrajectoryInfo(trajFileInfo);
            }
        );
        this.simulator.setTrajectoryDataHandler(
            this.visData.parseAgentsFromNetData.bind(this.visData)
        );
    }

    public configureNetwork(config: NetConnectionParams): void {
        if (this.simulator && this.simulator.socketIsValid()) {
            this.simulator.disconnect();
        }

        this.createSimulatorConnection(config);
    }

    public get isChangingFile(): boolean {
        return this.isFileChanging;
    }

    public connect(): Promise<string> {
        if (!this.simulator) {
            return Promise.reject(
                new Error(
                    "No network connection established in simularium controller."
                )
            );
        }

        return this.simulator
            .connectToRemoteServer(this.simulator.getIp())
            .then((msg: string) => {
                this.postConnect();
                return msg;
            });
    }

    public start(): Promise<void> {
        if (!this.simulator) {
            return Promise.reject();
        }

        // switch back to 'networked' playback
        this.networkEnabled = true;
        this.isPaused = false;
        this.visData.clearCache();

        return this.simulator.startRemoteTrajectoryPlayback(this.playBackFile);
    }

    public time(): number {
        return this.visData.currentFrameData.time;
    }

    public stop(): void {
        if (this.simulator) {
            this.simulator.abortRemoteSim();
        }
    }

    public pause(): void {
        if (this.networkEnabled && this.simulator) {
            this.simulator.pauseRemoteSim();
        }

        this.isPaused = true;
    }

    public paused(): boolean {
        return this.isPaused;
    }

    public initializeTrajectoryFile(): void {
        if (this.simulator) {
            this.simulator.requestTrajectoryFileInfo(this.playBackFile);
        }
    }

    public gotoTime(time: number): void {
        // If in the middle of changing files, ignore any gotoTime requests
        if (this.isFileChanging === true) return;
        if (this.visData.hasLocalCacheForTime(time)) {
            this.visData.gotoTime(time);
        } else {
            if (this.networkEnabled && this.simulator) {
                // else reset the local cache,
                //  and play remotely from the desired simulation time
                this.visData.clearCache();

                // NOTE: This arbitrary rounding of time is a temporary fix until
                // simularium-engine is updated to work with imprecise float time values.
                // Revert the 2 lines of code below to:
                // this.simulator.gotoRemoteSimulationTime(time);
                const roundedTime = parseFloat(time.toPrecision(4));
                this.simulator.gotoRemoteSimulationTime(roundedTime);
            }
        }
    }

    public playFromTime(time: number): void {
        this.gotoTime(time);
        this.isPaused = false;
    }

    public resume(): void {
        if (this.networkEnabled && this.simulator) {
            this.simulator.resumeRemoteSim();
        }

        this.isPaused = false;
    }

    public clearFile(): void {
        this.isFileChanging = false;
        this.playBackFile = "";
        this.geometryFile = "";
        this.assetPrefix = DEFAULT_ASSET_PREFIX;
        this.visData.clearCache();
        this.disableNetworkCommands();
        this.pause();
        if (this.visGeometry) {
            this.visGeometry.clearForNewTrajectory();
            this.visGeometry.resetCamera();
        }
    }

    public changeFile(
        connectionParams: SimulatorConnectionParams,
        // TODO: push newFileName into connectionParams
        newFileName: string,
        // TODO: can geometryFile and assetPrefix come from the TrajectoryFileInfo data?
        geometryFile?: string,
        assetPrefix?: string
    ): Promise<FileReturn> {
        this.isFileChanging = true;
        this.playBackFile = newFileName;
        this.geometryFile = this.resolveGeometryFile(
            geometryFile || "",
            newFileName
        );
        this.assetPrefix = assetPrefix ? assetPrefix : DEFAULT_ASSET_PREFIX;
        this.visData.WaitForFrame(0);
        this.visData.clearCache();
        this.visData.cancelAllWorkers();

        this.stop();

        // Do I still need this? test...
        // if (this.simulator) {
        //     this.simulator.disconnect();
        // }

        try {
            if (connectionParams) {
                this.createSimulatorConnection(
                    connectionParams.netConnectionSettings,
                    connectionParams.clientSimulatorParams,
                    connectionParams.simulariumFile
                );
                this.networkEnabled = true;
                this.isPaused = true;
            } else {
                throw new Error("incomplete simulator config provided");
            }
        } catch (e) {
            this.simulator = undefined;

            console.warn(e.message);

            this.networkEnabled = false;
            this.isPaused = false;
        }

        // start the simulation paused and get first frame
        if (this.simulator) {
            return this.start()
                .then(() => {
                    if (this.simulator) {
                        this.simulator.requestSingleFrame(0);
                    }
                })
                .then(() => ({
                    status: FILE_STATUS_SUCCESS,
                }));
        }

        return Promise.reject({
            status: FILE_STATUS_FAIL,
        });
    }

    public markFileChangeAsHandled(): void {
        this.isFileChanging = false;
    }

    public getFile(): string {
        return this.playBackFile;
    }

    public getGeometryFile(): string {
        return this.geometryFile;
    }

    public getAssetPrefix(): string {
        return this.assetPrefix;
    }

    public disableNetworkCommands(): void {
        this.networkEnabled = false;

        if (this.simulator && this.simulator.socketIsValid()) {
            this.simulator.disconnect();
        }
    }

    public cacheJSON(json: VisDataMessage): void {
        this.visData.cacheJSON(json);
    }

    public clearLocalCache(): void {
        this.visData.clearCache();
    }

    public get dragAndDropFileInfo(): TrajectoryFileInfo | null {
        return this.visData.dragAndDropFileInfo;
    }
    public set dragAndDropFileInfo(fileInfo: TrajectoryFileInfo | null) {
        this.visData.dragAndDropFileInfo = fileInfo;
    }

    public set trajFileInfoCallback(
        callback: (msg: TrajectoryFileInfo) => void
    ) {
        this.handleTrajectoryInfo = callback;

        if (this.simulator) {
            this.simulator.setTrajectoryFileInfoHandler(callback);
        }
    }

    /**
     * Camera controls
     * simulariumController.visGeometry gets set in
     * componentDidMount of the viewer, so as long as the dom is mounted
     * these functions will be callable.
     */
    public zoomIn(): void {
        if (this.visGeometry) {
            this.visGeometry.zoomIn();
        }
    }

    public zoomOut(): void {
        if (this.visGeometry) {
            this.visGeometry.zoomOut();
        }
    }

    public resetCamera(): void {
        if (this.visGeometry) {
            this.visGeometry.resetCamera();
        }
    }

    public centerCamera(): void {
        if (this.visGeometry) {
            this.visGeometry.centerCamera();
        }
    }

    public reOrientCamera(): void {
        if (this.visGeometry) {
            this.visGeometry.reOrientCamera();
        }
    }

    public setPanningMode(pan: boolean): void {
        if (this.visGeometry) {
            this.visGeometry.setPanningMode(pan);
        }
    }

    public setFocusMode(focus: boolean): void {
        if (this.visGeometry) {
            this.visGeometry.setFocusMode(focus);
        }
    }
}

export { SimulariumController };

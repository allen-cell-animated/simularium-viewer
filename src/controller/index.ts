import jsLogger from "js-logger";
import { NetConnection, VisData } from "../agentsim";

jsLogger.setHandler(jsLogger.createDefaultHandler());

export default class AgentSimController {
    public netConnection: NetConnection;
    public visData: VisData;
    private networkEnabled: boolean;
    private isPaused: boolean;
    private fileChanged: boolean;
    private playBackFile: string;

    public constructor(params) {
        this.visData = new VisData();

        if (params.netConnection) {
            this.netConnection = params.netConnection;
        } else {
            this.netConnection = new NetConnection(
                params.netConnectionSettings
            );
        }

        this.playBackFile = params.trajectoryPlaybackFile;
        this.netConnection.onTrajectoryDataArrive = this.visData.parseAgentsFromNetData.bind(
            this.visData
        );

        this.networkEnabled = true;
        this.isPaused = false;
        this.fileChanged = false;
    }

    public get hasChangedFile(): boolean {
        return this.fileChanged;
    }

    public connect(): Promise<{}> {
        return this.netConnection.connectToRemoteServer(
            this.netConnection.getIp()
        );
    }

    public start(): Promise<void> {
        // switch back to 'networked' playback
        this.networkEnabled = true;
        this.isPaused = false;
        this.visData.clearCache();

        return this.netConnection.startRemoteTrajectoryPlayback(
            this.playBackFile
        );
    }

    public time(): number {
        return this.visData.currentFrameData.time;
    }

    public stop(): void {
        this.netConnection.abortRemoteSim();
    }

    public pause(): void {
        if (this.networkEnabled) {
            this.netConnection.pauseRemoteSim();
        }

        this.isPaused = true;
    }

    public paused(): boolean {
        return this.isPaused;
    }

    public initializeTrajectoryFile(): void {
        this.netConnection.requestTrajectoryFileInfo(this.playBackFile);
    }

    public gotoTime(timeNs): void {
        if (this.visData.hasLocalCacheForTime(timeNs)) {
            this.visData.gotoTime(timeNs);
        } else {
            if (this.networkEnabled) {
                // else reset the local cache,
                //  and play remotely from the desired simulation time
                this.visData.clearCache();
                this.netConnection.gotoRemoteSimulationTime(timeNs);
            }
        }
    }

    public playFromTime(timeNs): void {
        this.gotoTime(timeNs);
        this.isPaused = false;
    }

    public resume(): void {
        if (this.networkEnabled) {
            this.netConnection.resumeRemoteSim();
        }

        this.isPaused = false;
    }

    public changeFile(newFile): void {
        if (newFile !== this.playBackFile) {
            this.fileChanged = true;
            this.playBackFile = newFile;

            this.visData.WaitForFrame(0);
            this.visData.clearCache();

            this.stop();
            this.start().then(() => {
                this.netConnection.requestSingleFrame(0);
            });
        }
    }

    public markFileChangeAsHandled(): void {
        this.fileChanged = false;
    }

    public getFile(): string {
        return this.playBackFile;
    }

    public disableNetworkCommands(): void {
        this.networkEnabled = false;

        if (this.netConnection.socketIsValid()) {
            this.netConnection.disconnect();
        }
    }

    public cacheJSON(json): void {
        this.visData.cacheJSON(json);
    }

    public clearLocalCache(): void {
        this.visData.clearCache();
    }

    public dragAndDropFileInfo() {
        return this.visData.dragAndDropFileInfo();
    }
}

export { AgentSimController };

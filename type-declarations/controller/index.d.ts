import { NetConnection, VisData, TrajectoryFileInfo } from "../simularium";
export default class SimulariumController {
    netConnection: NetConnection;
    visData: VisData;
    private networkEnabled;
    private isPaused;
    private fileChanged;
    private playBackFile;
    constructor(params: any);
    readonly hasChangedFile: boolean;
    connect(): Promise<{}>;
    start(): Promise<void>;
    time(): number;
    stop(): void;
    pause(): void;
    paused(): boolean;
    initializeTrajectoryFile(): void;
    gotoTime(timeNs: any): void;
    playFromTime(timeNs: any): void;
    resume(): void;
    changeFile(newFile: any): void;
    markFileChangeAsHandled(): void;
    getFile(): string;
    disableNetworkCommands(): void;
    cacheJSON(json: any): void;
    clearLocalCache(): void;
    dragAndDropFileInfo(): TrajectoryFileInfo;
}
export { SimulariumController };

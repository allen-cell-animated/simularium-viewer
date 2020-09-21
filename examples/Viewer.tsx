import React from "react";
import type { UIDisplayData, SelectionStateInfo } from "../type-declarations";

import SimulariumViewer, {
    SimulariumController,
    RenderStyle,
    SimulariumFileFormat,
    VisDataFrame,
} from "../src";

import "./style.css";
import { isEqual } from "lodash";

const netConnectionSettings = {
    serverIp: "staging-node1-agentviz-backend.cellexplore.net",
    serverPort: 9002,
};

// Typescript's File definition is missing this function
//  which is part of the HTML standard on all browsers
//  and needed below
interface FileHTML extends File {
    text(): Promise<string>;
}

interface ViewerState {
    renderStyle: RenderStyle;
    selectedName: string;
    selectedTag: string;
    pauseOn: number;
    particleTypeNames: string[];
    particleTypeTags: string[];
    currentFrame: number;
    currentTime: number;
    height: number;
    width: number;
    selectionStateInfo: SelectionStateInfo;
    hideAllAgents: boolean;
    showPaths: boolean;
    timeStep: number;
    totalDuration: number;
    uiDisplayData: UIDisplayData;
}

const simulariumController = new SimulariumController({
    //trajectoryPlaybackFile: "ATPsynthase_9.h5",
    //netConnectionSettings: netConnectionSettings,
});

let currentFrame = 0;
let currentTime = 0;

const UI_VAR_ALL_TAGS = "UI_VAR_ALL_TAGS";
const UI_VAR_ALL_NAMES = "UI_VAR_ALL_NAMES";

const initialState = {
    renderStyle: RenderStyle.MOLECULAR,
    selectedTag: UI_VAR_ALL_TAGS,
    selectedName: UI_VAR_ALL_NAMES,
    pauseOn: -1,
    particleTypeNames: [],
    particleTypeTags: [],
    currentFrame: 0,
    currentTime: 0,
    height: 700,
    width: 800,
    hideAllAgents: false,
    showPaths: true,
    timeStep: 1,
    totalDuration: 100,
    uiDisplayData: [],
    selectionStateInfo: {
        highlightedTags: [],
        highlightedNames: [],
        hiddenNames: [],
        hiddenTags: [],
    },
};

class Viewer extends React.Component<{}, ViewerState> {
    private viewerRef: React.RefObject<SimulariumViewer>;

    public constructor(props) {
        super(props);
        this.viewerRef = React.createRef();
        this.handleJsonMeshData = this.handleJsonMeshData.bind(this);
        this.handleTimeChange = this.handleTimeChange.bind(this);
        this.highlightParticleTypeByName = this.highlightParticleTypeByName.bind(
            this
        );
        this.highlightParticleTypeByTag = this.highlightParticleTypeByTag.bind(
            this
        );
        this.getTagOptions = this.getTagOptions.bind(this);
        this.state = initialState;
    }

    public componentDidMount(): void {
        window.addEventListener("resize", () => {
            const container = document.querySelector(".container");

            const height = container.clientHeight;
            const width = container.clientWidth;
            this.setState({ height, width });
        });
        const viewerContainer = document.querySelector(".viewer-container");
        if (viewerContainer) {
            viewerContainer.addEventListener("drop", this.onDrop);
            viewerContainer.addEventListener("dragover", this.onDragOver);
        }
    }

    public onDragOver = (e: Event): void => {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        e.preventDefault();
    };

    public onDrop = (e: Event): void => {
        this.onDragOver(e);
        const event = e as DragEvent;
        const input = event.target as HTMLInputElement;
        const data: DataTransfer = event.dataTransfer as DataTransfer;

        const files: FileList = input.files || data.files;
        const filesArr: FileHTML[] = Array.from(files) as FileHTML[];

        Promise.all(
            filesArr.map((file) =>
                file
                    .text()
                    .then((text) => JSON.parse(text) as SimulariumFileFormat)
            )
        ).then((parsedFiles) => {
            const simulariumFile = parsedFiles[0];
            const fileName = filesArr[0].name;
            simulariumController
                .changeFile(fileName, true, simulariumFile)
                .catch((error) => {
                    window.alert(`Error loading file: ${error.message}`);
                });
        });
    };

    private changeFile(file: string) {
        simulariumController.changeFile(file);
    }

    public handleJsonMeshData(jsonData): void {
        console.log("Mesh JSON Data: ", jsonData);
    }

    public handleTimeChange(timeData): void {
        currentFrame = timeData.frameNumber;
        currentTime = timeData.time;
        this.setState({ currentFrame, currentTime });
        if (this.state.pauseOn === currentFrame) {
            simulariumController.pause();
            this.setState({ pauseOn: -1 });
        }
    }

    public turnAgentsOnOff(nameToToggle: string) {
        let currentHiddenNames = this.state.selectionStateInfo.hiddenNames;
        let nextHiddenNames = [];
        if (currentHiddenNames.includes(nameToToggle)) {
            nextHiddenNames = currentHiddenNames.filter(
                (hiddenName) => hiddenName !== nameToToggle
            );
        } else {
            nextHiddenNames = [...currentHiddenNames, nameToToggle];
        }
        console.log(nextHiddenNames);
        this.setState({
            ...this.state,
            selectionStateInfo: {
                ...this.state.selectionStateInfo,
                hiddenNames: nextHiddenNames,
            },
        });
    }

    public highlightParticleTypeByName(name: string): void {
        this.highlightParticleTypeByTag(UI_VAR_ALL_TAGS);

        if (name === UI_VAR_ALL_NAMES) {
            this.setState((prevState) => ({
                ...this.state,
                selectionStateInfo: {
                    ...prevState.selectionStateInfo,
                    highlightedNames: [], // specify none, show all that match tags
                },
                selectedName: name,
            }));
        } else {
            this.setState((prevState) => ({
                ...this.state,
                selectionStateInfo: {
                    ...prevState.selectionStateInfo,
                    highlightedNames: [name],
                },
                selectedName: name,
            }));
        }
    }

    public highlightParticleTypeByTag(tag: string): void {
        if (tag === UI_VAR_ALL_TAGS) {
            this.setState((prevState) => ({
                selectionStateInfo: {
                    ...prevState.selectionStateInfo,
                    highlightedTags: [], // specify none -> show all mathcing name
                },
                selectedTag: tag,
            }));
        } else {
            this.setState((prevState) => ({
                selectionStateInfo: {
                    ...prevState.selectionStateInfo,
                    highlightedTags: [tag],
                },
                selectedTag: tag,
            }));
        }
    }

    public handleTrajectoryInfo(data): void {
        console.log("Trajectory info arrived", data);
        const totalDuration = data.totalSteps * data.timeStepSize;
        this.setState({
            totalDuration,
            timeStep: data.timeStepSize,
        });

        currentTime = 0;
        currentFrame = 0;
    }

    public handleScrubTime(event): void {
        simulariumController.gotoTime(event.target.value);
    }

    public handleUIDisplayData(uiDisplayData: UIDisplayData): void {
        console.log("uiDisplayData", uiDisplayData);
        const allTags = uiDisplayData.reduce(
            (fullArray: string[], subarray) => {
                fullArray = [
                    ...fullArray,
                    ...subarray.displayStates.map((b) => b.id),
                ];
                return fullArray;
            },
            []
        );
        const uniqueTags: string[] = [...new Set(allTags)];
        if (isEqual(uiDisplayData, this.state.uiDisplayData)) {
            return;
        }
        this.setState({
            particleTypeNames: uiDisplayData.map((a) => a.name),
            uiDisplayData: uiDisplayData,
            particleTypeTags: uniqueTags,
            selectionStateInfo: initialState.selectionStateInfo,
        });
    }

    public gotoNextFrame(): void {
        simulariumController.gotoTime(currentTime + this.state.timeStep + 1e-9);
    }

    public gotoPreviousFrame(): void {
        simulariumController.gotoTime(currentTime - this.state.timeStep - 1e-9);
    }

    private getTagOptions(): string[] {
        if (this.state.selectedName === UI_VAR_ALL_NAMES) {
            return this.state.particleTypeTags;
        } else {
            const matches = this.state.uiDisplayData.filter((entry) => {
                return entry.name === this.state.selectedName;
            });

            if (matches[0]) {
                return matches[0].displayStates.map((state) => {
                    return state.id;
                });
            } else {
                return [];
            }
        }
    }

    private getOptionsDom(optionsArray) {
        return optionsArray.map((id, i) => {
            return (
                <option key={id} value={id}>
                    {id}
                </option>
            );
        });
    }

    private configureAndStart() {
        simulariumController.configureNetwork(netConnectionSettings);
        simulariumController.changeFile("ATPsynthase_9.h5");
        simulariumController.start();
    }

    public render(): JSX.Element {
        return (
            <div className="container" style={{ height: "90%", width: "75%" }}>
                <button onClick={() => this.configureAndStart()}>
                    Start
                </button>
                <button onClick={() => simulariumController.pause()}>
                    Pause
                </button>
                <button onClick={() => simulariumController.resume()}>
                    Resume
                </button>
                <button onClick={() => simulariumController.stop()}>
                    stop
                </button>
                {/* <button onClick={() => this.changeFile("test_traj1.h5")}>
                    TEST
                </button>
                <button
                    onClick={() =>
                        this.changeFile("microtubules_v2_shrinking.h5")
                    }
                >
                    MTub
                </button>
                <button onClick={() => this.changeFile("aster.cmo")}>
                    Aster
                </button>
                <button onClick={() => this.changeFile("actin34_0.h5")}>
                    Actin 34
                </button>
                <button onClick={() => this.changeFile("microtubules30_1.h5")}>
                    MT 30
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_1.h5")}>
                    ATP 1
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_2.h5")}>
                    ATP 2
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_3.h5")}>
                    ATP 3
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_4.h5")}>
                    ATP 4
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_5.h5")}>
                    ATP 5
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_6.h5")}>
                    ATP 6
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_7.h5")}>
                    ATP 7
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_8.h5")}>
                    ATP 8
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_9.h5")}>
                    ATP 9
                </button>
                <button onClick={() => this.changeFile("ATPsynthase_10.h5")}>
                    ATP 10
                </button> */}
                <br />
                <input
                    type="range"
                    min="0"
                    value={currentTime}
                    max={this.state.totalDuration}
                    onChange={this.handleScrubTime}
                />
                <button onClick={this.gotoNextFrame.bind(this)}>
                    Next Frame
                </button>
                <button onClick={this.gotoPreviousFrame.bind(this)}>
                    Previous Frame
                </button>
                <br />
                <select
                    onChange={(event) =>
                        this.highlightParticleTypeByName(event.target.value)
                    }
                    value={this.state.selectedName}
                >
                    <option value={UI_VAR_ALL_NAMES}>All Types</option>
                    {this.state.particleTypeNames.map((id, i) => {
                        return (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        );
                    })}
                </select>
                <select
                    onChange={(event) =>
                        this.highlightParticleTypeByTag(event.target.value)
                    }
                    value={this.state.selectedTag}
                >
                    <option value={UI_VAR_ALL_TAGS}>All Tags</option>
                    {this.getOptionsDom(this.getTagOptions())}
                </select>
                {this.state.particleTypeNames.map((id, i) => {
                    return (
                        <React.Fragment key={id}>
                            <label htmlFor={id}>{id}</label>
                            <input
                                type="checkbox"
                                onClick={(event) =>
                                    this.turnAgentsOnOff(event.target.value)
                                }
                                value={id}
                                defaultChecked={true}
                            />
                        </React.Fragment>
                    );
                })}
                <button
                    onClick={() =>
                        this.setState({
                            hideAllAgents: !this.state.hideAllAgents,
                        })
                    }
                >
                    {this.state.hideAllAgents ? "Show all" : "Hide all"}
                </button>
                <button
                    onClick={() =>
                        this.setState({ showPaths: !this.state.showPaths })
                    }
                >
                    ShowPaths
                </button>
                <button
                    onClick={() =>
                        this.setState({
                            renderStyle:
                                this.state.renderStyle === RenderStyle.GENERIC
                                    ? RenderStyle.MOLECULAR
                                    : RenderStyle.GENERIC,
                        })
                    }
                >
                    Switch Render
                </button>
                <div className="viewer-container">
                    <SimulariumViewer
                        ref={this.viewerRef}
                        renderStyle={this.state.renderStyle}
                        height={this.state.height}
                        width={this.state.width}
                        loggerLevel="debug"
                        onTimeChange={this.handleTimeChange.bind(this)}
                        simulariumController={simulariumController}
                        onJsonDataArrived={this.handleJsonMeshData}
                        onTrajectoryFileInfoChanged={this.handleTrajectoryInfo.bind(
                            this
                        )}
                        selectionStateInfo={this.state.selectionStateInfo}
                        onUIDisplayDataChanged={this.handleUIDisplayData.bind(
                            this
                        )}
                        loadInitialData={true}
                        hideAllAgents={this.state.hideAllAgents}
                        showPaths={this.state.showPaths}
                    />
                </div>
            </div>
        );
    }
}

export default Viewer;

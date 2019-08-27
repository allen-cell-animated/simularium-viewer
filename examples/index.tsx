import ReactDOM from "react-dom";
import React from "react";

import AgentVizViewer, { AgentSimController } from  '../dist';
import './style.css';


const netConnectionSettings = {
    serverIp: "52.15.70.94",
    serverPort: 9002,
}

const agentSim = new AgentSimController(netConnectionSettings, { trajectoryPlaybackFile: "actin5-1.h5" })
let currentFrame = 0;
let currentTime = 0;
const handleTimeChange = (timeData) => {
    currentFrame = timeData.frameNumber;
    currentTime = timeData.time;
}

ReactDOM.render(
    <React.Fragment>
        <button 
            onClick={() => agentSim.start()}
        >Start</button>
        <button
            onClick={() => agentSim.pause()}
        >Pause</button>
        <button
            onClick={() => agentSim.playFromCache(currentFrame)}
        >Play from cache</button>
        <button
            onClick={() => agentSim.stop()}
        >stop</button>
        <button
            onClick={() => agentSim.changeFile('microtubules15.h5')}
        >
            microtubules file
        </button>
        <button
            onClick={() => agentSim.changeFile('actin5-1.h5')}
        >
            actin file
        </button>

        <AgentVizViewer 
            height={600}
            width={600}
            devgui={false}
            loggerLevel="debug"
            onTimeChange={handleTimeChange}
            agentSimController={agentSim}

        />
    </React.Fragment>,
    document.getElementById("root")
);
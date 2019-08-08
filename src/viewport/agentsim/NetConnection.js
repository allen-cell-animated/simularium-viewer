const jsLogger = require('js-logger');

class NetConnection {
  constructor(simParameters, visData) {
    // these have been set to correspond to backend values
    this.playbackTypes = Object.freeze({
      ID_LIVE_SIMULATION: 0,
      ID_PRE_RUN_SIMULATION: 1,
      ID_TRAJECTORY_FILE_PLAYBACK: 2,
    });

    this.webSocket = null;
    this.serverIp = '127.0.0.1';
    this.serverPort = '9002';

    this.webSocketSentString = 'Web Socket Request Sent: ';
    this.mvisData = visData;
    this.msimParameters = simParameters;

    // these have been set to correspond to backend values
    this.mmsgTypes = Object.freeze({
      ID_UNDEFINED_WEB_REQUEST: 0,
      ID_VIS_DATA_ARRIVE: 1,
      ID_VIS_DATA_REQUEST: 2,
      ID_VIS_DATA_FINISH: 3,
      ID_VIS_DATA_PAUSE: 4,
      ID_VIS_DATA_RESUME: 5,
      ID_VIS_DATA_ABORT: 6,
      ID_UPDATE_TIME_STEP: 7,
      ID_UPDATE_RATE_PARAM: 8,
      ID_MODEL_DEFINITION: 9,
      ID_HEARTBEAT_PING: 10,
      ID_HEARTBEAT_PONG: 11,
      ID_PLAY_CACHE: 12,
    });

    this.mlogger = jsLogger.get('netconnection');
    this.mlogger.setLevel(jsLogger.ERROR);
  }

  get visData() { return this.mvisData; }

  get simParameters() { return this.msimParameters; }

  get msgTypes() { return this.mmsgTypes; }

  get logger() { return this.mlogger; }

  /**
    * WebSocket State
    */
  socketIsConnecting() {
    return this.webSocket !== null
            && this.webSocket.readyState === this.webSocket.CONNECTING;
  }

  socketIsValid() {
    return !(this.webSocket === null
            || this.webSocket.readyState === this.webSocket.CLOSED);
  }

  /**
    *   Websocket Message Handler
    * */
  onMessage(event) {
    if (!this.owner.socketIsValid()) { return; }

    const { logger } = this.owner;
    const msg = JSON.parse(event.data);
    const msgType = msg.msg_type;
    const numMsgTypes = Object.keys(this.owner.msgTypes).length;

    if (msgType > numMsgTypes || msgType < 1) {
      // this suggests either the back-end is out of sync, or a connection to an unknown back-end
      //  either would be very bad
      logger.console.error('Unrecognized web message of type ', msg.msg_type, ' arrived');
      return;
    }

    logger.debug('Websocket Message Recieved: ', msg);
    const responseData = {};
    switch (msgType) {
      case this.owner.msgTypes.ID_VIS_DATA_ARRIVE:
        this.owner.visData.parseAgentsFromNetData(msg);
        break;
      case this.owner.msgTypes.ID_UPDATE_TIME_STEP:
        // the timestep has been updated from another client
        this.owner.simParameters.timeStepSliderVal = msg.slider_val;
        this.owner.simParameters.lastTimeStepSliderVal = msg.slider_val;
        break;
      case this.owner.msgTypes.ID_UPDATE_RATE_PARAM:
        if ('slider_val' in msg) {
          this.owner.simParameters.paramList[msg.param_name].val = msg.slider_val;
          this.owner.simParameters.paramListCache[msg.param_name] = msg.slider_val;
        }
        break;
      case this.owner.msgTypes.ID_HEARTBEAT_PING:
        responseData.msg_type = this.owner.msgTypes.ID_HEARTBEAT_PONG;
        responseData.conn_id = msg.conn_id;

        this.owner.sendWebSocketRequest(responseData, 'Heartbeat pong');
        break;
      case this.owner.msgTypes.ID_MODEL_DEFINITION:
        logger.debug('Model Definition Arrived');
        this.owner.simParameters.setParametersFromModel(msg);
        break;
      default:
        logger.debug('Web request recieved', msg.msg_type);
        break;
    }
  }

  /**
    * WebSocket Connect
    * */
  connect() {
    const uri = `ws://${this.serverIp}:${this.serverPort}/`;
    this.connectToUri(uri);
  }

  connectToUri(uri) {
    if (this.socketIsValid()) { this.disconnect(); }
    this.webSocket = new WebSocket(uri);
    this.logger.debug('WS Connection Request Sent: ', uri);

    // message handler
    this.webSocket.onmessage = this.onMessage;
    this.webSocket.owner = this;
  }

  disconnect() {
    if (!this.socketIsValid()) {
      this.logger.warn('disconnect failed, client is not connected');
      return;
    }

    this.webSocket.close();
  }

  static getIp() {
    return 'ws://127.0.0.1:9002';
  }

  waitForSocketConnection(socket, callback) {
    setTimeout(
      () => {
        if (socket.readyState === 1) {
          this.logger.debug('Connection is made');
          if (callback != null) {
            callback();
          }
        } else {
          this.logger.debug('wait for connection...');
          this.waitForSocketConnection(socket, callback);
        }
      }, 5,
    ); // wait 5 milisecond for the connection...
  }

  /**
    * Websocket Send Helper Functions
    */
  logWebSocketRequest(whatRequest, jsonData) {
    this.logger.debug(this.webSocketSentString, whatRequest, jsonData);
  }

  sendWebSocketRequest(jsonData, requestDescription) {
    this.webSocket.send(JSON.stringify(jsonData));
    this.logWebSocketRequest(requestDescription, jsonData);
  }

  /**
    * Websocket Update Parameters
    */
  sendTimeStepUpdate(newTimeStep, sliderVal) {
    if (!this.socketIsValid()) { return; }

    const jsonData = {
      msg_type: this.msgTypes.ID_UPDATE_TIME_STEP,
      time_step: newTimeStep,
      slider_val: sliderVal,
    };
    this.sendWebSocketRequest(jsonData, 'Update Time-Step');
  }

  sendParameterUpdate(paramName, paramValue, sliderVal) {
    if (!this.socketIsValid()) { return; }

    const jsonData = {
      msg_type: this.msgTypes.ID_UPDATE_RATE_PARAM,
      param_name: paramName,
      param_value: paramValue,
      slider_val: sliderVal,
    };
    this.sendWebSocketRequest(jsonData, 'Rate Parameter Update');
  }

  sendModelDefinition(model) {
    if (!this.socketIsValid()) { return; }

    const dataToSend = model;
    dataToSend.msg_type = this.msgTypes.ID_MODEL_DEFINITION;
    this.sendWebSocketRequest(dataToSend, 'Model Definition');
  }

  /**
    * WebSocket Simulation Control
    *
    * Simulation Run Modes:
    *  Live : Results are sent as they are calculated
    *  Pre-Run : All results are evaluated, then sent piecemeal
    *  Trajectory File: No simulation run, stream a result file piecemeal
    *
    */
  startRemoteSimPreRun(timeStep, numTimeSteps) {
    if (!this.socketIsValid()) {
      this.logger.debug('Requesting remote IP');
      this.connectToUri(NetConnection.getIp());
      if (!this.socketIsValid()) {
        this.logger.debug('Failed to connect to remote IP');
      }
    }

    this.waitForSocketConnection(this.webSocket, () => {
      const jsonData = {
        msg_type: this.msgTypes.ID_VIS_DATA_REQUEST,
        mode: this.playbackTypes.ID_PRE_RUN_SIMULATION,
        'time-step': timeStep,
        'num-time-steps': numTimeSteps,
      };
      this.sendWebSocketRequest(jsonData, 'Start Simulation Pre-Run');
    });
  }

  startRemoteSimLive() {
    if (!this.socketIsValid()) {
      this.logger.debug('Requesting remote IP');
      this.connectToUri(NetConnection.getIp());
      if (!this.socketIsValid()) {
        this.logger.debug('Failed to connect to remote IP');
      }
    }

    this.waitForSocketConnection(this.webSocket, () => {
      const jsonData = {
        msg_type: this.msgTypes.ID_VIS_DATA_REQUEST,
        mode: this.playbackTypes.ID_LIVE_SIMULATION,
      };
      this.sendWebSocketRequest(jsonData, ' Start Simulation Live');
    });
  }

  startRemoteTrajectoryPlayback(fileName) {
    if (fileName === '' || fileName === null) {
      return;
    }

    if (!this.socketIsValid()) {
      this.logger.debug('Requesting remote IP');
      this.connectToUri(NetConnection.getIp());
      if (!this.socketIsValid()) {
        this.logger.debug('Failed to connect to remote IP');
      }
    }

    this.waitForSocketConnection(this.webSocket, () => {
      const jsonData = {
        msg_type: this.msgTypes.ID_VIS_DATA_REQUEST,
        mode: this.playbackTypes.ID_TRAJECTORY_FILE_PLAYBACK,
        'file-name': fileName,
      };
      this.sendWebSocketRequest(jsonData, 'Start Trajectory File Playback');
    });
  }

  playRemoteSimCacheFromFrame(cacheFrame) {
    if (!this.socketIsValid()) { return; }

    const jsonData = {
      msg_type: this.msgTypes.ID_PLAY_CACHE,
      'frame-num': cacheFrame,
    };
    this.sendWebSocketRequest(jsonData, 'Play Simulation Cache');
  }

  pauseRemoteSim() {
    if (!this.socketIsValid()) { return; }
    this.sendWebSocketRequest({ msg_type: this.msgTypes.ID_VIS_DATA_PAUSE }, 'Pause Simulation');
  }

  resumeRemoteSim() {
    if (!this.socketIsValid()) { return; }
    this.sendWebSocketRequest({ msg_type: this.msgTypes.ID_VIS_DATA_RESUME }, 'Resume Simulation');
  }

  abortRemoteSim() {
    if (!this.socketIsValid()) { return; }
    this.sendWebSocketRequest({ msg_type: this.msgTypes.ID_VIS_DATA_ABORT }, 'Abort Simulation');
    this.disconnect();
  }

  /**
    * GUI Remote Sim Functions
    */
  guiStartRemoteSimPreRun() {
    this.startRemoteSimPreRun(
      this.simParameters.preRunTimeStep,
      this.simParameters.preRunNumTimeSteps,
    );

    this.simParameters.newSimulationIsRunning = true;
  }

  guiStartRemoteSimLive() {
    this.startRemoteSimLive();
    this.simParameters.newSimulationIsRunning = true;
  }

  guiStartRemoteTrajectoryPlayback() {
    this.startRemoteTrajectoryPlayback(
      this.simParameters.trajectoryPlaybackFile,
    );
    this.simParameters.newSimulationIsRunning = true;
  }

  guiPlayRemoteSimCache() {
    this.playRemoteSimCacheFromFrame(
      this.simParameters.cachePlaybackFrame,
    );
  }

  /**
    *   Check for parameter updates (that need to be sent to backend)
    * */
  checkForUpdates() {
    if (this.simParameters !== 'undefined') {
      let updates = this.simParameters.getRateParameterUpdates();
      Object.keys(updates).forEach((paramName) => {
        this.sendParameterUpdate(
          paramName,
          updates[paramName].val,
          updates[paramName]['slider-val'],
        );
      });

      updates = this.simParameters.getTimeStepUpdate();
      if (Object.keys(updates).length !== 0 || updates.constructor !== Object) {
        this.logger.debug('Time step update found:', updates);
        this.sendTimeStepUpdate(
          updates.val,
          updates['slider-val'],
        );
      }
    }
  }
}

export { NetConnection };
export default NetConnection;

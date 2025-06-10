const { InstanceBase, runEntrypoint, InstanceStatus } = require('@companion-module/base');
const WebSocket = require('ws'); // Required for WebSocket server

class ZipCaptionsController extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.wsServer = null; // Our WebSocket server instance
    this.wsClient = null; // The connected client (your Chrome extension)
    this.pingInterval = null;

    this.CHOICES_COMMANDS = [
      { id: 'PLAY_PAUSE', label: 'Play/Pause' },
      { id: 'TOGGLE_LISTEN', label: 'Start/Stop' }
    ];
  }

  async init(config) {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);

    this.log('debug', 'Initializing Zip Captions Controller module...');

    this.initWebSocketServer();
    this.initActions();
    this.updateStatus(InstanceStatus.Ok);
  }

  async destroy() {
    this.log('debug', 'Destroying Zip Captions Controller module...');
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
    if (this.pingInterval) { 
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  getConfigFields() {
    return [
      {
        type: 'static-text',
        id: 'info',
        width: 12,
        label: 'Information',
        value: 'This module controls Zip Captions via a Chrome Extension. Ensure the Chrome Extension is installed and running, and the port matches.',
      },
      {
        type: 'number',
        id: 'port',
        label: 'WebSocket Server Port',
        width: 4,
        min: 1024,
        max: 65535,
        default: 8082, // Default port, MUST match Chrome Extension
        tooltip: 'This port must match the port configured in your Chrome Extension\'s background.js file.'
      }
    ];
  }

  async configUpdated(config) {
    this.config = config;
    this.log('debug', 'Configuration updated. Restarting WebSocket server...');
    if (this.wsClient) this.wsClient.close();
    if (this.wsServer) this.wsServer.close();
    this.initWebSocketServer();
  }

  initWebSocketServer() {
    const port = this.config.port || 8080;
    this.wsServer = new WebSocket.Server({ port: port });

    this.wsServer.on('connection', (ws) => {
      this.log('info', `WebSocket client connected on port ${port}`);
      this.wsClient = ws;
      this.updateStatus(InstanceStatus.Ok, 'Connected to Extension');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Start sending ping messages to keep the service worker alive
    this.pingInterval = setInterval(() => {
      if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
        this.wsClient.send('PING'); // Send a simple PING command
        this.log('debug', 'Sent PING to extension.');
      }
    }, 10000); // Send PING every 30 seconds

      ws.on('close', (code, reason) => {
        this.log('info', `WebSocket client disconnected. Code: ${code}, Reason: ${reason}`);
        this.wsClient = null;
        this.updateStatus(InstanceStatus.Warning, 'Disconnected from Extension');
        if (this.pingInterval) {
         clearInterval(this.pingInterval);
         this.pingInterval = null;
        }
      });

      ws.on('error', (error) => {
        this.log('error', `WebSocket client error: ${error.message}`);
        this.updateStatus(InstanceStatus.ConnectionFailure, `Extension Error: ${error.message}`);
      });
    });

    this.wsServer.on('error', (error) => {
      this.log('error', `WebSocket server setup error: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        this.updateStatus(InstanceStatus.ConnectionFailure, `Port ${port} is already in use!`);
      } else {
        this.updateStatus(InstanceStatus.ConnectionFailure, `Server Error: ${error.message}`);
      }
      this.wsServer = null;
    });

    this.log('info', `WebSocket server listening on port ${port}`);
  }

  initActions() {
    const actions = {
      send_command: {
        name: 'Send Command to Zip Captions',
        options: [
          {
            type: 'dropdown',
            id: 'command',
            label: 'Command',
            default: 'PLAY_PAUSE',
            choices: this.CHOICES_COMMANDS,
            tooltip: 'Select the action to perform in Zip Captions.'
          }
        ],
        callback: async (event) => {
          const commandToSend = event.options.command;
          this.log('debug', `Sending command: ${commandToSend}`);
          if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
            this.wsClient.send(commandToSend);
            this.log('info', `Command "${commandToSend}" sent.`);
          } else {
            this.log('warn', `No WebSocket client connected or client not ready. Command "${commandToSend}" not sent.`);
            this.updateStatus(InstanceStatus.Warning, 'Extension Not Connected');
          }
        },
      },
    };
    this.setActionDefinitions(actions);
  }
}

runEntrypoint(ZipCaptionsController);
// Web Serial connection class for Ting EP-2350
// Communicates with MicroPython REPL over USB serial
// Uses Web Serial API (better CDC ACM support than WebUSB)

const TING_VENDOR_ID = 0x2367;
const TING_PRODUCT_ID = 0x0620;

// Connection states
export const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

export class TingUSB {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.state = ConnectionState.DISCONNECTED;
    this.errorMessage = '';
    this.responseBuffer = '';
    this.onStateChange = null;
    this.onDisconnect = null; // Callback for unexpected disconnection
    this.readLoopActive = false;

    // Command queue to serialize all commands (prevents concurrent execution)
    this.commandLock = Promise.resolve();
    this.commandQueue = [];

    // Global throttle to prevent command flooding
    this.lastCommandTime = 0;
    this.minCommandInterval = 50; // ms minimum between any commands

    // Parameter update throttling - prevents device freeze during slider adjustment
    // Uses a single global throttle instead of per-parameter debounce
    this.paramThrottleMs = 300; // ms between parameter updates
    this.paramUpdateTimer = null;
    this.pendingParamUpdate = null; // Latest param value to send
    this.paramUpdateInProgress = false;

    // Polling pause - stops polling during parameter adjustment
    this.pollingPaused = false;
    this.pollingResumeTimer = null;

    // Set up disconnect listener
    if (TingUSB.isSupported()) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this.port && event.target === this.port) {
          this.handleUnexpectedDisconnect();
        }
      });
    }
  }

  // Handle unexpected device disconnection (sleep, unplugged, etc.)
  handleUnexpectedDisconnect() {
    console.warn('[WebSerial] Device disconnected unexpectedly');
    this.readLoopActive = false;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.setState(ConnectionState.DISCONNECTED);

    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  // Check if Web Serial is supported
  static isSupported() {
    return 'serial' in navigator;
  }

  // Update connection state and notify listeners
  setState(state, errorMessage = '') {
    this.state = state;
    this.errorMessage = errorMessage;
    if (this.onStateChange) {
      this.onStateChange(state, errorMessage);
    }
  }

  // Request device and connect using Web Serial API
  async connect() {
    if (!TingUSB.isSupported()) {
      this.setState(ConnectionState.ERROR, 'Web Serial not supported in this browser. Use Chrome or Edge.');
      return false;
    }

    try {
      this.setState(ConnectionState.CONNECTING);

      // Request serial port - filter by USB vendor/product ID
      this.port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: TING_VENDOR_ID, usbProductId: TING_PRODUCT_ID }]
      });

      console.log('[WebSerial] Port selected:', this.port.getInfo());

      // Open the port with standard serial settings
      // Use timeout in case port is locked by another app
      console.log('[WebSerial] Opening port...');
      try {
        await Promise.race([
          this.port.open({
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            flowControl: 'none'
          }),
          this.sleep(5000).then(() => {
            throw new Error('Port open timeout - is another app using the device? Close any terminal or Ting app.');
          })
        ]);
      } catch (openErr) {
        console.error('[WebSerial] Failed to open port:', openErr);
        throw openErr;
      }

      console.log('[WebSerial] Port opened');

      // Get reader and writer
      this.writer = this.port.writable.getWriter();

      // Start background read loop
      this.startReadLoop();
      console.log('[WebSerial] Read loop started');

      // Wait a bit for device to be ready
      await this.sleep(100);

      // Send Ctrl+C to interrupt any running program and get to REPL
      console.log('[WebSerial] Sending Ctrl+C to reset REPL...');
      await this.sendRawDirect('\x03');
      await this.sleep(300);

      // Send another Ctrl+C in case there was a nested prompt
      await this.sendRawDirect('\x03');
      await this.sleep(200);

      // Send newline to get fresh prompt
      await this.sendRawDirect('\r\n');
      await this.sleep(300);

      console.log('[WebSerial] Initial buffer after connect:', JSON.stringify(this.responseBuffer));

      // Clear buffer before starting
      this.responseBuffer = '';

      this.setState(ConnectionState.CONNECTED);
      console.log('[WebSerial] Connection complete');
      return true;

    } catch (err) {
      console.error('[WebSerial] Connect error:', err);

      let message = 'Failed to connect';
      if (err.name === 'NotFoundError') {
        message = 'No device selected';
      } else if (err.name === 'SecurityError') {
        message = 'Serial access denied';
      } else if (err.message) {
        message = err.message;
      }

      this.setState(ConnectionState.ERROR, message);
      return false;
    }
  }

  // Disconnect from device
  disconnect() {
    // Stop the read loop first
    this.readLoopActive = false;

    // Cancel any pending parameter updates
    if (this.paramUpdateTimer) {
      clearTimeout(this.paramUpdateTimer);
      this.paramUpdateTimer = null;
    }
    this.pendingParamUpdate = null;
    this.paramUpdateInProgress = false;

    // Cancel polling pause timer
    if (this.pollingResumeTimer) {
      clearTimeout(this.pollingResumeTimer);
      this.pollingResumeTimer = null;
    }
    this.pollingPaused = false;

    // Reset command lock and throttle for clean reconnection
    this.commandLock = Promise.resolve();
    this.lastCommandTime = 0;

    // Release writer and close port in background
    const writer = this.writer;
    const reader = this.reader;
    const port = this.port;

    this.writer = null;
    this.reader = null;
    this.port = null;

    (async () => {
      try {
        if (writer) {
          await writer.close();
        }
      } catch {
        // Ignore
      }
      try {
        if (reader) {
          await reader.cancel();
        }
      } catch {
        // Ignore
      }
      try {
        if (port) {
          await port.close();
        }
      } catch {
        // Ignore
      }
    })();

    this.setState(ConnectionState.DISCONNECTED);
  }

  // Send raw data (direct, no state check - for initialization)
  async sendRawDirect(data) {
    if (!this.writer) {
      throw new Error('Writer not ready');
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    await this.writer.write(bytes);
  }

  // Send raw data
  async sendRaw(data) {
    // Allow sending during CONNECTING (for initialization) or CONNECTED state
    if (!this.writer || (this.state !== ConnectionState.CONNECTED && this.state !== ConnectionState.CONNECTING)) {
      return;
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);

    try {
      await this.writer.write(bytes);
    } catch (err) {
      console.error('[WebSerial] Send error:', err);
      // Only set error state if we were connected
      if (this.state === ConnectionState.CONNECTED) {
        this.setState(ConnectionState.ERROR, 'Send failed');
      }
    }
  }

  // Send command and wait for response (serialized via lock)
  async sendCommand(cmd, timeout = 500) {
    if (!this.port || this.state !== ConnectionState.CONNECTED) {
      throw new Error('Not connected');
    }

    // Serialize commands using a lock chain
    // This ensures only one command executes at a time
    const executeCommand = async () => {
      // Enforce minimum interval between commands to prevent device freeze
      const now = Date.now();
      const timeSinceLastCommand = now - this.lastCommandTime;
      if (timeSinceLastCommand < this.minCommandInterval) {
        await this.sleep(this.minCommandInterval - timeSinceLastCommand);
      }

      // Clear response buffer
      this.responseBuffer = '';

      // Send command with newline
      await this.sendRaw(cmd + '\r\n');
      this.lastCommandTime = Date.now();

      // Wait for response with timeout
      // Keep waiting until we see the >>> prompt or timeout
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        await this.sleep(50);
        if (this.responseBuffer.includes('>>>')) {
          break;
        }
      }

      // Parse response - remove echo and prompt
      let response = this.responseBuffer;

      // Log for debugging
      console.log(`[WebSerial] Command: ${cmd}`);
      console.log(`[WebSerial] Raw response: ${response}`);

      // Remove the echoed command
      const cmdStart = response.indexOf(cmd);
      if (cmdStart !== -1) {
        response = response.substring(cmdStart + cmd.length);
      }

      // Remove >>> prompt and newlines
      response = response.replace(/>>>\s*/g, '').trim();

      console.log(`[WebSerial] Parsed response: ${response}`);

      return response;
    };

    // Chain this command to the lock, ensuring serial execution
    this.commandLock = this.commandLock.then(executeCommand, executeCommand);
    return this.commandLock;
  }

  // Background read loop using Web Serial readable stream
  async startReadLoop() {
    this.readLoopActive = true;

    if (!this.port || !this.port.readable) {
      console.warn('[WebSerial] Port not readable');
      return;
    }

    const decoder = new TextDecoder();

    while (this.readLoopActive && this.port && this.port.readable) {
      try {
        this.reader = this.port.readable.getReader();

        while (this.readLoopActive) {
          const { value, done } = await this.reader.read();

          if (done) {
            console.log('[WebSerial] Reader done');
            break;
          }

          if (value && value.byteLength > 0) {
            const text = decoder.decode(value);
            this.responseBuffer += text;
            // Log incoming data for debugging
            console.log('[WebSerial] Received:', text.replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
          }
        }

        this.reader.releaseLock();
        this.reader = null;
      } catch (err) {
        if (this.readLoopActive && this.port) {
          console.warn('[WebSerial] Read error:', err);
          // Connection may have been lost
          if (err.name === 'NetworkError' || err.name === 'NotFoundError') {
            this.handleUnexpectedDisconnect();
            break;
          }
        }

        // Release reader lock if held
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch {
            // Ignore
          }
          this.reader = null;
        }
      }
    }
    console.log('[WebSerial] Read loop ended');
  }

  // Helper sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========================================
  // Ting-specific API methods
  // ========================================

  // Set effect parameter in real-time
  // Clamps value to valid range before sending to prevent glitches
  async setParam(slot, row, param, value) {
    // Ensure value is a valid number
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      console.warn(`[WebSerial] Invalid param value: ${value}`);
      return false;
    }
    const cmd = `fx.param(${slot}, ${row}, "${param}", ${numValue})`;
    return await this.sendCommand(cmd);
  }

  // Set effect parameter with global throttling
  // Uses a single throttle for ALL parameters to prevent device freeze
  // Only the most recent parameter value is sent; intermediate values are dropped
  setParamDebounced(slot, row, param, value) {
    // Pause polling while adjusting parameters
    this.pausePolling();

    // Store the latest parameter update (overwrites any pending update)
    this.pendingParamUpdate = { slot, row, param, value };

    // If we're already waiting to send, the timer will pick up the latest value
    if (this.paramUpdateTimer || this.paramUpdateInProgress) {
      return;
    }

    // Schedule the parameter update
    this.paramUpdateTimer = setTimeout(() => this.flushParamUpdate(), this.paramThrottleMs);
  }

  // Send the pending parameter update
  async flushParamUpdate() {
    this.paramUpdateTimer = null;

    if (!this.pendingParamUpdate || this.paramUpdateInProgress) {
      return;
    }

    const { slot, row, param, value } = this.pendingParamUpdate;
    this.pendingParamUpdate = null;
    this.paramUpdateInProgress = true;

    try {
      const result = await this.setParam(slot, row, param, value);
      if (result && result.includes('Error')) {
        console.warn('[WebSerial] setParam returned error:', result);
      }
    } catch (err) {
      console.warn('[WebSerial] setParam error:', err);
      if (err.message?.includes('Not connected')) {
        this.handleUnexpectedDisconnect();
      }
    } finally {
      this.paramUpdateInProgress = false;

      // If more updates came in while we were sending, schedule another flush
      if (this.pendingParamUpdate) {
        this.paramUpdateTimer = setTimeout(() => this.flushParamUpdate(), this.paramThrottleMs);
      }
    }
  }

  // Pause polling during parameter adjustment to avoid command conflicts
  pausePolling() {
    this.pollingPaused = true;

    // Clear any existing resume timer
    if (this.pollingResumeTimer) {
      clearTimeout(this.pollingResumeTimer);
    }

    // Resume polling after 1 second of inactivity
    this.pollingResumeTimer = setTimeout(() => {
      this.pollingPaused = false;
      this.pollingResumeTimer = null;
    }, 1000);
  }

  // Check if polling is currently paused
  isPollingPaused() {
    return this.pollingPaused;
  }

  // Load preset into active state
  async loadPreset(slot) {
    const cmd = `fx.load_preset(${slot})`;
    return await this.sendCommand(cmd);
  }

  // Read preset definition
  async listPreset(slot) {
    const cmd = `fx.list_preset(${slot})`;
    return await this.sendCommand(cmd);
  }

  // Read currently loaded/active chain
  async listLoaded(slot) {
    const cmd = `fx.list_loaded(${slot})`;
    return await this.sendCommand(cmd);
  }

  // Toggle effects on/off
  async flip() {
    const cmd = `fx.flip()`;
    return await this.sendCommand(cmd);
  }

  // Get handle position (0.0 - 1.0)
  async getHandle() {
    const response = await this.sendCommand('ui.handle()');
    return parseFloat(response) || 0;
  }

  // Get accelerometer values [x, y, z]
  async getAccelerometer() {
    const response = await this.sendCommand('ui.acc()');
    try {
      // Parse Python list format: [x, y, z]
      const cleaned = response.replace(/'/g, '"');
      return JSON.parse(cleaned);
    } catch {
      return [0, 0, 0];
    }
  }

  // Select/switch to a specific FX slot on the device
  // LED behavior: ui.leds(slot, 1) turns on the LED for the slot.
  // The device automatically turns off the previous LED when a new preset is loaded,
  // so we only need to explicitly turn on the new slot's LED.
  async selectSlot(slot) {
    // Import teenage module first
    await this.sendCommand('import teenage', 100);

    // Set the device's internal position counter
    // This ensures hardware button cycling starts from this slot
    await this.sendCommand(`teenage.fx_pos = ${slot}`, 100);

    // Load the preset
    await this.loadPreset(slot);

    // Update LED - just turn on the selected one
    // Device handles turning off previous LED automatically
    await this.sendCommand(`ui.leds(${slot}, 1)`, 100);

    return true;
  }

  // Poll device for current slot (used to sync when user presses hardware button)
  async pollCurrentSlot() {
    if (this.state !== ConnectionState.CONNECTED) {
      return -1;
    }
    try {
      const response = await this.sendCommand('teenage.fx_pos', 200);
      const slot = parseInt(response);
      return (isNaN(slot) || slot < 0 || slot > 3) ? -1 : slot;
    } catch {
      return -1;
    }
  }

  // Parse fx.list_preset() text output from device
  // Format example:
  // 0 [ 8 HIGHPASS ]
  //     cutoff              0.30
  // 1 [ 1 LOWPASS ]
  //     cutoff              0.40
  // HANDLE:
  //     row                    1
  //     param                  0
  //     depth               0.50
  parsePresetOutput(output) {
    const preset = {
      name: '',
      comment: '',
      list: [],
      handle: null,
      shake: null,
      lfo: null,
      trigger: null
    };

    if (!output || !output.trim()) {
      return preset;
    }

    const lines = output.split('\n');
    let currentEffect = null;
    let currentSection = 'effects'; // 'effects', 'handle', 'shake', 'lfo'

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for modulation section headers
      if (trimmed === 'HANDLE:') {
        currentSection = 'handle';
        preset.handle = { row: 0, param: 0, depth: 0 };
        continue;
      }
      if (trimmed === 'SHAKE:') {
        currentSection = 'shake';
        preset.shake = { row: 0, param: 0, depth: 0 };
        continue;
      }
      if (trimmed === 'LFO:') {
        currentSection = 'lfo';
        preset.lfo = { row: 0, param: 0, depth: 0, shape: 'sine', speed: 1 };
        continue;
      }

      // Parse effect row header: "0 [ 8 HIGHPASS ]"
      const effectMatch = trimmed.match(/^(\d+)\s*\[\s*(\d+)\s+(\w+)\s*\]$/);
      if (effectMatch) {
        currentSection = 'effects';
        const [, rowStr, typeIdStr, effectName] = effectMatch;
        currentEffect = {
          effect: effectName,
          _typeId: parseInt(typeIdStr),
          _row: parseInt(rowStr)
        };
        preset.list.push(currentEffect);
        continue;
      }

      // Parse parameter line: "    cutoff              0.30"
      const paramMatch = trimmed.match(/^([\w-]+)\s+([\d.-]+)$/);
      if (paramMatch) {
        const [, paramName, valueStr] = paramMatch;
        const value = parseFloat(valueStr);

        if (currentSection === 'effects' && currentEffect) {
          currentEffect[paramName] = value;
        } else if (currentSection === 'handle' && preset.handle) {
          preset.handle[paramName] = value;
        } else if (currentSection === 'shake' && preset.shake) {
          preset.shake[paramName] = value;
        } else if (currentSection === 'lfo' && preset.lfo) {
          preset.lfo[paramName] = value;
        }
      }
    }

    console.log('[WebSerial] Parsed preset:', preset);
    return preset;
  }

  // Import all presets from device
  async importAllPresets() {
    const presets = [null, null, null, null];

    console.log('[WebSerial] Starting preset import...');

    // Import required modules first
    try {
      await this.sendCommand('import fx, teenage, ui', 1000);
      console.log('[WebSerial] Modules imported');
    } catch (err) {
      console.warn('[WebSerial] Could not import modules:', err);
    }

    for (let slot = 0; slot < 4; slot++) {
      // Check if still connected before each slot
      if (this.state !== ConnectionState.CONNECTED || !this.port) {
        console.warn('[WebSerial] Device disconnected during import, aborting');
        break;
      }

      try {
        console.log(`[WebSerial] Importing slot ${slot}...`);

        // Get preset definition
        const output = await this.listPreset(slot);
        console.log(`[WebSerial] Slot ${slot} raw output:`, output);

        if (output && output.trim()) {
          const preset = this.parsePresetOutput(output);

          // Keep SAMPLE effects to match config.json (MIC IN row)

          console.log(`[WebSerial] Slot ${slot} parsed:`, preset);

          // Only set if we got valid effects (after filtering)
          if (preset.list && preset.list.length > 0) {
            presets[slot] = preset;
            console.log(`[WebSerial] Slot ${slot} imported with ${preset.list.length} effects`);
          } else {
            console.log(`[WebSerial] Slot ${slot} has no user effects`);
          }
        } else {
          console.log(`[WebSerial] Slot ${slot} is empty`);
        }
      } catch (err) {
        // If we get a "Not connected" error, stop trying
        if (err.message?.includes('Not connected')) {
          console.warn('[WebSerial] Device disconnected during import, aborting');
          break;
        }
        console.warn(`[WebSerial] Failed to import preset ${slot}:`, err);
      }
    }

    console.log('[WebSerial] Preset import complete:', presets);
    return presets;
  }

  // Get battery voltage
  async getBatteryVoltage() {
    const response = await this.sendCommand('ui.get_vbat()');
    return parseFloat(response) || 0;
  }

  // Send soft reset (Ctrl+D)
  async softReset() {
    await this.sendRaw('\x04');
    await this.sleep(500);
  }

  // Send interrupt (Ctrl+C)
  async interrupt() {
    await this.sendRaw('\x03');
    await this.sleep(100);
  }

  // Test communication with a simple command
  async testConnection() {
    console.log('[WebSerial] Testing connection...');

    // Try a simple print command
    const result = await this.sendCommand('print("TING_OK")', 1000);
    console.log('[WebSerial] Test result:', result);

    return result.includes('TING_OK');
  }

  // Get current FX slot position
  async getCurrentSlot() {
    // Import teenage module first
    await this.sendCommand('import teenage', 300);
    const response = await this.sendCommand('teenage.fx_pos', 500);
    const num = parseInt(response);
    // Return 0 for invalid values or -1 (no preset loaded)
    return (isNaN(num) || num < 0) ? 0 : num;
  }

  // Debug: Send arbitrary command and return result (for console experimentation)
  async debug(cmd) {
    console.log(`[Debug] Sending: ${cmd}`);
    const result = await this.sendCommand(cmd, 2000);
    console.log(`[Debug] Result: ${result}`);
    return result;
  }

  // Debug: List all attributes of a module
  async debugDir(moduleName) {
    const result = await this.sendCommand(`dir(${moduleName})`, 2000);
    console.log(`[Debug] dir(${moduleName}):`, result);
    return result;
  }

  // ========================================
  // Config.json read/write methods
  // ========================================

  // Read config.json from device and return parsed object
  async readConfigJson() {
    if (this.state !== ConnectionState.CONNECTED || !this.port) {
      throw new Error('Not connected');
    }

    console.log('[WebSerial] Reading config.json from device...');

    // Import required modules
    await this.sendCommand('import json', 500);

    // Read the config file
    await this.sendCommand('_f = open("/fat/config.json", "r")', 500);
    const loadResult = await this.sendCommand('_config_data = json.load(_f)', 1000);
    await this.sendCommand('_f.close()', 500);

    // Check if json.load failed
    if (loadResult.includes('Error') || loadResult.includes('Traceback')) {
      console.error('[WebSerial] Failed to load config.json:', loadResult);
      // Clean up
      await this.sendCommand('del _f', 500);
      throw new Error('Invalid JSON in config.json on device. The file may be corrupted. Check the file manually or restore from backup.');
    }

    // Get the JSON as a string - need longer timeout for large configs
    const jsonOutput = await this.sendCommand('print(json.dumps(_config_data))', 5000);

    // Clean up temporary variables
    try {
      await this.sendCommand('del _f, _config_data', 500);
    } catch {
      // Ignore cleanup errors
    }

    console.log('[WebSerial] Raw config JSON:', jsonOutput);

    // Check for errors in the output
    if (jsonOutput.includes('Error') || jsonOutput.includes('Traceback')) {
      console.error('[WebSerial] Error reading config:', jsonOutput);
      throw new Error('Failed to read config.json from device');
    }

    try {
      // Parse the JSON response
      // The output might have extra whitespace or newlines
      const cleaned = jsonOutput.trim();
      const config = JSON.parse(cleaned);
      console.log('[WebSerial] Parsed config:', config);
      return config;
    } catch (err) {
      console.error('[WebSerial] Failed to parse config JSON:', err);
      throw new Error('Failed to parse config.json from device. The file may be corrupted.');
    }
  }

  // Write config.json to device (with pretty-print formatting)
  // onProgress callback receives (current, total, status) for UI updates
  async writeConfigJson(config, onProgress = null) {
    if (this.state !== ConnectionState.CONNECTED || !this.port) {
      throw new Error('Not connected');
    }

    console.log('[WebSerial] Writing config.json to device...');

    // Convert config to pretty-printed JSON string (2 space indent)
    const jsonStr = JSON.stringify(config, null, 2);
    const lines = jsonStr.split('\n');
    const totalSteps = lines.length + 5; // lines + open/close/sync/examine/del
    let currentStep = 0;

    console.log('[WebSerial] JSON length:', jsonStr.length, 'lines:', lines.length);

    const updateProgress = (status) => {
      if (onProgress) {
        onProgress(currentStep, totalSteps, status);
      }
    };

    // Use normal REPL mode, sending commands one at a time
    // This is slower but more reliable than raw REPL for large data

    // Import and open file
    updateProgress('opening file...');
    await this.sendCommand('import os', 300);
    await this.sendCommand('_f = open("/fat/config.json", "w")', 300);
    currentStep++;

    // Write each line separately
    for (let i = 0; i < lines.length; i++) {
      // Escape for Python: backslashes and single quotes
      const escapedLine = lines[i]
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");

      // Add newline for all lines except the last
      if (i < lines.length - 1) {
        await this.sendCommand(`_f.write('${escapedLine}\\n')`, 200);
      } else {
        await this.sendCommand(`_f.write('${escapedLine}')`, 200);
      }

      currentStep++;
      updateProgress(`writing line ${i + 1}/${lines.length}...`);
    }

    console.log('[WebSerial] Closing file and syncing...');

    // Close, sync, and reload
    updateProgress('closing file...');
    await this.sendCommand('_f.close()', 300);
    currentStep++;

    updateProgress('syncing to disk...');
    await this.sendCommand('os.sync()', 500);
    currentStep++;

    updateProgress('reloading config...');
    await this.sendCommand('import teenage', 300);
    await this.sendCommand('teenage.examine_drive(False)', 1000);
    currentStep++;

    await this.sendCommand('del _f', 300);
    currentStep++;
    updateProgress('done!');

    console.log('[WebSerial] Config.json written and reloaded successfully');
    return true;
  }

  // Convert app preset format to device config format
  presetToDeviceFormat(preset, _slotIndex) {
    if (!preset) return null;

    const devicePreset = {
      name: preset.name || '',
      comment: preset.comment || '',
      list: preset.list.map(effect => {
        const deviceEffect = { effect: effect.effect };
        // Copy all parameters except internal ones
        Object.keys(effect).forEach(key => {
          if (key !== 'effect' && !key.startsWith('_')) {
            deviceEffect[key] = effect[key];
          }
        });
        return deviceEffect;
      })
    };

    // Add modulation settings if present
    if (preset.handle) {
      devicePreset.handle = { ...preset.handle };
    }
    if (preset.shake) {
      devicePreset.shake = { ...preset.shake };
    }
    if (preset.lfo) {
      devicePreset.lfo = { ...preset.lfo };
    }
    if (preset.trigger) {
      devicePreset.trigger = { ...preset.trigger };
    }

    return devicePreset;
  }

  // Convert device config preset to app format
  devicePresetToAppFormat(devicePreset) {
    if (!devicePreset) return null;

    return {
      name: devicePreset.name || '',
      comment: devicePreset.comment || '',
      list: devicePreset.list || [],
      handle: devicePreset.handle || null,
      shake: devicePreset.shake || null,
      lfo: devicePreset.lfo || null,
      trigger: devicePreset.trigger || null
    };
  }
}

// Singleton instance
export const tingUSB = new TingUSB();

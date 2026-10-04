// Shared 24 kHz PCM bus: one microphone floor, one DM, all players hear the same turn.
export class TableAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private finishCaptureCallback: (() => void) | null = null;
  private scheduled = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private capturing = false;
  async enable(onChunk: (data: string) => void) {
    if (!window.isSecureContext)
      throw new Error("Microphone access needs HTTPS or localhost.");
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("This browser does not support microphone access.");
    try {
      this.context = new AudioContext({ sampleRate: 24000 });
      await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      await this.context.audioWorklet.addModule("/pcm-worklet.js");
      this.worklet = new AudioWorkletNode(this.context, "pcm-capture");
      this.worklet.port.onmessage = (
        event: MessageEvent<ArrayBuffer | { type: string }>,
      ) => {
        if (!(event.data instanceof ArrayBuffer)) {
          if (event.data.type === "capture-ended")
            this.finishCaptureCallback?.();
          return;
        }
        if (!this.capturing) return;
        const bytes = new Uint8Array(event.data);
        let raw = "";
        for (const byte of bytes) raw += String.fromCharCode(byte);
        onChunk(btoa(raw));
      };
      const source = this.context.createMediaStreamSource(this.stream);
      source.connect(this.worklet);
      const silent = this.context.createGain();
      silent.gain.value = 0;
      this.worklet.connect(silent);
      silent.connect(this.context.destination);
    } catch (error) {
      this.close();
      throw error;
    }
  }
  async finishCapture() {
    if (!this.worklet || !this.capturing) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.finishCaptureCallback = null;
        resolve();
      }, 250);
      this.finishCaptureCallback = () => {
        clearTimeout(timer);
        this.finishCaptureCallback = null;
        resolve();
      };
      this.worklet!.port.postMessage({ capturing: false });
    });
    this.capturing = false;
  }
  async unlock() {
    await this.context?.resume();
  }
  setCapturing(value: boolean) {
    this.capturing = value;
    this.worklet?.port.postMessage({ capturing: value });
  }
  play(data: string) {
    const context = this.context;
    if (!context) return;
    const decoded = atob(data);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    const pcm = new DataView(bytes.buffer);
    const buffer = context.createBuffer(1, bytes.length / 2, 24000);
    const floats = buffer.getChannelData(0);
    for (let i = 0; i < floats.length; i++)
      floats[i] = pcm.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.scheduled = Math.max(context.currentTime + 0.06, this.scheduled);
    source.start(this.scheduled);
    this.scheduled += buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }
  clear() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
    this.scheduled = 0;
  }
  close() {
    this.setCapturing(false);
    this.clear();
    this.worklet?.disconnect();
    this.worklet = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    void this.context?.close();
    this.context = null;
  }
}

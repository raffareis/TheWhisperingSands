// Each channel owns its PCM resources. Listening never asks for microphone access.
export class TableAudio {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private silent: GainNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private finishCaptureCallback: (() => void) | null = null;
  private finishPromise: Promise<void> | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduled = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private capturing = false;
  private generation = 0;

  async enableListening() {
    const generation = this.generation;
    const context = this.context ?? new AudioContext({ sampleRate: 24000 });
    this.context = context;
    try {
      await context.resume();
      if (this.generation !== generation || this.context !== context)
        throw new Error("Audio was closed. Enable it again to listen.");
      if (context.sampleRate !== 24000)
        throw new Error(
          "This browser cannot play the table audio. Please use another browser.",
        );
    } catch (error) {
      if (this.generation === generation) this.close();
      throw error;
    }
  }
  async enable(onChunk: (data: string) => void) {
    if (!window.isSecureContext)
      throw new Error("Microphone access needs HTTPS or localhost.");
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("This browser does not support microphone access.");
    const generation = this.generation;
    try {
      await this.enableListening();
      if (this.worklet) return;
      const context = this.context!;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (this.generation !== generation) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error("Audio was closed. Enable it again to speak.");
      }
      this.stream = stream;
      await context.audioWorklet.addModule("/pcm-worklet.js");
      if (this.generation !== generation)
        throw new Error("Audio was closed. Enable it again to speak.");
      this.worklet = new AudioWorkletNode(context, "pcm-capture");
      this.worklet.port.onmessage = (
        event: MessageEvent<ArrayBuffer | { type: string }>,
      ) => {
        if (!(event.data instanceof ArrayBuffer)) {
          if (event.data.type === "capture-ended")
            this.finishCaptureCallback?.();
          return;
        }
        if (!this.capturing || this.generation !== generation) return;
        let raw = "";
        for (const byte of new Uint8Array(event.data))
          raw += String.fromCharCode(byte);
        onChunk(btoa(raw));
      };
      this.microphone = context.createMediaStreamSource(stream);
      this.microphone.connect(this.worklet);
      this.silent = context.createGain();
      this.silent.gain.value = 0;
      this.worklet.connect(this.silent);
      this.silent.connect(context.destination);
    } catch (error) {
      if (this.generation === generation) this.close();
      throw error;
    }
  }
  async finishCapture() {
    if (this.finishPromise) return this.finishPromise;
    if (!this.worklet || !this.capturing) return;
    const generation = this.generation;
    this.finishPromise = new Promise<void>((resolve) => {
      this.finishCaptureCallback = () => {
        if (this.finishTimer) clearTimeout(this.finishTimer);
        this.finishTimer = null;
        this.finishCaptureCallback = null;
        resolve();
      };
      this.finishTimer = setTimeout(() => this.finishCaptureCallback?.(), 250);
      this.worklet!.port.postMessage({ capturing: false });
    });
    const completion = this.finishPromise;
    await completion;
    if (this.generation === generation) this.capturing = false;
    if (this.finishPromise === completion) this.finishPromise = null;
  }
  async unlock() {
    await this.context?.resume();
  }
  setCapturing(value: boolean) {
    this.capturing = value && !!this.worklet;
    this.worklet?.port.postMessage({ capturing: this.capturing });
  }
  play(data: string) {
    const context = this.context;
    if (!context || context.state === "closed") return;
    const decoded = atob(data);
    if (!decoded.length || decoded.length % 2) return;
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
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
    };
  }
  clear() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    this.sources.clear();
    this.scheduled = 0;
  }
  close() {
    this.generation++;
    this.setCapturing(false);
    this.finishCaptureCallback?.();
    this.finishPromise = null;
    this.clear();
    this.microphone?.disconnect();
    this.microphone = null;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.port.close();
      this.worklet.disconnect();
    }
    this.worklet = null;
    this.silent?.disconnect();
    this.silent = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
}

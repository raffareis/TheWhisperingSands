class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.buffer = new Int16Array(2400);
    this.offset = 0;
    this.port.onmessage = ({ data }) => {
      if (!data.capturing && this.active) {
        if (this.offset) {
          const bytes = this.buffer.slice(0, this.offset).buffer;
          this.port.postMessage(bytes, [bytes]);
        }
        this.port.postMessage({ type: "capture-ended" });
      }
      this.active = !!data.capturing;
      this.offset = 0;
    };
    // AudioContext is explicitly 24 kHz, which is the server and Realtime format.
  }
  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      this.buffer[this.offset++] = sample < 0 ? sample * 32768 : sample * 32767;
      if (this.offset === this.buffer.length) {
        const bytes = this.buffer.buffer;
        this.port.postMessage(bytes, [bytes]);
        this.buffer = new Int16Array(2400);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PCMCapture);

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
test("microphone PCM sends complete 100 ms frames and flushes the final partial frame", () => {
  const emitted: unknown[] = [];
  let Processor: any;
  class Base {
    port = {
      onmessage: null as
        ((event: { data: { capturing: boolean } }) => void) | null,
      postMessage: (value: unknown) => emitted.push(value),
    };
  }
  runInNewContext(readFileSync("public/pcm-worklet.js", "utf8"), {
    AudioWorkletProcessor: Base,
    Int16Array,
    registerProcessor: (_name: string, value: unknown) => {
      Processor = value;
    },
  });
  const worklet = new Processor();
  worklet.port.onmessage({ data: { capturing: true } });
  worklet.process([[new Float32Array(2400).fill(0.5)]]);
  assert.equal((emitted[0] as ArrayBuffer).byteLength, 4800);
  worklet.process([[new Float32Array(257).fill(-0.5)]]);
  worklet.port.onmessage({ data: { capturing: false } });
  assert.equal((emitted[1] as ArrayBuffer).byteLength, 514);
  assert.deepEqual(JSON.parse(JSON.stringify(emitted[2])), {
    type: "capture-ended",
  });
  assert.equal(new Int16Array(emitted[0] as ArrayBuffer)[0], 16383);
  assert.equal(new Int16Array(emitted[1] as ArrayBuffer)[0], -16384);
  worklet.process([[new Float32Array(2400)]]);
  assert.equal(emitted.length, 3);
});

import { TableAudio } from "../src/audio";
import type { TestContext } from "node:test";

function browserAudio(t: TestContext) {
  const contexts: FakeContext[] = [];
  const worklets: FakeWorklet[] = [];
  let micRequests = 0;
  let tracksStopped = 0;
  let allowMicrophone = async () => ({
    getTracks: () => [
      {
        stop: () => {
          tracksStopped++;
        },
      },
    ],
  });
  class FakeContext {
    sampleRate = 24000;
    state = "running";
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    constructor() {
      contexts.push(this);
    }
    async resume() {}
    async close() {
      this.state = "closed";
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
  }
  class FakeWorklet {
    commands: { capturing: boolean }[] = [];
    disconnected = false;
    portClosed = false;
    port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: { capturing: boolean }) => {
        this.commands.push(message);
      },
      close: () => {
        this.portClosed = true;
      },
    };
    constructor() {
      worklets.push(this);
    }
    connect() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const globals = {
    window: { isSecureContext: true },
    navigator: {
      mediaDevices: {
        getUserMedia: async () => {
          micRequests++;
          return allowMicrophone();
        },
      },
    },
    AudioContext: FakeContext,
    AudioWorkletNode: FakeWorklet,
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return {
    contexts,
    worklets,
    get micRequests() {
      return micRequests;
    },
    get tracksStopped() {
      return tracksStopped;
    },
    deferMicrophone() {
      let resolve!: (stream: {
        getTracks: () => { stop: () => void }[];
      }) => void;
      allowMicrophone = () =>
        new Promise((done) => {
          resolve = done;
        });
      return () =>
        resolve({
          getTracks: () => [
            {
              stop: () => {
                tracksStopped++;
              },
            },
          ],
        });
    },
  };
}

test("companion listening unlocks audio without requesting a microphone and reuses the context", async (t) => {
  const browser = browserAudio(t);
  const audio = new TableAudio();
  await audio.enableListening();
  await audio.enableListening();
  assert.equal(browser.micRequests, 0);
  assert.equal(browser.contexts.length, 1);
  await audio.enable(() => {});
  assert.equal(browser.micRequests, 1);
  assert.equal(browser.contexts.length, 1);
  audio.close();
  assert.equal(browser.tracksStopped, 1);
  assert.equal(browser.contexts[0].state, "closed");
  assert.equal(browser.worklets[0].portClosed, true);
  assert.equal(browser.worklets[0].disconnected, true);
});

test("closing during microphone permission stops the late stream and does not reopen audio", async (t) => {
  const browser = browserAudio(t);
  const grant = browser.deferMicrophone();
  const audio = new TableAudio();
  const enabling = audio.enable(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(browser.micRequests, 1);
  audio.close();
  grant();
  await assert.rejects(enabling, /Audio was closed/);
  assert.equal(browser.tracksStopped, 1);
  assert.equal(browser.worklets.length, 0);
  assert.equal(browser.contexts[0].state, "closed");
  await audio.enableListening();
  assert.equal(browser.contexts.length, 2);
  audio.close();
});

test("finishing a turn transmits its final PCM before completion and ignores later frames", async (t) => {
  const browser = browserAudio(t);
  const audio = new TableAudio();
  const sent: string[] = [];
  await audio.enable((chunk) => sent.push(chunk));
  audio.setCapturing(true);
  const finished = audio.finishCapture();
  const worklet = browser.worklets[0];
  assert.deepEqual(worklet.commands.at(-1), { capturing: false });
  worklet.port.onmessage!({ data: new Int16Array([120, -120]).buffer });
  worklet.port.onmessage!({ data: { type: "capture-ended" } });
  await finished;
  assert.equal(sent.length, 1);
  assert.equal(Buffer.from(sent[0], "base64").byteLength, 4);
  worklet.port.onmessage!({ data: new Int16Array([500]).buffer });
  assert.equal(sent.length, 1);
  audio.close();
});

test("closing audio settles a pending flush and releases all microphone resources", async (t) => {
  const browser = browserAudio(t);
  const audio = new TableAudio();
  await audio.enable(() => {});
  audio.setCapturing(true);
  const finished = audio.finishCapture();
  audio.close();
  await finished;
  assert.equal(browser.tracksStopped, 1);
  assert.equal(browser.contexts[0].state, "closed");
  assert.equal(browser.worklets[0].port.onmessage, null);
});

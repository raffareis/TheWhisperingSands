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

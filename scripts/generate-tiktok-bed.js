// Procedural audio bed for the tiktok video when no music asset is shipped
// (assets/tiktok-bed.*, --bed, or TIKTOK_AUDIO_BED). Renders a WAV: Am-F-C-G
// pad progression at 96bpm + quarter-note bass pulse + offbeat noise hats +
// a sparse chord-tone pluck, so the video gets music, not a sine drone.
//
// Usage: node scripts/generate-tiktok-bed.js <out.wav> [seconds]
const fs = require('fs')

const out = process.argv[2]
const DUR = Math.max(4, Number(process.argv[3]) || 30)
if (!out) { console.error('usage: node generate-tiktok-bed.js <out.wav> [seconds]'); process.exit(1) }

const SR = 44100
const BPM = 96
const BEAT = 60 / BPM
const CHORD_BEATS = 4
const CHORD_DUR = BEAT * CHORD_BEATS
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12)

// vi-VI-III-VII in A minor: [bass root, pad voicing]
const PROG = [
  { root: 33, chord: [57, 60, 64, 69] }, // Am
  { root: 29, chord: [57, 60, 65, 69] }, // F
  { root: 36, chord: [55, 60, 64, 67] }, // C
  { root: 31, chord: [55, 59, 62, 67] }, // G
]

const n = Math.ceil(DUR * SR)
const L = new Float64Array(n)
const R = new Float64Array(n)

// Deterministic noise (LCG) for hats — no Math.random so renders are stable.
let seed = 0x9e3779b9
const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32) * 2 - 1 }

const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c) }

// Pad: detuned partial stack per chord tone, crossfaded between chords.
function pad(freqs, t0, segLen) {
  const start = Math.floor(t0 * SR)
  const len = Math.floor((segLen + 0.5) * SR) // release tail into next chord
  for (let i = 0; i < len && start + i < n; i++) {
    const t = i / SR
    const env = smooth(t / 0.6) * (1 - smooth((t - segLen + 0.3) / 0.7))
    let sl = 0, sr = 0
    for (let v = 0; v < freqs.length; v++) {
      const f = freqs[v]
      const w = i2f(i)
      const o =
        Math.sin(2 * Math.PI * f * t) * 0.55 +
        Math.sin(2 * Math.PI * f * 1.0019 * t + 1.3) * 0.35 +
        Math.sin(2 * Math.PI * f * 2 * t + w) * 0.16 +
        Math.sin(2 * Math.PI * f * 3 * t) * 0.07
      const pan = (v / (freqs.length - 1) - 0.5) * 0.7
      sl += o * Math.sqrt((1 - pan) / 2)
      sr += o * Math.sqrt((1 + pan) / 2)
    }
    const g = env * 0.11
    L[start + i] += sl * g
    R[start + i] += sr * g
  }
}
// Slow phase wobble so partials don't phase-lock into an organ tone.
const i2f = (i) => Math.sin((i / SR) * 0.4) * 0.5

// Bass: root note pulse each beat, quick decay — reads as rhythm, not drone.
function bass(freq, t0, segLen) {
  const beats = Math.ceil(segLen / BEAT)
  for (let b = 0; b < beats; b++) {
    const start = Math.floor((t0 + b * BEAT) * SR)
    const len = Math.floor(BEAT * 0.9 * SR)
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR
      const env = Math.exp(-t * 7)
      const o = Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3
      L[start + i] += o * env * 0.2
      R[start + i] += o * env * 0.2
    }
  }
}

// Hats: dark-filtered noise ticks on the offbeat.
let hatL = 0, hatR = 0
function hats(t0, segLen) {
  const eighths = Math.ceil((segLen / BEAT) * 2)
  for (let e = 0; e < eighths; e++) {
    if (e % 2 === 0) continue
    const start = Math.floor((t0 + (e * BEAT) / 2) * SR)
    const len = Math.floor(0.09 * SR)
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR
      hatL += 0.25 * (noise() - hatL)
      hatR += 0.25 * (noise() - hatR)
      const g = Math.exp(-t * 55) * 0.05
      L[start + i] += hatL * g
      R[start + i] += hatR * g
    }
  }
}

// Pluck: one chord tone two octaves up per beat, cycling — the melody hint.
function pluck(chord, t0, segLen) {
  const beats = Math.ceil(segLen / BEAT)
  for (let b = 0; b < beats; b++) {
    if (b % 2 === 1) continue
    const f = mtof(chord[(b / 2) % chord.length] + 12)
    const start = Math.floor((t0 + b * BEAT + BEAT * 0.5) * SR)
    const len = Math.floor(0.35 * SR)
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR
      const env = Math.exp(-t * 12)
      const o = Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 3 * t) * 0.15
      L[start + i] += o * env * 0.05
      R[start + i] += o * env * 0.05
    }
  }
}

const chords = Math.ceil(DUR / CHORD_DUR)
for (let c = 0; c < chords; c++) {
  const { root, chord } = PROG[c % PROG.length]
  const t0 = c * CHORD_DUR
  const seg = Math.min(CHORD_DUR, DUR - t0)
  pad(chord.map(mtof), t0, seg)
  bass(mtof(root), t0, seg)
  hats(t0, seg)
  pluck(chord, t0, seg)
}

// Peak-normalize + soft-clip guard, then write 16-bit stereo WAV.
let peak = 0
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
const gain = peak > 0 ? 0.6 / peak : 1
const pcm = Buffer.alloc(44 + n * 4)
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVEfmt ', 8)
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22)
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34)
pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40)
for (let i = 0; i < n; i++) {
  pcm.writeInt16LE(Math.round(Math.tanh(L[i] * gain) * 32767), 44 + i * 4)
  pcm.writeInt16LE(Math.round(Math.tanh(R[i] * gain) * 32767), 46 + i * 4)
}
fs.writeFileSync(out, pcm)
console.log(`bed -> ${out} (${DUR.toFixed(1)}s)`)

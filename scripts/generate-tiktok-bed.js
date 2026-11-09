// Procedural audio bed for the tiktok video when no music asset is shipped
// (assets/tiktok-bed.*, --bed, or TIKTOK_AUDIO_BED). Renders a WAV: a chord-
// progression pad + bass pulse + noise hats + a sparse pluck, so the video
// gets music, not a sine drone. Style/key/tempo rotate daily — the out path
// (which embeds {date}-{provider}-{kind}) seeds the pick, so each run's bed
// differs but stays reproducible for a given video.
//
// Usage: node scripts/generate-tiktok-bed.js <out.wav> [seconds]
const fs = require('fs')

const out = process.argv[2]
const DUR = Math.max(4, Number(process.argv[3]) || 30)
if (!out) { console.error('usage: node generate-tiktok-bed.js <out.wav> [seconds]'); process.exit(1) }

// FNV-1a of the out path — date+provider in the filename drive the rotation.
let h = 0x811c9dc5
for (const c of out) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0 }

// Chords: [bass root midi, pad voicing]. Voicings stay in the C4-B4 region.
const PROGS = {
  minorPop: [[33, [57, 60, 64, 69]], [29, [57, 60, 65, 69]], [36, [55, 60, 64, 67]], [31, [55, 59, 62, 67]]], // Am F C G
  drive:    [[33, [57, 60, 64]], [31, [55, 59, 62]], [29, [53, 57, 60]], [31, [55, 59, 62]]],              // Am G F G
  majorPop: [[36, [60, 64, 67]], [31, [59, 62, 67]], [33, [57, 60, 64]], [29, [57, 60, 65]]],             // C G Am F
  darkMin:  [[33, [57, 60, 64]], [38, [62, 65, 69]], [29, [53, 57, 60]], [28, [52, 55, 59]]],             // Am Dm F Em
}

// Masks: which eighth-index e gets a hat, which beat-index b gets bass/pluck.
const STYLES = [
  { name: 'dusk',  bpm: 96,  prog: 'minorPop', padOct: 0,   bassEvery: 1, hat: (e) => e % 2 === 1,  pluck: (b) => b % 2 === 0, bright: 1 },
  { name: 'drive', bpm: 112, prog: 'drive',    padOct: 0,   bassEvery: 2, hat: () => true,          pluck: (b) => b % 4 === 3, bright: 1.4 },
  { name: 'air',   bpm: 80,  prog: 'majorPop', padOct: 12,  bassEvery: 1, hat: (e) => e % 4 === 3,  pluck: () => true,         bright: 1.6 },
  { name: 'night', bpm: 76,  prog: 'darkMin',  padOct: -12, bassEvery: 2, hat: (e) => e % 4 === 1,  pluck: (b) => b % 4 === 2, bright: 0.7 },
]

const STYLE = STYLES[h % STYLES.length]
const TRANSPOSE = [-3, -2, 0, 0, 2, 3][h % 6] // bias toward home key
const BPM = STYLE.bpm + (h % 7) - 3 // ±3 jitter
const BEAT = 60 / BPM
const CHORD_DUR = BEAT * 4
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12)

const SR = 44100
const n = Math.ceil(DUR * SR)
const L = new Float64Array(n)
const R = new Float64Array(n)

let seed = h || 1
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 2 ** 32) * 2 - 1 }
const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c) }
const i2f = (i) => Math.sin((i / SR) * 0.4) * 0.5 // detunes partials against organ lock

function pad(freqs, t0, segLen) {
  const start = Math.floor(t0 * SR)
  const len = Math.floor((segLen + 0.5) * SR)
  const hi = 0.16 * STYLE.bright
  for (let i = 0; i < len && start + i < n; i++) {
    const t = i / SR
    const env = smooth(t / 0.6) * (1 - smooth((t - segLen + 0.3) / 0.7))
    let sl = 0, sr = 0
    for (let v = 0; v < freqs.length; v++) {
      const f = freqs[v]
      const o =
        Math.sin(2 * Math.PI * f * t) * 0.55 +
        Math.sin(2 * Math.PI * f * 1.0019 * t + 1.3) * 0.35 +
        Math.sin(2 * Math.PI * f * 2 * t + i2f(i)) * hi +
        Math.sin(2 * Math.PI * f * 3 * t) * hi * 0.4
      const pan = (v / (freqs.length - 1) - 0.5) * 0.7
      sl += o * Math.sqrt((1 - pan) / 2)
      sr += o * Math.sqrt((1 + pan) / 2)
    }
    const g = env * 0.11
    L[start + i] += sl * g
    R[start + i] += sr * g
  }
}

function bass(freq, t0, segLen) {
  const hits = Math.ceil(segLen / (BEAT * STYLE.bassEvery))
  for (let b = 0; b < hits; b++) {
    const start = Math.floor((t0 + b * BEAT * STYLE.bassEvery) * SR)
    const len = Math.floor(BEAT * 0.9 * SR)
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SR
      const env = Math.exp(-t * (STYLE.bassEvery > 1 ? 10 : 7))
      const o = Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 2 * t) * 0.3
      L[start + i] += o * env * 0.2
      R[start + i] += o * env * 0.2
    }
  }
}

let hatL = 0, hatR = 0
function hats(t0, segLen) {
  const eighths = Math.ceil((segLen / BEAT) * 2)
  for (let e = 0; e < eighths; e++) {
    if (!STYLE.hat(e)) continue
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

function pluck(chord, t0, segLen) {
  const beats = Math.ceil(segLen / BEAT)
  for (let b = 0; b < beats; b++) {
    if (!STYLE.pluck(b)) continue
    const f = mtof(chord[Math.floor(b / 2) % chord.length] + 12 + TRANSPOSE + STYLE.padOct)
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

const prog = PROGS[STYLE.prog]
const chords = Math.ceil(DUR / CHORD_DUR)
for (let c = 0; c < chords; c++) {
  const [rootMidi, voicing] = prog[c % prog.length]
  const t0 = c * CHORD_DUR
  const seg = Math.min(CHORD_DUR, DUR - t0)
  pad(voicing.map((m) => mtof(m + TRANSPOSE + STYLE.padOct)), t0, seg)
  bass(mtof(rootMidi + TRANSPOSE), t0, seg)
  hats(t0, seg)
  pluck(voicing, t0, seg)
}

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
console.log(`bed -> ${out} (${DUR.toFixed(1)}s, ${STYLE.name}${TRANSPOSE ? `${TRANSPOSE > 0 ? '+' : ''}${TRANSPOSE}st` : ''} @${BPM}bpm)`)

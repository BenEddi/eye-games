<template>
  <div class="wrapper">
    <!-- Fullscreen game canvas (video is under it, handled by WebGazer) -->
    <canvas
      ref="canvas"
      class="game-canvas"
      @click="handleCanvasClick"
    ></canvas>

    <!-- Instructions -->
    <div v-if="text" class="prompt">{{ text }}</div>

    <!-- Start -->
    <button
      v-if="phase === 'idle'"
      class="start"
      @click="startTest"
    >
      Start Test ▶️
    </button>

    <!-- Results -->
    <div v-if="phase === 'done'" class="results">
      <h2>Results</h2>
      <ul>
        <li><b>Calibration:</b> {{ results.calibration ? "OK" : "Weak" }}</li>
        <li><b>Fixation:</b> {{ results.fixation ? "OK" : "Fail" }}</li>
        <li><b>Smooth Pursuit:</b> {{ results.pursuit ? "OK" : "Fail" }}</li>
        <li><b>Saccades:</b> {{ results.saccade ? "OK" : "Fail" }}</li>
      </ul>
      <button class="start" @click="reset">Replay 🔁</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue"
import { loadWebGazer } from "../lib/webgazer-loader"

let wg = null

const phase = ref("idle") // idle | calibration | fixation | pursuit | saccade | done
const text = ref("")
const results = ref({
  calibration: false,
  fixation: false,
  pursuit: false,
  saccade: false,
})

const gazeX = ref(null)
const gazeY = ref(null)

const canvas = ref(null)
let ctx = null
let interval = null

// calibration points as fractions of screen (center + 4 corners-ish)
const calibPoints = [
  { x: 0.5, y: 0.5 },
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.2, y: 0.8 },
  { x: 0.8, y: 0.8 },
]
let calibIndex = 0
let calibClicks = 0

/* -------------------- INIT -------------------- */
onMounted(async () => {
  wg = await loadWebGazer()

  wg.setGazeListener((data) => {
    if (!data) return
    // WebGazer gives screen coords already (page X/Y)
    gazeX.value = data.x
    gazeY.value = data.y
  })

  // Show webcam in WebGazer's own container
  wg.showVideoPreview(true)
  wg.showPredictionPoints(false)
  wg.showFaceOverlay(false)
  wg.showFaceFeedbackBox(false)

  wg.begin()

  // Canvas setup
  const cnv = canvas.value
  resizeCanvas()
  ctx = cnv.getContext("2d")

  window.addEventListener("resize", resizeCanvas)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
  if (wg) wg.end()
  window.removeEventListener("resize", resizeCanvas)
})

function resizeCanvas() {
  const cnv = canvas.value
  if (!cnv) return
  cnv.width = window.innerWidth
  cnv.height = window.innerHeight
}

/* -------------------- GENERAL DRAWING -------------------- */
function clearScreen() {
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
}

function drawDot(x, y, radius = 18, color = "#00eaff") {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

/* -------------------- CALIBRATION -------------------- */

function startTest() {
  phase.value = "calibration"
  text.value =
    "Calibration: look at the dot and CLICK ON IT each time it moves (5 times)."
  results.value = {
    calibration: false,
    fixation: false,
    pursuit: false,
    saccade: false,
  }
  calibIndex = 0
  calibClicks = 0
  runCalibrationStep()
}

function runCalibrationStep() {
  clearScreen()
  const p = calibPoints[calibIndex]
  const x = canvas.value.width * p.x
  const y = canvas.value.height * p.y
  drawDot(x, y, 20, "#ffdf00")
}

function handleCanvasClick(event) {
  if (!wg) return

  // WebGazer calibration: record where the user clicked
  wg.recordScreenPosition(event.clientX, event.clientY, "click")
  calibClicks++

  if (phase.value === "calibration") {
    if (calibClicks >= 5) {
      results.value.calibration = true
      startFixation()
    } else {
      calibIndex = (calibIndex + 1) % calibPoints.length
      runCalibrationStep()
    }
  }
}

/* -------------------- FIXATION -------------------- */
function startFixation() {
  phase.value = "fixation"
  text.value = "Fixation: keep your eyes on the center dot."
  clearScreen()
  drawDot(canvas.value.width / 2, canvas.value.height / 2)

  let stable = 0
  let total = 0

  interval = setInterval(() => {
    if (gazeX.value != null && gazeY.value != null) {
      const dx = Math.abs(gazeX.value - canvas.value.width / 2)
      const dy = Math.abs(gazeY.value - canvas.value.height / 2)
      if (dx < 170 && dy < 170) stable++
      total++
    }
  }, 100)

  setTimeout(() => {
    clearInterval(interval)
    // quite forgiving – just need ~30% of frames close
    results.value.fixation = total > 0 && stable / total > 0.3
    startPursuit()
  }, 4000)
}

/* -------------------- PURSUIT -------------------- */
function startPursuit() {
  phase.value = "pursuit"
  text.value = "Smooth Pursuit: follow the moving dot with your eyes."
  clearScreen()

  let t = 0
  let hits = 0
  let total = 0

  interval = setInterval(() => {
    t += 0.05
    const amplitude = canvas.value.width * 0.3
    const x = canvas.value.width / 2 + Math.sin(t) * amplitude
    const y = canvas.value.height / 2

    clearScreen()
    drawDot(x, y)

    if (gazeX.value != null && gazeY.value != null) {
      const dx = Math.abs(gazeX.value - x)
      const dy = Math.abs(gazeY.value - y)
      if (dx < 200 && dy < 200) hits++
      total++
    }
  }, 40)

  setTimeout(() => {
    clearInterval(interval)
    results.value.pursuit = total > 0 && hits / total > 0.25
    startSaccade()
  }, 5500)
}

/* -------------------- SACCADE -------------------- */
function startSaccade() {
  phase.value = "saccade"
  text.value = "Saccades: look left ↔ right quickly as the dot jumps."
  clearScreen()

  let leftHits = 0
  let rightHits = 0
  let toggle = false

  interval = setInterval(() => {
    toggle = !toggle

    const leftX = canvas.value.width * 0.2
    const rightX = canvas.value.width * 0.8
    const y = canvas.value.height / 2
    const targetX = toggle ? leftX : rightX

    clearScreen()
    drawDot(targetX, y)

    if (gazeX.value != null) {
      const isLeftSide = gazeX.value < canvas.value.width / 2
      if (toggle && isLeftSide) leftHits++
      if (!toggle && !isLeftSide) rightHits++
    }
  }, 700)

  setTimeout(() => {
    clearInterval(interval)
    // super forgiving: at least one hit left & right
    results.value.saccade = leftHits >= 1 && rightHits >= 1
    phase.value = "done"
    text.value = ""
    clearScreen()
  }, 4500)
}

/* -------------------- RESET -------------------- */
function reset() {
  if (interval) clearInterval(interval)
  phase.value = "idle"
  text.value = ""
  clearScreen()
}
</script>

<style scoped>
.wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
}

/* fullscreen canvas on top */
.game-canvas {
  position: absolute;
  inset: 0;
  z-index: 2;
}

/* UI */
.prompt {
  position: absolute;
  top: 10%;
  width: 100%;
  text-align: center;
  font-size: 1.4rem;
  color: #00eaff;
  text-shadow: 0 0 8px #000;
  z-index: 3;
}

.start {
  position: absolute;
  bottom: 10%;
  left: 50%;
  transform: translateX(-50%);
  background: #00a8caff;
  padding: 12px 26px;
  border-radius: 12px;
  border: none;
  color: #fff;
  font-size: 1.1rem;
  z-index: 3;
  cursor: pointer;
}

.results {
  position: absolute;
  bottom: 6%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  padding: 18px 24px;
  border-radius: 14px;
  color: #fff;
  font-size: 1rem;
  width: 340px;
  z-index: 3;
}
.results h2 {
  margin-top: 0;
  text-align: center;
}
.results ul {
  padding-left: 18px;
}

/* ---- GLOBAL OVERRIDES FOR WEBAZER ----- */
:global(#webgazerVideoContainer) {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 1 !important;
  pointer-events: none !important;
}

:global(#webgazerVideoFeed) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  transform: scaleX(-1) !important; /* mirror selfie */
}

/* hide WebGazer debug canvases */
:global(#webgazerVideoCanvas),
:global(#webgazerFaceOverlay),
:global(#webgazerFaceFeedbackBox) {
  display: none !important;
}
</style>

<template>
  <div class="wrapper">
    <!-- Stepper + countdown (visible during tests) -->
    <div
      v-if="phase !== 'idle' && phase !== 'done'"
      class="stepper"
    >
      <div
        v-for="s in steps"
        :key="s.id"
        :class="['step', { active: phase === s.id }]"
      >
        <span class="step-index">{{ s.index }}</span>
        <span class="step-label">{{ s.label }}</span>
      </div>

      <div v-if="countdown > 0" class="countdown">
        ⏱ {{ countdown }}s
      </div>
    </div>

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

      <div class="overall">
        Overall score: <span>{{ overallScore }}%</span>
      </div>

      <ul class="results-list">
        <li>
          <div class="res-header">
            <span>Calibration</span>
            <span :class="results.calibration ? 'ok' : 'fail'">
              {{ metrics.calibration.score }}% ·
              {{ results.calibration ? 'OK' : 'Weak' }}
            </span>
          </div>
          <p class="res-reason">{{ metrics.calibration.reason }}</p>
        </li>
        <li>
          <div class="res-header">
            <span>Fixation</span>
            <span :class="results.fixation ? 'ok' : 'fail'">
              {{ metrics.fixation.score }}% ·
              {{ results.fixation ? 'OK' : 'Fail' }}
            </span>
          </div>
          <p class="res-reason">{{ metrics.fixation.reason }}</p>
        </li>
        <li>
          <div class="res-header">
            <span>Smooth Pursuit</span>
            <span :class="results.pursuit ? 'ok' : 'fail'">
              {{ metrics.pursuit.score }}% ·
              {{ results.pursuit ? 'OK' : 'Fail' }}
            </span>
          </div>
          <p class="res-reason">{{ metrics.pursuit.reason }}</p>
        </li>
        <li>
          <div class="res-header">
            <span>Saccades</span>
            <span :class="results.saccade ? 'ok' : 'fail'">
              {{ metrics.saccade.score }}% ·
              {{ results.saccade ? 'OK' : 'Fail' }}
            </span>
          </div>
          <p class="res-reason">{{ metrics.saccade.reason }}</p>
        </li>
      </ul>

      <button class="start" @click="reset">Replay 🔁</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
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

/** extra metrics for final report */
const metrics = ref({
  calibration: { score: 0, reason: "" },
  fixation: { score: 0, reason: "" },
  pursuit: { score: 0, reason: "" },
  saccade: { score: 0, reason: "" },
})

/** countdown seconds for each phase */
const countdown = ref(0)
let countdownInterval = null

const gazeX = ref(null)
const gazeY = ref(null)

const canvas = ref(null)
let ctx = null
let interval = null

// stepper config
const steps = [
  { id: "calibration", label: "Calibration", index: 1 },
  { id: "fixation", label: "Fixation", index: 2 },
  { id: "pursuit", label: "Pursuit", index: 3 },
  { id: "saccade", label: "Saccades", index: 4 },
]

const overallScore = computed(() => {
  const m = metrics.value
  const total =
    m.calibration.score +
    m.fixation.score +
    m.pursuit.score +
    m.saccade.score
  return Math.round(total / 4)
})

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
  if (countdownInterval) clearInterval(countdownInterval)
  if (wg) wg.end()
  window.removeEventListener("resize", resizeCanvas)
})

function resizeCanvas() {
  const cnv = canvas.value
  if (!cnv) return
  cnv.width = window.innerWidth
  cnv.height = window.innerHeight
}

/* -------------------- COUNTDOWN -------------------- */
function startCountdown(seconds) {
  if (countdownInterval) clearInterval(countdownInterval)
  countdown.value = seconds
  countdownInterval = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      countdown.value = 0
      clearInterval(countdownInterval)
      countdownInterval = null
    }
  }, 1000)
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
  metrics.value = {
    calibration: { score: 0, reason: "" },
    fixation: { score: 0, reason: "" },
    pursuit: { score: 0, reason: "" },
    saccade: { score: 0, reason: "" },
  }
  calibIndex = 0
  calibClicks = 0
  countdown.value = 0
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
      metrics.value.calibration.score = Math.min(
        100,
        Math.round((calibClicks / 5) * 100)
      )
      metrics.value.calibration.reason =
        "You completed the 5-point calibration by clicking the target each time."
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

  if (interval) clearInterval(interval)
  startCountdown(4) // 4 seconds

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
    interval = null

    const ratio = total > 0 ? stable / total : 0
    const pct = Math.round(ratio * 100)
    metrics.value.fixation.score = pct
    metrics.value.fixation.reason = ratio > 0.3
      ? "Your gaze stayed close to the center most of the time."
      : "Your gaze moved too far from the center during the test."

    // quite forgiving – just need ~30% of frames close
    results.value.fixation = total > 0 && ratio > 0.3

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

  if (interval) clearInterval(interval)
  startCountdown(5) // ~5 seconds

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
    interval = null

    const ratio = total > 0 ? hits / total : 0
    const pct = Math.round(ratio * 100)

    metrics.value.pursuit.score = pct
    metrics.value.pursuit.reason = ratio > 0.25
      ? "Your gaze followed the moving target smoothly."
      : "Your gaze lost the moving target too often."

    results.value.pursuit = total > 0 && ratio > 0.25
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

  if (interval) clearInterval(interval)
  startCountdown(4) // ~4 seconds

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
    interval = null

    const ratio =
      (leftHits > 0 ? 0.5 : 0) + (rightHits > 0 ? 0.5 : 0)
    const pct = Math.round(ratio * 100)

    metrics.value.saccade.score = pct
    if (leftHits >= 1 && rightHits >= 1) {
      metrics.value.saccade.reason =
        "You shifted your gaze quickly between left and right targets."
    } else if (leftHits === 0 && rightHits === 0) {
      metrics.value.saccade.reason =
        "The system did not detect consistent left or right gaze shifts."
    } else if (leftHits === 0) {
      metrics.value.saccade.reason =
        "Rightward shifts were detected, but not enough leftward shifts."
    } else {
      metrics.value.saccade.reason =
        "Leftward shifts were detected, but not enough rightward shifts."
    }

    // super forgiving: at least one hit left & right
    results.value.saccade = leftHits >= 1 && rightHits >= 1
    phase.value = "done"
    text.value = ""
    clearScreen()
    countdown.value = 0
  }, 4500)
}

/* -------------------- RESET -------------------- */
function reset() {
  if (interval) clearInterval(interval)
  if (countdownInterval) clearInterval(countdownInterval)
  interval = null
  countdownInterval = null
  countdown.value = 0
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

/* Stepper */
.stepper {
  position: absolute;
  top: 4%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 4;
  color: #fff;
  font-size: 0.9rem;
}

.step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(0, 174, 255, 0.1);
}

.step-index {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid #00eaff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}

.step-label {
  white-space: nowrap;
  font-size: 0.8rem;
  opacity: 0.9;
}

.step.active {
  background: rgba(0, 174, 255, 0.2);
  border-color: #00eaff;
}

.countdown {
  margin-left: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 0.8rem;
}

/* UI */
.prompt {
  position: absolute;
  top: 12%;
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
  width: 360px;
  z-index: 3;
}

.results h2 {
  margin-top: 0;
  text-align: center;
}

.overall {
  text-align: center;
  margin-bottom: 10px;
}
.overall span {
  font-weight: 600;
  color: #00eaff;
}

.results-list {
  list-style: none;
  padding-left: 0;
  margin: 0 0 12px 0;
}

.results-list li {
  margin-bottom: 8px;
}

.res-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.res-reason {
  font-size: 0.85rem;
  opacity: 0.9;
  margin: 2px 0 0 0;
}

.ok {
  color: #00ff9d;
  font-weight: 600;
}

.fail {
  color: #ff5b5b;
  font-weight: 600;
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

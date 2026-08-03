import './style.css'
import { CameraInput } from './camera/CameraInput'
import { FaceDetector } from './face/FaceDetector'
import { TargetTracker } from './face/TargetTracker'
import { EyePoseEstimator } from './pose/EyePoseEstimator'
import { PoseFilter } from './pose/PoseFilter'
import { DisplayCalibration } from './display/DisplayCalibration'
import { OffAxisCamera } from './render/OffAxisCamera'
import { SceneRenderer } from './render/SceneRenderer'
import { AppUI } from './ui/AppUI'
import type { EyePose, FaceObservation, ViewSize } from './types'

const stage = document.getElementById('stage') as HTMLDivElement
const canvas = document.getElementById('gl') as HTMLCanvasElement

const calib = new DisplayCalibration()
const camera = new CameraInput()
const detector = new FaceDetector()
const tracker = new TargetTracker()
const estimator = new EyePoseEstimator(calib)
const filter = new PoseFilter()
const offAxis = new OffAxisCamera()
const sceneRenderer = new SceneRenderer(canvas)

let view: ViewSize = calib.computeViewSize()
let mouseMode = false
const mouseEye: EyePose = { x: 0, y: 0, z: 0.4 }
let lastFaces: FaceObservation[] = []

// FPSカウンタ
let renderFrames = 0
let detectFrames = 0
let renderFps = 0
let detectFps = 0
setInterval(() => {
  renderFps = renderFrames
  detectFps = detectFrames
  renderFrames = 0
  detectFrames = 0
}, 1000)

const ui = new AppUI(calib.settings, {
  onStartCamera: () => void startCamera(),
  onMouseMode: () => {
    mouseMode = true
    ui.hideOverlay()
  },
  onReset: () => {
    tracker.reset()
    filter.reset()
  },
  onSettingsChanged: () => {
    calib.save()
    layout()
    sceneRenderer.setAnimationEnabled(calib.settings.avatarMotion)
    sceneRenderer.setWireframe(calib.settings.wireframe)
  },
  onCalibrateDistance: () => {
    // 既知距離40cmでの距離校正(spec.md §6.3)
    if (!camera.active || filter.state !== 'tracking' || estimator.lastRawZ <= 0) {
      return '顔を追跡できていません。カメラ起動後、顔が検出された状態で実行してください。'
    }
    const scale = Math.min(5, Math.max(0.2, 0.4 / estimator.lastRawZ))
    calib.settings.distScale = scale
    calib.save()
    return `距離補正倍率 ${scale.toFixed(2)} を保存しました(推定 ${(estimator.lastRawZ * 100).toFixed(0)}cm → 40cm)`
  },
})

// ---- レイアウト(scene_spec.md §3) ----
function layout(): void {
  view = calib.computeViewSize()
  stage.style.left = `${view.left}px`
  stage.style.top = `${view.top}px`
  stage.style.width = `${view.wPx}px`
  stage.style.height = `${view.hPx}px`
  sceneRenderer.setSize(view.wPx, view.hPx)
  sceneRenderer.setRoomSize(view.wM, view.hM)
}
window.addEventListener('resize', layout)
window.addEventListener('orientationchange', () => {
  // 端末回転: カメラ・寸法・座標変換を再設定(spec.md §12)
  layout()
  void camera.restart()
  tracker.reset()
  filter.reset()
})
layout()

sceneRenderer.setAnimationEnabled(calib.settings.avatarMotion)
sceneRenderer.setWireframe(calib.settings.wireframe)
void sceneRenderer.loadAvatar(`${import.meta.env.BASE_URL}models/RobotExpressive.glb`)

// ---- カメラ起動(spec.md §4) ----
async function startCamera(): Promise<void> {
  try {
    ui.setStatus('searching', '(初期化中…)')
    if (!detector.ready) await detector.init()
    await camera.start()
    ui.hideOverlay()
    mouseMode = false
    startDetectionLoop()
  } catch (err) {
    // 権限拒否等: 案内を表示し、VR空間は既定視点のまま(spec.md §12)
    const name = err instanceof DOMException ? err.name : ''
    const msg =
      name === 'NotAllowedError'
        ? 'カメラの使用が許可されませんでした。ブラウザの設定でこのサイトのカメラ権限を許可して再読み込みするか、カメラなしモードをご利用ください。'
        : `カメラを起動できませんでした (${name || String(err)})。カメラなしモードをご利用ください。`
    ui.showOverlayError(msg)
  }
}
camera.onStateChange = (active) => ui.setCameraActive(active)

// ---- 顔検出ループ(描画とは独立に回す) ----
let detectionRunning = false
function startDetectionLoop(): void {
  if (detectionRunning) return
  detectionRunning = true
  const video = camera.video

  const step = () => {
    if (!camera.active) {
      // バックグラウンド等で停止中。復帰を待つ(spec.md §12)
      lastFaces = []
      setTimeout(schedule, 200)
      return
    }
    const now = performance.now()
    const faces = detector.detect(video, now)
    if (faces !== lastFaces) {
      lastFaces = faces
      detectFrames++
      const target = tracker.update(faces, now)
      if (target && !mouseMode) {
        const eye = estimator.estimate(target, video.videoWidth, video.videoHeight, view)
        filter.update(eye, now)
      } else if (!mouseMode) {
        filter.update(null, now)
      }
    }
    schedule()
  }
  const schedule = () => {
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(step)
    } else {
      setTimeout(step, 33)
    }
  }
  schedule()
}

// ---- マウス/タッチ模擬視点(PC・カメラなし確認用) ----
stage.addEventListener('pointermove', (e) => {
  if (!mouseMode) return
  const r = stage.getBoundingClientRect()
  mouseEye.x = ((e.clientX - r.left) / r.width - 0.5) * 0.4
  mouseEye.y = -((e.clientY - r.top) / r.height - 0.5) * 0.4
})
window.addEventListener(
  'wheel',
  (e) => {
    if (!mouseMode) return
    mouseEye.z = Math.min(1.2, Math.max(0.12, mouseEye.z + e.deltaY * 0.0005))
  },
  { passive: true }
)

// ---- 描画ループ(spec.md §7.3) ----
let lastT = performance.now()
let firstFrame = true
function frame(): void {
  const now = performance.now()
  const dt = Math.min((now - lastT) / 1000, 0.1)
  lastT = now
  if (firstFrame) {
    // ロード直後はウィンドウ寸法が確定していない場合があるため再レイアウト
    firstFrame = false
    layout()
  }

  if (mouseMode) filter.update(mouseEye, now)
  const eye = filter.getEye(now)
  // 遠近の強さ: 1未満なら仮想視点を遠ざけて遠近感を弱める
  const p = Math.max(calib.settings.perspStrength, 0.05)
  offAxis.update({ x: eye.x, y: eye.y, z: eye.z / p }, view.wM, view.hM)
  sceneRenderer.render(offAxis.camera, dt)
  renderFrames++

  updateStatus(eye)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

let statusCount = 0
function updateStatus(eye: EyePose): void {
  if (++statusCount % 10 !== 0) return // status/debug は約6Hzで十分
  if (mouseMode) {
    ui.setStatus('tracking', '(模擬視点)')
  } else if (!camera.active) {
    ui.setStatus('no-camera')
  } else {
    ui.setStatus(filter.state)
  }
  ui.updateDebug(camera.active ? camera.video : null, lastFaces, tracker.targetIndex, [
    `E   : (${(eye.x * 1000).toFixed(0)}, ${(eye.y * 1000).toFixed(0)}, ${(eye.z * 1000).toFixed(0)}) mm`,
    `view: ${(view.wM * 1000).toFixed(0)} x ${(view.hM * 1000).toFixed(0)} mm`,
    `faces: ${lastFaces.length}  target: ${tracker.targetIndex}`,
    `det : ${detectFps} fps  infer ${detector.inferenceMs.toFixed(1)} ms`,
    `draw: ${renderFps} fps`,
    `state: ${filter.state}${mouseMode ? ' (mouse)' : ''}`,
  ])
}

// ---- PWA (scene_spec.md §4) ----
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}

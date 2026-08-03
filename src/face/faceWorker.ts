/**
 * 顔ランドマーク検出ワーカー。
 * MediaPipeの推論(数十ms)をメインスレッドから切り離し、描画のフレーム落ちを防ぐ。
 * classicワーカーとしてバンドルされる(MediaPipeのWASMローダーが importScripts を使うため)。
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Landmark } from '../types'
import { toObservation } from './faceCommon'

interface InitMsg {
  type: 'init'
  baseUrl: string
}
interface DetectMsg {
  type: 'detect'
  bitmap: ImageBitmap
  t: number
}
type InMsg = InitMsg | DetectMsg

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<InMsg>) => void) | null
  postMessage: (msg: unknown) => void
}

let landmarker: FaceLandmarker | null = null

async function init(baseUrl: string): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks(`${baseUrl}mediapipe/wasm`)
  const options = (delegate: 'GPU' | 'CPU') =>
    ({
      baseOptions: { modelAssetPath: `${baseUrl}models/face_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numFaces: 3,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }) as const
  let delegate: 'GPU' | 'CPU' = 'GPU'
  try {
    landmarker = await FaceLandmarker.createFromOptions(fileset, options('GPU'))
  } catch {
    delegate = 'CPU'
    landmarker = await FaceLandmarker.createFromOptions(fileset, options('CPU'))
  }
  ctx.postMessage({ type: 'ready', delegate })
}

ctx.onmessage = (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    void init(msg.baseUrl).catch((err) =>
      ctx.postMessage({ type: 'error', message: String(err) })
    )
    return
  }
  if (msg.type === 'detect') {
    const { bitmap, t } = msg
    if (!landmarker) {
      bitmap.close()
      ctx.postMessage({ type: 'result', faces: [], w: 0, h: 0, t, inferMs: 0 })
      return
    }
    const t0 = performance.now()
    const result = landmarker.detectForVideo(bitmap, t)
    const inferMs = performance.now() - t0
    const w = bitmap.width
    const h = bitmap.height
    bitmap.close()
    ctx.postMessage({
      type: 'result',
      faces: result.faceLandmarks.map((lm) => toObservation(lm as Landmark[])),
      w,
      h,
      t,
      inferMs,
    })
  }
}

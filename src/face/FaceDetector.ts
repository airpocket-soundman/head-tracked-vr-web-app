import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceObservation, Landmark } from '../types'

/** 左右の目(虹彩中心)のランドマーク番号。Face Landmarker は 478点(468-477が虹彩)。 */
export const IDX_LEFT_IRIS = 468 // 画像上の左(観察者の右目)
export const IDX_RIGHT_IRIS = 473
const IDX_LEFT_EYE_OUTER = 33
const IDX_LEFT_EYE_INNER = 133
const IDX_RIGHT_EYE_INNER = 362
const IDX_RIGHT_EYE_OUTER = 263

/**
 * FaceDetector (spec.md §10.2)
 * MediaPipe Face Landmarker による複数顔ランドマーク検出(最大3顔、§15)。
 */
export class FaceDetector {
  private landmarker: FaceLandmarker | null = null
  private lastVideoTime = -1
  private lastResult: FaceObservation[] = []
  /** 直近の推論時間 [ms] */
  inferenceMs = 0

  async init(): Promise<void> {
    const base = import.meta.env.BASE_URL
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${base}models/face_landmarker.task`,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 3,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
  }

  get ready(): boolean {
    return this.landmarker !== null
  }

  /**
   * ビデオの現在フレームから顔を検出する。
   * 同一フレームに対しては前回結果を返す。
   */
  detect(video: HTMLVideoElement, timestampMs: number): FaceObservation[] {
    if (!this.landmarker || video.readyState < 2 || video.videoWidth === 0) return []
    if (video.currentTime === this.lastVideoTime) return this.lastResult
    this.lastVideoTime = video.currentTime

    const t0 = performance.now()
    const result = this.landmarker.detectForVideo(video, timestampMs)
    this.inferenceMs = performance.now() - t0

    this.lastResult = result.faceLandmarks.map((lm) => toObservation(lm as Landmark[]))
    return this.lastResult
  }

  close(): void {
    this.landmarker?.close()
    this.landmarker = null
  }
}

function toObservation(landmarks: Landmark[]): FaceObservation {
  const l = eyeCenter(landmarks, IDX_LEFT_IRIS, IDX_LEFT_EYE_OUTER, IDX_LEFT_EYE_INNER)
  const r = eyeCenter(landmarks, IDX_RIGHT_IRIS, IDX_RIGHT_EYE_INNER, IDX_RIGHT_EYE_OUTER)
  return {
    landmarks,
    cx: (l.x + r.x) / 2,
    cy: (l.y + r.y) / 2,
    eyeDist: Math.hypot(l.x - r.x, l.y - r.y, l.z - r.z),
  }
}

/** 虹彩ランドマークがあれば虹彩中心、なければ目頭・目尻の中点。 */
export function eyeCenter(landmarks: Landmark[], iris: number, a: number, b: number): Landmark {
  if (landmarks.length > iris) return landmarks[iris]
  const p = landmarks[a]
  const q = landmarks[b]
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 }
}

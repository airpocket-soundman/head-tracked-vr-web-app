import type { FaceObservation, Landmark } from '../types'

/** 左右の目(虹彩中心)のランドマーク番号。Face Landmarker は 478点(468-477が虹彩)。 */
export const IDX_LEFT_IRIS = 468 // 画像上の左(観察者の右目)
export const IDX_RIGHT_IRIS = 473
export const IDX_LEFT_EYE_OUTER = 33
export const IDX_LEFT_EYE_INNER = 133
export const IDX_RIGHT_EYE_INNER = 362
export const IDX_RIGHT_EYE_OUTER = 263

export function toObservation(landmarks: Landmark[]): FaceObservation {
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

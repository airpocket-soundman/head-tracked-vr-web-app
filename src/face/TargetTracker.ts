import type { FaceObservation } from '../types'

/** ターゲット喪失からタイムアウトまでの時間 [ms](spec.md §8.4) */
const LOST_TIMEOUT_MS = 1000
/** 前フレームとの対応付けを許す顔中心移動量(正規化座標、予測位置基準) */
const MATCH_DIST = 0.18
/** 切り替えヒステリシス: 他の顔がこれ以上近い状態を維持したら切り替え(§8.5) */
const CLOSER_RATIO = 1.25
const CLOSER_SUSTAIN_MS = 500

interface TargetMemory {
  cx: number
  cy: number
  eyeDist: number
  vx: number
  vy: number
  lastSeenMs: number
}

/**
 * TargetTracker (spec.md §8)
 * 最接近顔の初期選択、同一顔の継続追跡、一時喪失時の予測対応付け、
 * ヒステリシス付きの切り替え抑制を行う。
 */
export class TargetTracker {
  private target: TargetMemory | null = null
  private closerCandidateSince = -1

  /** 現在追跡中のターゲットが今フレームで検出されたか */
  targetVisible = false
  /** デバッグ用: 選択した顔のインデックス(-1 = なし) */
  targetIndex = -1

  /**
   * 今フレームの検出結果からターゲットの顔を返す。喪失中は null。
   * eyeDist(両目間隔の見かけサイズ)を近さの指標として使う(§8.2)。
   */
  update(faces: FaceObservation[], tMs: number): FaceObservation | null {
    this.targetVisible = false
    this.targetIndex = -1

    if (this.target && tMs - this.target.lastSeenMs > LOST_TIMEOUT_MS) {
      // タイムアウト: ターゲット解除して再選択(§8.4)
      this.target = null
      this.closerCandidateSince = -1
    }

    if (faces.length === 0) return null

    if (!this.target) {
      // 初期選択: 最も近い(=両目間隔が最大の)顔(§8.1, §8.2)
      const idx = indexOfClosest(faces)
      this.adopt(faces[idx], tMs)
      this.targetVisible = true
      this.targetIndex = idx
      return faces[idx]
    }

    // 同一顔の対応付け(§8.3): 予測位置に最も近い顔
    const dt = (tMs - this.target.lastSeenMs) / 1000
    const px = this.target.cx + this.target.vx * dt
    const py = this.target.cy + this.target.vy * dt
    let best = -1
    let bestD = MATCH_DIST
    for (let i = 0; i < faces.length; i++) {
      const d = Math.hypot(faces[i].cx - px, faces[i].cy - py)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }

    if (best < 0) {
      // 今フレームでは見つからない: ターゲット維持(§8.4)
      return null
    }

    // 切り替え判定(§8.5): 距離順位のわずかな変動では切り替えない
    const closestIdx = indexOfClosest(faces)
    if (closestIdx !== best && faces[closestIdx].eyeDist > faces[best].eyeDist * CLOSER_RATIO) {
      if (this.closerCandidateSince < 0) this.closerCandidateSince = tMs
      if (tMs - this.closerCandidateSince > CLOSER_SUSTAIN_MS) {
        this.adopt(faces[closestIdx], tMs)
        this.closerCandidateSince = -1
        this.targetVisible = true
        this.targetIndex = closestIdx
        return faces[closestIdx]
      }
    } else {
      this.closerCandidateSince = -1
    }

    this.track(faces[best], tMs)
    this.targetVisible = true
    this.targetIndex = best
    return faces[best]
  }

  reset(): void {
    this.target = null
    this.closerCandidateSince = -1
    this.targetVisible = false
    this.targetIndex = -1
  }

  private adopt(f: FaceObservation, tMs: number): void {
    this.target = { cx: f.cx, cy: f.cy, eyeDist: f.eyeDist, vx: 0, vy: 0, lastSeenMs: tMs }
  }

  private track(f: FaceObservation, tMs: number): void {
    const t = this.target!
    const dt = Math.max((tMs - t.lastSeenMs) / 1000, 1e-3)
    // 速度は軽く平滑化して予測の暴れを防ぐ
    t.vx = 0.6 * t.vx + (0.4 * (f.cx - t.cx)) / dt
    t.vy = 0.6 * t.vy + (0.4 * (f.cy - t.cy)) / dt
    t.cx = f.cx
    t.cy = f.cy
    t.eyeDist = f.eyeDist
    t.lastSeenMs = tMs
  }
}

function indexOfClosest(faces: FaceObservation[]): number {
  let idx = 0
  for (let i = 1; i < faces.length; i++) {
    if (faces[i].eyeDist > faces[idx].eyeDist) idx = i
  }
  return idx
}

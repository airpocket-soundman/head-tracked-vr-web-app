import type { EyePose, TrackingState } from '../types'

/** One Euro Filter (spec.md §9.1)。速度に応じてカットオフを上げ、遅延と振動を両立して抑える。 */
class OneEuro {
  private x: number | null = null
  private dx = 0
  private lastT = 0

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number
  ) {}

  reset(): void {
    this.x = null
    this.dx = 0
  }

  filter(v: number, tSec: number): number {
    if (this.x === null) {
      this.x = v
      this.lastT = tSec
      return v
    }
    const dt = Math.max(tSec - this.lastT, 1e-4)
    this.lastT = tSec

    const dRaw = (v - this.x) / dt
    this.dx = lowpass(this.dx, dRaw, alpha(dt, this.dCutoff))
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x = lowpass(this.x, v, alpha(dt, cutoff))
    return this.x
  }
}

function alpha(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

function lowpass(prev: number, v: number, a: number): number {
  return prev + a * (v - prev)
}

/** 既定視点(顔喪失時に戻る位置、spec.md §12) */
const DEFAULT_EYE: EyePose = { x: 0, y: 0, z: 0.4 }
/** 喪失後に直前位置を維持する時間 [ms](§8.4: 0.5〜1.0s) */
const HOLD_MS = 800
/** 既定視点へ戻る所要時間 [ms] */
const RETURN_MS = 1500
/** 物理的にあり得ない距離範囲 [m](§12 外れ値) */
const Z_MIN = 0.1
const Z_MAX = 2.5
/** 1回の観測で許容する最大ジャンプ [m] */
const MAX_JUMP = 0.25
/** 描画遅延補償の予測時間上限 [ms](§9.2) */
const PREDICT_MAX_MS = 60

/**
 * PoseFilter (spec.md §9, §12)
 * 平滑化(One Euro)、外れ値除去、短時間予測、喪失時の維持と既定視点への復帰。
 */
export class PoseFilter {
  private fx = new OneEuro(1.0, 4.0, 1.0)
  private fy = new OneEuro(1.0, 4.0, 1.0)
  private fz = new OneEuro(0.5, 2.0, 1.0)

  private current: EyePose = { ...DEFAULT_EYE }
  private velocity = { x: 0, y: 0, z: 0 }
  private lastMeasureT = -Infinity
  private lastAccepted: EyePose | null = null
  private rejectStreak = 0
  private holdStart: EyePose = { ...DEFAULT_EYE }

  state: TrackingState = 'searching'

  /** 検出ループから観測値を渡す。喪失フレームは null。tMs = performance.now() */
  update(measured: EyePose | null, tMs: number): void {
    if (measured && this.accept(measured)) {
      const tSec = tMs / 1000
      const prev = { ...this.current }
      this.current = {
        x: this.fx.filter(measured.x, tSec),
        y: this.fy.filter(measured.y, tSec),
        z: this.fz.filter(measured.z, tSec),
      }
      const dt = Math.max((tMs - this.lastMeasureT) / 1000, 1e-3)
      if (Number.isFinite(this.lastMeasureT)) {
        this.velocity = {
          x: (this.current.x - prev.x) / dt,
          y: (this.current.y - prev.y) / dt,
          z: (this.current.z - prev.z) / dt,
        }
      }
      this.lastMeasureT = tMs
      this.holdStart = { ...this.current }
      this.state = 'tracking'
    }
  }

  /** 外れ値除去(§12)。連続して同じ位置が観測されたら新しい位置として受け入れる。 */
  private accept(m: EyePose): boolean {
    if (!Number.isFinite(m.x + m.y + m.z)) return false
    if (m.z < Z_MIN || m.z > Z_MAX) return false
    if (this.lastAccepted) {
      const jump = Math.hypot(
        m.x - this.lastAccepted.x,
        m.y - this.lastAccepted.y,
        m.z - this.lastAccepted.z
      )
      if (jump > MAX_JUMP && this.state === 'tracking' && this.rejectStreak < 3) {
        this.rejectStreak++
        this.lastAccepted = m // ジャンプ先が続くなら受け入れるため記録は更新
        return false
      }
    }
    this.rejectStreak = 0
    this.lastAccepted = m
    return true
  }

  /** 描画ループが毎フレーム呼ぶ。維持・予測・復帰を含む描画用の目位置を返す。 */
  getEye(tMs: number): EyePose {
    const sinceMeasure = tMs - this.lastMeasureT

    if (sinceMeasure < 100) {
      // トラッキング中: 遅延補償の短時間予測(§9.2)
      const pt = Math.min(sinceMeasure, PREDICT_MAX_MS) / 1000
      this.state = 'tracking'
      return {
        x: this.current.x + this.velocity.x * pt,
        y: this.current.y + this.velocity.y * pt,
        z: this.current.z + this.velocity.z * pt,
      }
    }

    if (sinceMeasure < HOLD_MS) {
      // 短時間の喪失: 直前位置を維持(§8.4)
      this.state = 'hold'
      return this.holdStart
    }

    // タイムアウト: 既定視点へ緩やかに戻す(§12)
    this.state = 'lost'
    const k = Math.min((sinceMeasure - HOLD_MS) / RETURN_MS, 1)
    const e = easeInOut(k)
    return {
      x: this.holdStart.x + (DEFAULT_EYE.x - this.holdStart.x) * e,
      y: this.holdStart.y + (DEFAULT_EYE.y - this.holdStart.y) * e,
      z: this.holdStart.z + (DEFAULT_EYE.z - this.holdStart.z) * e,
    }
  }

  reset(): void {
    this.fx.reset()
    this.fy.reset()
    this.fz.reset()
    this.velocity = { x: 0, y: 0, z: 0 }
    this.lastMeasureT = -Infinity
    this.lastAccepted = null
    this.rejectStreak = 0
    this.current = { ...DEFAULT_EYE }
    this.holdStart = { ...DEFAULT_EYE }
    this.state = 'searching'
  }
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

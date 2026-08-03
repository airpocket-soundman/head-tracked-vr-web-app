import type { FaceObservation } from '../types'

export { IDX_LEFT_IRIS, IDX_RIGHT_IRIS, eyeCenter } from './faceCommon'

/** 検出に使う入力画像の幅 [px]。縮小して推論を軽くする(§9.3 入力解像度調整)。 */
const DETECT_WIDTH = 320

/**
 * FaceDetector (spec.md §10.2)
 * MediaPipe Face Landmarker をWeb Workerで実行するクライアント。
 * 推論(数十ms)をメインスレッドから切り離し、描画をブロックしない。
 */
export class FaceDetector {
  private worker: Worker | null = null
  private busy = false
  ready = false
  /** 直近の推論時間 [ms] */
  inferenceMs = 0
  /** 推論の実行環境(GPU/CPU)。ready後に確定 */
  delegate = '-'
  /** 検出結果の通知先。w,h は検出に使った画像サイズ */
  onResult: (faces: FaceObservation[], w: number, h: number, tMs: number) => void = () => {}

  async init(): Promise<void> {
    if (this.worker) return
    // classicワーカー(MediaPipeのWASMローダーが importScripts を使うため type:'module' にしない)
    const worker = new Worker(new URL('./faceWorker.ts', import.meta.url))
    this.worker = worker
    const baseUrl = new URL(import.meta.env.BASE_URL, location.href).href

    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (e) => {
        const msg = e.data
        if (msg.type === 'ready') {
          this.delegate = msg.delegate
          resolve()
        } else if (msg.type === 'error') reject(new Error(msg.message))
      }
      worker.onerror = (e) => reject(new Error(e.message))
      worker.postMessage({ type: 'init', baseUrl })
    })

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type !== 'result') return
      this.busy = false
      this.inferenceMs = msg.inferMs
      if (msg.w > 0) this.onResult(msg.faces, msg.w, msg.h, msg.t)
    }
    this.ready = true
  }

  /**
   * ビデオの現在フレームの検出をワーカーへ依頼する(非同期、結果は onResult)。
   * 前回の推論が終わっていないフレームは間引く。
   */
  requestDetect(video: HTMLVideoElement, tMs: number): void {
    if (!this.ready || !this.worker || this.busy) return
    if (video.readyState < 2 || video.videoWidth === 0) return
    this.busy = true
    const h = Math.round((DETECT_WIDTH * video.videoHeight) / video.videoWidth)
    createImageBitmap(video, { resizeWidth: DETECT_WIDTH, resizeHeight: h })
      .catch(() => createImageBitmap(video)) // resizeオプション非対応ブラウザ向け
      .then((bitmap) => {
        this.worker?.postMessage({ type: 'detect', bitmap, t: tMs }, [bitmap])
      })
      .catch(() => {
        this.busy = false
      })
  }

  close(): void {
    this.worker?.terminate()
    this.worker = null
    this.ready = false
    this.busy = false
  }
}

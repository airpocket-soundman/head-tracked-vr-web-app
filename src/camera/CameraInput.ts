/**
 * CameraInput (spec.md §10.2)
 * インカメラ映像の取得と、タブのバックグラウンド移行・復帰への対応(§12)。
 */
export class CameraInput {
  readonly video: HTMLVideoElement
  private stream: MediaStream | null = null
  private wantActive = false

  onStateChange: (active: boolean) => void = () => {}

  constructor() {
    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.muted = true
    this.video.autoplay = true
    // 映像はUIに表示しない(spec.md §11)。デバッグ表示はUIが別途キャンバスへ描く。
    this.video.style.display = 'none'
    document.body.appendChild(this.video)

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop(false)
      } else if (this.wantActive) {
        void this.start()
      }
    })
  }

  get active(): boolean {
    return this.stream !== null
  }

  /** カメラを起動する。権限拒否などは例外を投げるので呼び出し側で処理する。 */
  async start(): Promise<void> {
    this.wantActive = true
    if (this.stream) return
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    })
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play().catch(() => {})
    await this.waitForFrame()
    this.onStateChange(true)
  }

  /** stop(true) はユーザー操作による完全停止。false はバックグラウンド等の一時停止。 */
  stop(byUser = true): void {
    if (byUser) this.wantActive = false
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop()
      this.stream = null
      this.video.srcObject = null
      this.onStateChange(false)
    }
  }

  /** 端末回転時等の再初期化(§12)。 */
  async restart(): Promise<void> {
    if (!this.wantActive) return
    this.stop(false)
    this.wantActive = true
    await this.start()
  }

  private waitForFrame(): Promise<void> {
    return new Promise((resolve) => {
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) return resolve()
      const onReady = () => {
        this.video.removeEventListener('loadeddata', onReady)
        resolve()
      }
      this.video.addEventListener('loadeddata', onReady)
    })
  }
}

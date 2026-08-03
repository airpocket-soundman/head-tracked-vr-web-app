import type { FaceObservation, TrackingState } from '../types'
import type { CalibSettings } from '../display/DisplayCalibration'

export interface UICallbacks {
  onStartCamera: () => void
  onMouseMode: () => void
  onReset: () => void
  onSettingsChanged: () => void
  /** 既知距離(40cm)での距離校正を実行し、結果メッセージを返す */
  onCalibrateDistance: () => string
}

const STATE_LABEL: Record<TrackingState, string> = {
  'no-camera': 'カメラ未使用',
  searching: '顔を探しています…',
  tracking: '追跡中',
  hold: '一時喪失(位置を維持)',
  lost: '喪失(既定視点へ復帰)',
}

/**
 * AppUI (spec.md §11)
 * 権限要求、状態表示、校正、再初期化、デバッグ表示。
 */
export class AppUI {
  private root: HTMLElement
  private overlay!: HTMLDivElement
  private errorEl!: HTMLDivElement
  private camDot!: HTMLDivElement
  private statusText!: HTMLSpanElement
  private debugPanel!: HTMLDivElement
  private debugCanvas!: HTMLCanvasElement
  private debugText!: HTMLPreElement
  private settingsPanel!: HTMLDivElement

  debugVisible = false

  constructor(
    private settings: CalibSettings,
    private cb: UICallbacks
  ) {
    this.root = document.getElementById('ui')!
    this.buildOverlay()
    this.buildStatusBar()
    this.buildDebugPanel()
    this.buildSettingsPanel()
  }

  // ---- 起動オーバーレイ(権限要求画面) ----
  private buildOverlay(): void {
    this.overlay = el('div', 'start-overlay')
    const h1 = el('h1')
    h1.textContent = 'Head Tracked VR'
    const p = el('p')
    p.textContent =
      'インカメラで顔の位置を検出し、画面の奥に部屋があるような運動視差表示を行います。' +
      '映像は端末内でのみ処理され、サーバーへは送信されません。'
    const startBtn = el('button', 'btn')
    startBtn.textContent = 'カメラを開始'
    startBtn.onclick = () => this.cb.onStartCamera()
    const mouseBtn = el('button', 'btn secondary')
    mouseBtn.textContent = 'カメラなしで試す(マウス/タッチ操作)'
    mouseBtn.onclick = () => this.cb.onMouseMode()
    this.errorEl = el('div', 'start-error')
    this.overlay.append(h1, p, startBtn, mouseBtn, this.errorEl)
    this.root.appendChild(this.overlay)
  }

  hideOverlay(): void {
    this.overlay.style.display = 'none'
  }

  showOverlayError(msg: string): void {
    this.overlay.style.display = 'flex'
    this.errorEl.textContent = msg
  }

  // ---- ステータスバー ----
  private buildStatusBar(): void {
    const bar = el('div', 'status-bar')
    this.camDot = el('div', 'cam-dot')
    this.camDot.title = 'カメラ使用中インジケーター'
    this.statusText = document.createElement('span')
    this.statusText.className = 'status-text'
    this.statusText.textContent = STATE_LABEL['no-camera']

    const resetBtn = iconBtn('⟳', 'トラッキング再初期化')
    resetBtn.onclick = () => this.cb.onReset()
    const debugBtn = iconBtn('🐞', 'デバッグ表示')
    debugBtn.onclick = () => {
      this.debugVisible = !this.debugVisible
      this.debugPanel.style.display = this.debugVisible ? 'block' : 'none'
      debugBtn.classList.toggle('active', this.debugVisible)
    }
    const settingsBtn = iconBtn('⚙', '校正・設定')
    settingsBtn.onclick = () => {
      const show = this.settingsPanel.style.display === 'none'
      this.settingsPanel.style.display = show ? 'block' : 'none'
      settingsBtn.classList.toggle('active', show)
    }

    bar.append(this.camDot, this.statusText, resetBtn, debugBtn, settingsBtn)
    this.root.appendChild(bar)
  }

  setCameraActive(active: boolean): void {
    this.camDot.classList.toggle('on', active)
  }

  setStatus(state: TrackingState, extra = ''): void {
    this.statusText.textContent = STATE_LABEL[state] + (extra ? ` ${extra}` : '')
  }

  // ---- デバッグパネル(§11) ----
  private buildDebugPanel(): void {
    this.debugPanel = el('div', 'debug-panel')
    this.debugPanel.style.display = 'none'
    this.debugCanvas = document.createElement('canvas')
    this.debugCanvas.width = 160
    this.debugCanvas.height = 120
    this.debugText = document.createElement('pre')
    this.debugPanel.append(this.debugCanvas, this.debugText)
    this.root.appendChild(this.debugPanel)
  }

  updateDebug(
    video: HTMLVideoElement | null,
    faces: FaceObservation[],
    targetIndex: number,
    lines: string[]
  ): void {
    if (!this.debugVisible) return
    this.debugText.textContent = lines.join('\n')

    const ctx = this.debugCanvas.getContext('2d')!
    const cw = this.debugCanvas.width
    const ch = this.debugCanvas.height
    ctx.clearRect(0, 0, cw, ch)
    if (video && video.videoWidth > 0) {
      this.debugCanvas.height = Math.round((cw * video.videoHeight) / video.videoWidth)
      // ミラー表示(見た目の自然さのため。計算座標とは分離、spec.md §6.4)
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -cw, 0, cw, this.debugCanvas.height)
      ctx.restore()
      for (let i = 0; i < faces.length; i++) {
        const f = faces[i]
        let minX = 1
        let minY = 1
        let maxX = 0
        let maxY = 0
        for (const p of f.landmarks) {
          if (p.x < minX) minX = p.x
          if (p.y < minY) minY = p.y
          if (p.x > maxX) maxX = p.x
          if (p.y > maxY) maxY = p.y
        }
        ctx.strokeStyle = i === targetIndex ? '#4f8' : '#f66'
        ctx.lineWidth = 2
        const h = this.debugCanvas.height
        ctx.strokeRect((1 - maxX) * cw, minY * h, (maxX - minX) * cw, (maxY - minY) * h)
      }
    }
  }

  // ---- 校正・設定パネル(§11) ----
  private buildSettingsPanel(): void {
    this.settingsPanel = el('div', 'settings-panel')
    this.settingsPanel.style.display = 'none'
    const h2 = el('h2')
    h2.textContent = '校正・設定'
    this.settingsPanel.appendChild(h2)

    const inputs = new Map<keyof CalibSettings, HTMLInputElement>()
    const numField = (
      label: string,
      key: keyof CalibSettings,
      min: number,
      max: number,
      step = 1
    ) => {
      const lab = document.createElement('label')
      lab.textContent = label
      const input = document.createElement('input')
      input.type = 'number'
      input.min = String(min)
      input.max = String(max)
      input.step = String(step)
      input.value = String(this.settings[key])
      input.onchange = () => {
        const v = Number(input.value)
        if (Number.isFinite(v) && v >= min && v <= max) {
          ;(this.settings[key] as number) = v
          this.cb.onSettingsChanged()
        }
      }
      lab.appendChild(input)
      inputs.set(key, input)
      this.settingsPanel.appendChild(lab)
    }

    numField('画面の物理幅 [mm]', 'screenWidthMm', 30, 2000)
    numField('カメラ水平画角 [°]', 'hfovDeg', 30, 120)
    numField('瞳孔間距離 [mm]', 'ipdMm', 40, 80)
    numField('カメラの画面上端からの距離 [mm]', 'camAboveMm', -50, 300)
    numField('視差の強さ', 'parallaxScale', 0.1, 3, 0.1)
    numField('遠近の強さ', 'perspStrength', 0.1, 2, 0.05)
    numField('距離補正倍率', 'distScale', 0.2, 5, 0.05)

    // 既知距離での校正(spec.md §6.3): 顔を画面から40cmに保って実行する
    const calBtn = el('button', 'btn secondary')
    calBtn.textContent = '距離を校正(顔を画面から40cmにして押す)'
    const calMsg = el('div')
    calMsg.style.cssText = 'color:#9fd;font-size:11px;margin:6px 0;min-height:14px'
    calBtn.onclick = () => {
      calMsg.textContent = this.cb.onCalibrateDistance()
      const di = inputs.get('distScale')
      if (di) di.value = String(this.settings.distScale.toFixed(2))
    }
    this.settingsPanel.append(calBtn, calMsg)

    const motionLab = document.createElement('label')
    motionLab.textContent = 'アバターのアニメーション'
    const motion = document.createElement('input')
    motion.type = 'checkbox'
    motion.checked = this.settings.avatarMotion
    motion.onchange = () => {
      this.settings.avatarMotion = motion.checked
      this.cb.onSettingsChanged()
    }
    motionLab.appendChild(motion)
    this.settingsPanel.appendChild(motionLab)

    const mirrorLab = document.createElement('label')
    mirrorLab.textContent = '左右反転(ミラー)補正'
    const mirror = document.createElement('input')
    mirror.type = 'checkbox'
    mirror.checked = this.settings.mirrorX
    mirror.onchange = () => {
      this.settings.mirrorX = mirror.checked
      this.cb.onSettingsChanged()
    }
    mirrorLab.appendChild(mirror)
    this.settingsPanel.appendChild(mirrorLab)

    const row = el('div', 'row')
    const close = el('button', 'btn secondary')
    close.textContent = '閉じる'
    close.onclick = () => {
      this.settingsPanel.style.display = 'none'
    }
    row.appendChild(close)
    this.settingsPanel.appendChild(row)

    this.root.appendChild(this.settingsPanel)
  }
}

function el<K extends 'div' | 'h1' | 'h2' | 'p' | 'button'>(
  tag: K,
  cls?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

function iconBtn(icon: string, title: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'icon-btn'
  b.textContent = icon
  b.title = title
  return b
}

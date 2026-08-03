import type { ViewSize } from '../types'

/** ユーザー校正可能な設定(localStorageへ永続化)。 */
export interface CalibSettings {
  /** 端末画面の物理幅 [mm](スマホは縦持ちの短辺、PCはモニター横幅) */
  screenWidthMm: number
  /** インカメラ水平画角 [deg] */
  hfovDeg: number
  /** 瞳孔間距離 [mm] */
  ipdMm: number
  /** 表示領域上端からカメラまでの距離 [mm] */
  camAboveMm: number
  /** カメラ映像X反転(ミラー)を計算に適用するか */
  mirrorX: boolean
  /** 距離推定の補正倍率(既知距離での校正で決定、spec.md §6.3) */
  distScale: number
  /** 視差の強さ(1=物理的に正しいスケール) */
  parallaxScale: number
  /** アバターのアニメーション再生(false=静止) */
  avatarMotion: boolean
}

const STORAGE_KEY = 'headvr-calib-v1'

/** PC表示時の固定アスペクト比(縦:横 = 9:16、scene_spec.md §3.2) */
const FIXED_ASPECT = 9 / 16

function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * DisplayCalibration (spec.md §10.2, scene_spec.md §3)
 * 表示領域の物理寸法(W, H)を一元管理する。部屋・投影・アバターの
 * すべての寸法はこのクラスの値から導出される。
 */
export class DisplayCalibration {
  settings: CalibSettings
  readonly isMobile: boolean

  constructor() {
    this.isMobile = isCoarsePointer()
    this.settings = {
      screenWidthMm: this.isMobile ? 70 : 530, // 典型的なスマホ短辺 / 24型モニター横幅
      // 640x480ストリームの実効画角は端末スペックの広角値より狭いことが多い。
      // 広めに誤ると距離を過小推定し歪みが過大になるため控えめな既定値にする。
      hfovDeg: 55,
      ipdMm: 63,
      camAboveMm: 5,
      mirrorX: true,
      distScale: 1,
      parallaxScale: 1,
      avatarMotion: false,
    }
    this.load()
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) Object.assign(this.settings, JSON.parse(raw))
    } catch {
      /* 破損データは無視して既定値を使う */
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch {
      /* private mode 等では保存できなくてもよい */
    }
  }

  /** 画面の mm/CSSピクセル。 */
  private pxPitchMm(): number {
    let base = this.isMobile
      ? Math.min(screen.width, screen.height)
      : Math.max(screen.width, screen.height)
    // 環境によっては screen サイズが 0 を返すことがあるためフォールバック
    if (!(base > 0)) {
      base = this.isMobile
        ? Math.min(window.innerWidth, window.innerHeight)
        : Math.max(window.innerWidth, window.innerHeight)
    }
    if (!(base > 0)) base = 400
    return this.settings.screenWidthMm / base
  }

  /**
   * 現在のウィンドウに対する表示領域を計算する。
   * スマホ: 全画面。PC: 固定アスペクト比(9:16)でレターボックス配置。
   */
  computeViewSize(): ViewSize {
    const winW = window.innerWidth
    const winH = window.innerHeight
    let wPx: number
    let hPx: number
    if (this.isMobile) {
      wPx = winW
      hPx = winH
    } else {
      hPx = winH
      wPx = Math.round(hPx * FIXED_ASPECT)
      if (wPx > winW) {
        wPx = winW
        hPx = Math.round(wPx / FIXED_ASPECT)
      }
    }
    const pitch = this.pxPitchMm()
    return {
      wPx,
      hPx,
      wM: (wPx * pitch) / 1000,
      hM: (hPx * pitch) / 1000,
      left: Math.round((winW - wPx) / 2),
      top: Math.round((winH - hPx) / 2),
    }
  }

  /**
   * カメラ位置(表示領域中心基準、ディスプレイ座標系 [m])。
   * カメラは表示領域上端の中央上方 camAboveMm にあると仮定する(§6.4)。
   */
  cameraPosition(view: ViewSize): { x: number; y: number; z: number } {
    return { x: 0, y: view.hM / 2 + this.settings.camAboveMm / 1000, z: 0 }
  }
}

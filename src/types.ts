/** ディスプレイ座標系(spec.md §5)における目の位置 [m]。原点=表示領域中心、X右+、Y上+、Z観察者側+ */
export interface EyePose {
  x: number
  y: number
  z: number
}

/** 正規化画像座標のランドマーク(MediaPipe互換) */
export interface Landmark {
  x: number
  y: number
  z: number
}

/** 1つの検出顔の観測値(画像正規化座標) */
export interface FaceObservation {
  landmarks: Landmark[]
  /** 顔中心(正規化) */
  cx: number
  cy: number
  /** 両目間隔の画像上サイズ(正規化)。距離の逆数に比例する近さの指標 */
  eyeDist: number
}

export type TrackingState = 'no-camera' | 'searching' | 'tracking' | 'hold' | 'lost'

/** 表示領域のサイズ情報 */
export interface ViewSize {
  /** CSSピクセル */
  wPx: number
  hPx: number
  /** 物理サイズ [m] */
  wM: number
  hM: number
  /** ウィンドウ内での配置(レターボックス) */
  left: number
  top: number
}

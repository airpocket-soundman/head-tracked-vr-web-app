import type { EyePose, FaceObservation, Landmark } from '../types'
import type { DisplayCalibration } from '../display/DisplayCalibration'
import type { ViewSize } from '../types'
import { IDX_LEFT_IRIS, IDX_RIGHT_IRIS, eyeCenter } from '../face/FaceDetector'

/**
 * EyePoseEstimator (spec.md §6)
 * 顔ランドマークからディスプレイ座標系における両目中点の3次元位置を推定する。
 *
 * 距離推定(§6.3): 単眼のため、瞳孔間距離 IPD(既定63mm)の見かけの
 * ピクセルサイズとカメラ画角から Z = f_px * IPD / ipd_px で概算する。
 * ランドマークのz成分を含めた3D距離を使うことで頭部ヨー回転時の
 * 見かけ縮小をある程度補正する(§8.2)。
 */
export class EyePoseEstimator {
  /** 補正前の生の距離推定値 [m](既知距離校正に使用) */
  lastRawZ = 0

  constructor(private calib: DisplayCalibration) {}

  estimate(face: FaceObservation, videoW: number, videoH: number, view: ViewSize): EyePose {
    const s = this.calib.settings
    const lm = face.landmarks
    const l = eyeCenter(lm, IDX_LEFT_IRIS, 33, 133)
    const r = eyeCenter(lm, IDX_RIGHT_IRIS, 362, 263)

    // 焦点距離 [px](水平画角から)
    const fPx = videoW / 2 / Math.tan(((s.hfovDeg / 2) * Math.PI) / 180)

    // 両目間隔 [px](z込みの3D距離。zは正規化xスケールと同等とみなす)
    const ipdPx = dist3(l, r, videoW, videoH)
    if (ipdPx < 1e-6) return { x: 0, y: 0, z: 0.4 }

    // 顔の距離における 1px あたりの実寸 [m/px]。
    // ピンホールモデルでは X = (u-cx)/f * Z かつ Z = f * IPD / ipd_px なので
    // X = (u-cx) * IPD / ipd_px となり、横位置は焦点距離(画角設定)の誤差に
    // 依存せず正確に求まる。画角誤差の影響は距離Zのみに現れるため、
    // 既知距離校正 distScale は Z だけに適用する(§6.3)。
    const mPerPx = s.ipdMm / 1000 / ipdPx

    // 距離 [m]
    this.lastRawZ = fPx * mPerPx
    const z = this.lastRawZ * s.distScale

    // 両目中点の画像座標 [px]
    const u = ((l.x + r.x) / 2) * videoW
    const v = ((l.y + r.y) / 2) * videoH

    // カメラ座標 [m](焦点距離に依存しない横位置)
    let xc = (u - videoW / 2) * mPerPx
    const yc = (v - videoH / 2) * mPerPx

    // カメラ座標 → ディスプレイ座標(§6.4)
    // 非ミラー映像では観察者が右へ動くと画像上では左へ動くためXを反転。
    // 画像Yは下向き正、ディスプレイYは上向き正のためYも反転。
    if (s.mirrorX) xc = -xc
    const cam = this.calib.cameraPosition(view)
    // 視差の強さ: 表示領域中心を基準に横方向オフセットをスケールする
    const p = s.parallaxScale
    return {
      x: (cam.x + xc) * p,
      y: (cam.y - yc) * p,
      z: cam.z + z,
    }
  }
}

function dist3(a: Landmark, b: Landmark, w: number, h: number): number {
  const dx = (a.x - b.x) * w
  const dy = (a.y - b.y) * h
  const dz = (a.z - b.z) * w
  return Math.hypot(dx, dy, dz)
}

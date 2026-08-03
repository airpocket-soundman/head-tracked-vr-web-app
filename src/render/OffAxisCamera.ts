import * as THREE from 'three'
import type { EyePose } from '../types'

const NEAR = 0.01
const FAR = 10

/**
 * OffAxisCamera (spec.md §7)
 * 目の位置と表示領域四隅から非対称視錐台(generalized perspective projection)を
 * 計算し、投影行列を直接設定する。lookAt()+対称FOVは使用しない(§7.3)。
 *
 * ディスプレイ面は Z=0、四隅は (±W/2, ±H/2, 0)。カメラは目の位置に置き、
 * 前方 -Z を向いたまま回転させない(視錐台の非対称性だけで表現する)。
 */
export class OffAxisCamera {
  readonly camera: THREE.PerspectiveCamera

  constructor() {
    this.camera = new THREE.PerspectiveCamera()
    this.camera.matrixAutoUpdate = true
  }

  /** eye: ディスプレイ座標系の目位置 [m]、wM/hM: 表示領域の物理サイズ [m] */
  update(eye: EyePose, wM: number, hM: number): void {
    const ez = Math.max(eye.z, NEAR * 2) // 画面に密着した場合の発散を防ぐ
    const xLeft = -wM / 2
    const xRight = wM / 2
    const yBottom = -hM / 2
    const yTop = hM / 2

    // spec.md §7.2
    const left = (NEAR * (xLeft - eye.x)) / ez
    const right = (NEAR * (xRight - eye.x)) / ez
    const bottom = (NEAR * (yBottom - eye.y)) / ez
    const top = (NEAR * (yTop - eye.y)) / ez

    this.camera.position.set(eye.x, eye.y, ez)
    this.camera.rotation.set(0, 0, 0)
    this.camera.updateMatrixWorld()

    this.camera.projectionMatrix.makePerspective(left, right, top, bottom, NEAR, FAR)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()
  }
}

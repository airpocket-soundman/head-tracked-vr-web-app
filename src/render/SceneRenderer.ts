import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * SceneRenderer (spec.md §10.2, scene_spec.md)
 * 表示領域(W×H)を奥へ押し出したボックス状の部屋(奥行き=W)と、
 * 部屋に収まるサイズのアバターを描画する。
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene

  private room: THREE.Group | null = null
  private avatar: THREE.Group | null = null
  private avatarBaseHeight = 1
  private mixer: THREE.AnimationMixer | null = null
  private idleAction: THREE.AnimationAction | null = null
  private animationEnabled = false
  private wireframe = false
  private gridTexture: THREE.Texture
  private wM = 0.07
  private hM = 0.14

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x020308)

    this.scene.add(new THREE.AmbientLight(0xccddff, 0.35))
    const key = new THREE.PointLight(0xffffff, 0.7, 0, 2)
    key.position.set(0, 0.02, -0.01) // 開口部付近から部屋を照らす
    this.scene.add(key)

    this.gridTexture = makeGridTexture()
  }

  /** 表示領域の物理サイズが変わったら部屋とアバター配置を作り直す。 */
  setRoomSize(wM: number, hM: number): void {
    if (Math.abs(wM - this.wM) < 0.0005 && Math.abs(hM - this.hM) < 0.0005 && this.room) return
    this.wM = wM
    this.hM = hM
    this.buildRoom()
    this.fitAvatar()
  }

  private buildRoom(): void {
    if (this.room) {
      this.room.removeFromParent()
      this.room.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
    }
    const w = this.wM
    const h = this.hM
    const d = w // 奥行き = 表示幅 (scene_spec.md §1)
    const room = new THREE.Group()

    const cell = 0.02 // 20mm格子
    const wall = (sw: number, sh: number, color: number) => {
      const tex = this.gridTexture.clone()
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(sw / cell, sh / cell)
      tex.needsUpdate = true
      return new THREE.Mesh(
        new THREE.PlaneGeometry(sw, sh),
        new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.9 })
      )
    }

    const floor = wall(w, d, 0xbbc4d4)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -h / 2, -d / 2)

    const ceiling = wall(w, d, 0x8891a0)
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.set(0, h / 2, -d / 2)

    const leftWall = wall(d, h, 0xa8b2c8)
    leftWall.rotation.y = Math.PI / 2
    leftWall.position.set(-w / 2, 0, -d / 2)

    const rightWall = wall(d, h, 0xa8b2c8)
    rightWall.rotation.y = -Math.PI / 2
    rightWall.position.set(w / 2, 0, -d / 2)

    const backWall = wall(w, h, 0xcdd5e2)
    backWall.position.set(0, 0, -d)

    room.add(floor, ceiling, leftWall, rightWall, backWall)

    // 開口部近くの浮遊キューブ(運動視差の手掛かり、scene_spec.md §2)
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0x2f7ca8,
      emissive: 0x0c2231,
      roughness: 0.4,
    })
    const cubeSize = w * 0.06
    const positions: [number, number, number][] = [
      [-w * 0.32, h * 0.3, -d * 0.15],
      [w * 0.32, -h * 0.25, -d * 0.25],
      [w * 0.28, h * 0.32, -d * 0.55],
    ]
    for (const [x, y, z] of positions) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize), cubeMat)
      cube.position.set(x, y, z)
      cube.rotation.set(0.5, 0.7, 0)
      room.add(cube)
    }

    this.room = room
    this.scene.add(room)
    this.applyWireframe()
  }

  async loadAvatar(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url)
    this.avatar = gltf.scene
    const bbox = new THREE.Box3().setFromObject(this.avatar)
    this.avatarBaseHeight = Math.max(bbox.max.y - bbox.min.y, 1e-6)

    this.mixer = new THREE.AnimationMixer(this.avatar)
    const idle =
      gltf.animations.find((c) => c.name.toLowerCase().includes('idle')) ?? gltf.animations[0]
    if (idle) {
      this.idleAction = this.mixer.clipAction(idle)
      this.idleAction.play()
      // 静止時も自然な姿勢にするため、Idleの先頭フレームのポーズを適用して止める
      this.mixer.update(0)
      this.idleAction.paused = !this.animationEnabled
    }

    this.scene.add(this.avatar)
    this.fitAvatar()
    this.applyWireframe()
  }

  /** アバターを部屋の高さの70%に正規化し、部屋の中央奥寄りへ配置する(scene_spec.md §2)。 */
  private fitAvatar(): void {
    if (!this.avatar) return
    const targetH = this.hM * 0.7
    const s = targetH / this.avatarBaseHeight
    this.avatar.scale.setScalar(s)
    this.avatar.position.set(0, -this.hM / 2, -this.wM * 0.55)
  }

  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled
    if (this.idleAction) this.idleAction.paused = !enabled
  }

  /** ワイヤーフレーム表示(描画負荷の切り分け用)。 */
  setWireframe(enabled: boolean): void {
    this.wireframe = enabled
    this.applyWireframe()
  }

  private applyWireframe(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = this.wireframe
        }
      }
    })
  }

  setSize(wPx: number, hPx: number, renderScale = 1): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * renderScale)
    this.renderer.setSize(wPx, hPx, false)
  }

  render(camera: THREE.Camera, dtSec: number): void {
    this.mixer?.update(dtSec)
    this.renderer.render(this.scene, camera)
  }
}

/** 壁面用の格子テクスチャ(奥行き知覚の手掛かり)。 */
function makeGridTexture(): THREE.Texture {
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#151a24'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#333c4d'
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

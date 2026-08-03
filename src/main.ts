import './style.css'
import * as THREE from 'three'

// Phase 0 placeholder: plain symmetric-projection scene to verify the toolchain
// and GitHub Pages deployment. Replaced by the full pipeline in later phases.
const canvas = document.getElementById('gl') as HTMLCanvasElement
const stage = document.getElementById('stage') as HTMLDivElement

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0a0c18)
const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10)
camera.position.set(0, 0, 0.4)

scene.add(new THREE.AmbientLight(0xffffff, 0.6))
const light = new THREE.PointLight(0xffffff, 1.5)
light.position.set(0, 0.1, 0.2)
scene.add(light)

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(0.05, 0.05, 0.05),
  new THREE.MeshStandardMaterial({ color: 0x50c8ff })
)
cube.position.z = -0.1
scene.add(cube)

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  stage.style.left = '0px'
  stage.style.top = '0px'
  stage.style.width = `${w}px`
  stage.style.height = `${h}px`
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

renderer.setAnimationLoop((t) => {
  cube.rotation.y = t / 1000
  cube.rotation.x = t / 1400
  renderer.render(scene, camera)
})

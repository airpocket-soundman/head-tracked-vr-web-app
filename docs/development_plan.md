# ヘッドトラッキングVR Webアプリ 開発計画

仕様書: [spec.md](./spec.md) / シーン追加仕様: [scene_spec.md](./scene_spec.md) / アセット調査: [assets.md](./assets.md)
作成日: 2026-08-03(更新: シーン仕様・アバター・PWA対応を追記)

## 1. 方針

- 仕様書のMVP範囲(§15)を最優先で実装し、動くものを早期に確認できる順序で進める。
- 各フェーズの終わりに実機(スマートフォン)で動作確認できる状態を作る。
- 精度チューニング(校正・平滑化パラメータ)は骨格が動いてから行う。

## 2. 技術スタック

| 項目 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript | 仕様書推奨 |
| ビルド | Vite | 開発サーバーが高速、HTTPS対応が容易 |
| 3D描画 | Three.js | 仕様書推奨。off-axis projection は `PerspectiveCamera.projectionMatrix` を直接設定して実現 |
| 顔検出 | MediaPipe Face Landmarker (`@mediapipe/tasks-vision`) | 仕様書推奨。WASM/GPU対応、複数顔・478ランドマーク・頭部姿勢行列を取得可能 |
| カメラ | `getUserMedia()` | 標準API |
| 配信 | GitHub Pages (HTTPS) | 静的サイトで完結、実機検証が容易 |

サーバーは不要。すべて端末内で完結する(プライバシー要件 §13)。

## 3. 開発フェーズ

### Phase 0: プロジェクト基盤 (0.5日)

- Vite + TypeScript プロジェクト初期化
- Three.js / MediaPipe 依存導入
- ローカルHTTPS開発環境(実機のカメラ許可にHTTPSが必須)
- GitHub Actions で GitHub Pages への自動デプロイ

**確認**: スマホ実機でページが開き、空のThree.jsシーンが表示される。

### Phase 1: カメラ入力と顔検出 (1日)

- `CameraInput`: インカメラ取得、解像度・画面方向管理、バックグラウンド復帰処理(§12)
- `FaceDetector`: Face Landmarker で最大3顔のランドマーク検出(§15-2)
- カメラ映像+ランドマークのデバッグオーバーレイ表示

**確認**: 実機で顔ランドマークが30fps程度で検出・描画される。

### Phase 2: 視点位置推定 (1〜1.5日)

- `EyePoseEstimator`: 左右の目の中点を視点とする(§6.1)。両目間隔の見かけサイズ+カメラ画角から距離を概算(§6.3)
- `DisplayCalibration`: 画面物理寸法・カメラオフセットの設定。MVPでは代表的な端末寸法+ユーザー入力で代用(§15)
- カメラ座標→ディスプレイ座標変換(§6.4): 平行移動、縦横画面の軸変換、ミラー分離
- デバッグ表示: 推定 `Ex, Ey, Ez` [m]、推定距離

**確認**: 顔を前後左右に動かすと推定値がもっともらしく変化する(例: 顔〜画面 30cm で Ez ≈ 0.3)。

### Phase 3: off-axis projection とVRシーン (1〜1.5日)

- `OffAxisCamera`: 目位置とディスプレイ四隅から非対称視錐台を計算(§7.2)し、Three.js のカメラに投影行列・ビュー行列を直接設定。`lookAt()`+対称FOVは使わない(§7.3)
- `SceneRenderer`: [scene_spec.md](./scene_spec.md) に従い、表示領域を奥へ押し出したボックス状の部屋(幅W×高さH×奥行きW、格子テクスチャ壁)を描画
- アバター表示: RobotExpressive.glb(CC0、[assets.md](./assets.md))を部屋内に配置し、部屋の高さ基準でスケーリング、Idleアニメーションをループ再生
- 表示領域管理: スマホは全画面、PCは固定アスペクト比+レターボックスでスケールのみ可変(scene_spec §3)
- 顔喪失時: 最終位置を短時間維持→既定視点へ緩やかに復帰(§12)

**確認**: 受入条件(§17)の中核 — 左右上下前後に動くと「窓越しに覗き込む」運動視差が成立する。**ここがプロジェクトの山場。**

### Phase 4: 平滑化と追跡の安定化 (1〜1.5日)

- `PoseFilter`: One Euro Filter による適応平滑化(§9.1)、速度ベースの短時間予測(§9.2)、外れ値除去(§12)
- `TargetTracker`(§8): 最接近顔の初期選択、位置・サイズ・速度による同一顔対応付け、0.5〜1.0秒の喪失時予測、20〜30%+0.5秒のヒステリシス付き切り替え

**確認**: 顔静止時に映像が振動しない。複数人がカメラに映ってもターゲットが跳ばない。

### Phase 5: UIと仕上げ (1日)

- `AppUI`(§11): 権限要求画面、追跡状態表示、距離校正UI、再初期化ボタン、デバッグ表示ON/OFF
- PWA対応: Web App Manifest + Service Worker を追加し、GitHub Pages から「ホーム画面に追加」でインストール可能にする(scene_spec §4)
- カメラ使用中インジケーター(§13)
- 例外処理の総仕上げ(§12): 権限拒否時の案内+既定視点表示、端末回転時の再設定
- 性能調整: 入力解像度の動的調整で顔推定30fps・描画60fpsを目標(§9.3)

**確認**: 受入条件(§17)を実機で全項目チェック。

## 4. モジュール構成(仕様書 §10.2 準拠)

```text
src/
  camera/CameraInput.ts        Phase 1
  face/FaceDetector.ts         Phase 1
  face/TargetTracker.ts        Phase 4
  pose/EyePoseEstimator.ts     Phase 2
  pose/PoseFilter.ts           Phase 4
  display/DisplayCalibration.ts Phase 2
  render/OffAxisCamera.ts      Phase 3
  render/SceneRenderer.ts      Phase 3
  ui/AppUI.ts                  Phase 5
  main.ts                      アプリ統括・フレームループ
```

データフロー:
`CameraInput → FaceDetector → TargetTracker → EyePoseEstimator → PoseFilter → OffAxisCamera → SceneRenderer`

## 5. 主要リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| off-axis projection の座標系・符号ミス | 視差が不自然になり原因切り分けが困難 | Phase 3 で PC + マウス模擬視点のテストモードを先に作り、投影計算を顔検出と切り離して検証する |
| 単眼距離推定の誤差(§14) | 前後移動の視差スケールが狂う | 平均瞳孔間距離63mmを既定とし、Phase 5 の校正UIで補正 |
| 端末ごとの画面寸法・カメラ位置差(§14) | 視差の原点ずれ | MVPは手動設定+代表値。将来拡張で端末DB化(§16) |
| MediaPipe の推論負荷で低fps | 遅延100ms超(§9.3違反) | 入力解像度を段階的に下げる。GPU delegate 使用。検出は描画と非同期に回す |
| iOS Safari 固有の挙動(カメラ回転・バックグラウンド) | 実機で動かない | Phase 1 から iOS/Android 両実機で確認 |

## 6. マイルストーン

| M | 内容 | 目安 |
|---|---|---|
| M1 | Phase 0–1: 実機で顔検出が動く | 1.5日 |
| M2 | Phase 2–3: 運動視差が体験できる(MVPコア) | +3日 |
| M3 | Phase 4–5: 安定化+UI、受入条件クリア | +2.5日 |

合計目安: 実働 約7日

## 7. スコープ外(将来拡張 §16)

端末モデルDB、虹彩ベース注視推定、WebGPU、センサーフュージョン、外部ディスプレイ、立体視、タップでのターゲット指定などはMVP後に検討する。

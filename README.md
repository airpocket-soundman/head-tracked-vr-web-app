# Head Tracked VR Web App

スマートフォンのインカメラで観察者の目の3次元位置を推定し、off-axis projection(非対称透視投影)で「画面の奥に部屋がある」ような運動視差表示を行うWebアプリです(fish-tank VR / head-coupled perspective)。

**公開URL**: https://airpocket-soundman.github.io/head-tracked-vr-web-app/

## 使い方

1. スマホ(またはカメラ付きPC)のブラウザで上記URLを開く
2. 「カメラを開始」を押してカメラ権限を許可する
3. 顔を左右・上下・前後に動かすと、画面が仮想空間への窓のように見える

- カメラなしでも「カメラなしで試す」でマウス/タッチによる模擬視点を体験できます
- ⚙ から画面の物理幅・カメラ画角・瞳孔間距離などを校正できます
- 🐞 でデバッグ表示(検出状態、推定目位置、FPS)を確認できます
- スマホでは共有メニュー →「ホーム画面に追加」でPWAとしてインストールできます

カメラ映像・顔情報はすべて端末内で処理され、サーバーへ送信されません。

## 開発

```bash
npm install
npm run dev        # ローカル開発 (http)
npm run build      # 型チェック + ビルド
npm run preview    # ビルド結果の確認
```

スマホ実機からLAN経由でカメラを使うにはHTTPSが必要です:

```bash
HTTPS_DEV=1 npm run dev
```

(PowerShell では `$env:HTTPS_DEV='1'; npm run dev`)

`main` へのプッシュで GitHub Actions が自動的に GitHub Pages へデプロイします。

## ドキュメント

- [仕様書](docs/spec.md)
- [シーン・表示追加仕様](docs/scene_spec.md)
- [開発計画](docs/development_plan.md)
- [アセット調査](docs/assets.md)

## アーキテクチャ

```text
CameraInput → FaceDetector → TargetTracker → EyePoseEstimator
  → PoseFilter → OffAxisCamera → SceneRenderer
```

| モジュール | 役割 |
|---|---|
| [CameraInput](src/camera/CameraInput.ts) | インカメラ取得、バックグラウンド停止・復帰 |
| [FaceDetector](src/face/FaceDetector.ts) | MediaPipe Face Landmarker による最大3顔の検出 |
| [TargetTracker](src/face/TargetTracker.ts) | 最接近顔の選択、同一顔追跡、ヒステリシス付き切り替え |
| [EyePoseEstimator](src/pose/EyePoseEstimator.ts) | 両目中点の3次元位置推定(IPD基準の距離推定) |
| [PoseFilter](src/pose/PoseFilter.ts) | One Euro平滑化、外れ値除去、喪失時の維持・復帰 |
| [DisplayCalibration](src/display/DisplayCalibration.ts) | 表示領域の物理寸法・カメラ位置・ユーザー校正 |
| [OffAxisCamera](src/render/OffAxisCamera.ts) | 非対称視錐台の計算 |
| [SceneRenderer](src/render/SceneRenderer.ts) | ボックス状の部屋(奥行き=表示幅)とアバター描画 |
| [AppUI](src/ui/AppUI.ts) | 権限要求、状態表示、校正、デバッグ表示 |

同梱アセットのライセンスは [public/models/LICENSE.md](public/models/LICENSE.md) を参照してください。

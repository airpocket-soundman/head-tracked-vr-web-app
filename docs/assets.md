# 3Dアバターアセット調査(フリー素材)

調査日: 2026-08-03

表示対象となる「静止(リグ済みモデル)+動き(アニメーション)」を持つフリーの3Dアバター候補。

## 推奨: 候補A — Three.js 公式サンプル RobotExpressive

- 入手: three.js リポジトリ `examples/models/gltf/RobotExpressive/RobotExpressive.glb`
- ライセンス: CC0(作者 Tomás Laulhé による配布)
- 内容: 1つのGLBに Idle / Walking / Dance / Wave など複数アニメーション内蔵
- 利点: **GLB単体でThree.jsにそのまま読める。変換作業ゼロ、ライセンス問題ゼロ。MVPに最適**
- 欠点: ロボット風の見た目(人間型アバターではない)

## 候補B — Quaternius Universal Base Characters + Universal Animation Library

- 入手: [quaternius.com](https://quaternius.com/packs/universalanimationlibrary.html) / [itch.io](https://quaternius.itch.io/universal-animation-library)
- ライセンス: **CC0**(個人・商用とも無償、クレジット不要)
- 内容: 人型ベースキャラクター+120〜130種のアニメーション(Idle、歩行、ジェスチャー等)。glTF形式提供あり
- 利点: ローポリで軽量、モバイル向き。glTF直接提供
- 欠点: モデルとアニメーションの組み合わせ(リターゲット)が必要な場合がある

## 候補C — VRM(人間型アニメ調アバターが欲しい場合)

- モデル: [VRoid Project サンプルモデル](https://vroid.com/)(サンプルA/B/C等、商用利用可)。その他[無料VRM一覧](https://orecen.com/x-reality/free-vrm-3d-model/)
- モーション: [VRMアニメーション7種セット(.vrma) - VRoid Project - BOOTH](https://booth.pm/ja/items/5512385)(無料。挨拶、Vサイン、屈伸など7種)
- 実装: `@pixiv/three-vrm` ライブラリで Three.js 上に VRM + VRMA を再生可能
- 利点: 高品質な人間型アバター。日本製エコシステムで規約が明確
- 欠点: three-vrm 依存が増える。VRMはポリゴン数が多くモバイル負荷が高め。モデルごとに利用規約(VRMメタ情報)の確認が必要

## 候補D — Mixamo(Adobe)

- 入手: [mocaponline等でも紹介される定番](https://mocaponline.com/blogs/mocap-news/free-3d-animations)。Adobeアカウントで無料
- 内容: 多数の人型キャラクター+数千のモーション、自動リギング
- 欠点: FBX配布のため **Blender等でGLB変換が必要**。アセット単体の再配布は規約上不可(アプリ組み込みは可)

## 方針

1. **MVP(Phase 3)**: 候補A RobotExpressive を使用。単一GLB・CC0で即動く。Idleアニメーションをループ再生
2. **見た目強化(MVP後)**: 候補C VRM + VRMA へ差し替え、または候補B Quaternius の人型キャラを採用
3. リポジトリにはライセンス表記ファイル(`public/models/LICENSE.md`)を同梱する

## 出典

- [Universal Animation Library by Quaternius](https://quaternius.itch.io/universal-animation-library)
- [Universal Animation Library 2(CC0、130+モーション)](https://quaternius.com/packs/universalanimationlibrary2.html)
- [VRMアニメーション7種セット(.vrma) - BOOTH](https://booth.pm/ja/items/5512385)
- [VRM Animation (VRMA) v1.0 正式リリース](https://3dnchu.com/archives/vrm-animation-1-0/)
- [無料で使えるVRM 3Dアバター一覧](https://orecen.com/x-reality/free-vrm-3d-model/)
- [VRoid Studio プリセットモデル 商用可(ゲームメーカーズ)](https://gamemakers.jp/article/2024_12_27_89262/)
- [Free 3D Animations – MoCap Online](https://mocaponline.com/blogs/mocap-news/free-3d-animations)

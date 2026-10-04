# InkSynth Pads

用「畫畫」的方式做音樂的網頁音效板。在格子裡用畫筆畫出旋律和節奏，再用鍵盤即時演奏、疊加成一首曲子。

👉 **線上試玩：<https://inksynth-alpha.vercel.app/>**

不需要安裝任何東西，打開網頁就能玩，所有聲音都由瀏覽器的 Web Audio API 即時合成。

## 功能

- **音效板**：每一格對應一個鍵盤按鍵，按下就能播放；可以設定單次播放或循環播放。
- **畫筆編輯器**：在畫布上作畫就是在寫音樂。
  - 顏色 → 音色
  - 粗細 → 濾波器截止頻率（Filter Cutoff）
  - 濃度 → 力度（Velocity）
  - 筆鋒 → 包絡（Envelope）
  - 紋理 → 效果器
  - 下方節奏區點一下就能放鼓
- **疊合總覽**：把所有音效疊在同一張圖上，看清楚整首曲子的結構。
- **全域設定**：主音、音階、BPM，以及啟動時要不要對齊拍子或小節。
- **範本**：內建 15 套曲風範本，每套 40 格全滿（Lo-fi、Pop、House、和風、Blues、Chiptune、Ambient、Bossa Nova、City Pop、Synthwave、埃及阿拉伯、巴里島甘美朗等），任意疊加都在同一個小節線上對齊、和聲不打架。
- **存檔與音色庫**：會自動存在瀏覽器裡，也可以把音效板匯出成 `.json`，或從其他音效板匯入音色。

## 快捷鍵（編輯器）

| 按鍵 | 功能 |
| --- | --- |
| `Space` | 試聽／停止 |
| `Ctrl + Z` | 復原 |
| `Delete` | 刪除選取 |
| `Esc` | 返回 |

## 在本機執行

這是純靜態網站，直接用瀏覽器打開 `index.html` 就能使用。

如果想用本機伺服器開啟：

```bash
npx serve .
```

## 專案結構

```
├── index.html        # 主頁面
├── css/style.css     # 樣式
├── js/
│   ├── core.js       # 共用常數、資料結構
│   ├── audio.js      # 音訊合成與播放
│   ├── draw.js       # 畫布繪製
│   ├── board.js      # 音效板
│   ├── editor.js     # 畫筆編輯器
│   ├── overview.js   # 疊合總覽
│   ├── library.js    # 音色庫
│   └── main.js       # 介面、鍵盤、自動儲存、啟動
├── templates/        # 範本檔（manifest.js 是範本清單）
└── tools/            # 產生範本用的開發工具，網頁本身不會載入
    ├── build-templates.js  # 範本產生器（和聲、聲部進行、旋律、衝突檢查）
    ├── template-styles.js  # 各範本的設定：和弦進行、鼓型、音色、名稱
    └── build-bossa.js      # Bossa Nova 範本（手工編排）
```

### 重新產生內建範本

```bash
node tools/build-templates.js          # 全部重新產生
node tools/build-templates.js lofi pop # 只產生指定的範本
```

和弦進行寫在 `tools/template-styles.js`。產生器會擋下屬七、小大七、增、減、♭9 這類容易聽起來不協調的和弦（藍調例外），並且模擬所有循環同時播放、回報半音衝突的次數。

### 新增範本

1. 在網頁的「☰ 檔案 → 🧩 匯出成範本檔（.js）」匯出範本。
2. 把匯出的 `.js` 檔放進 `templates/` 資料夾。
3. 在 `templates/manifest.js` 的清單裡加上檔名（不含 `.js`）。

## 部署

透過 [Vercel](https://vercel.com) 部署。推送到 `main` 分支就會自動更新網站。

# 記帳本 開發守則

這份是給 Claude 看的。做畫面或功能前先讀一遍，不要憑印象做。

## 最重要的一條

**先找專案裡最像的現成畫面，照著它做，不要自己發明新樣式。** 使用者很在意畫面一致與細節，常常是「跟分類頁一樣就好」。

- 列表頁、拖曳排序、眼睛顯示隱藏：看分類頁 `CategoriesView.vue`
- 帳戶列表、按住拖曳：看 `AccountsView.vue`
- 簡單的新增、改名：看 `MembersView.vue`
- 置中小視窗：看 `LedgerPickSheet.vue` 的新增帳本視窗、`UiLayer.vue`
- 選擇或查看用的抽屜：看 `PickSheet.vue`

做完拿現成畫面並排比對，再交給使用者。

## 文字規則

- 畫面文字、說明、commit 訊息一律用繁體中文。
- **不要使用任何引號**（「」、『』、半形與全形的單雙引號），強調直接寫字。路徑用箭頭，操作步驟用粗體。
- 別加不必要的說明文字。使用者覺得多餘的說明（例如同步提示）就不要放。
- commit 訊息不寫檔名、元件名、函式名，用使用者看得到的功能描述。

## 版面與間距

- 內容區左右邊緣是同一條線：標題、輸入框、色票、列表的左右要貼齊，不要自己內縮。
- 列表卡片用 `card divide-y divide-line p-0`，每列 `flex items-center gap-2 p-3`。不要給每一列加底色，否則會蓋住卡片的圓角；只有拖曳中那一列才有底色。
- 圖示按鈕用 `icon-btn size-9`，圖示大小 18。它已經有 hover 和 `active:scale-95`，不要另外自己做按下效果。
- 按鈕的點擊區比圖示大，所以看起來的間距要扣掉點擊區的空白，左右才會對稱。改完要量，不要用猜的。
- 不要寫死高度去撐版面，也不要讓元素凸出圓角卡片外面。
- 有圓角的容器裡有捲動時，把捲動區包在 `overflow-hidden` 的圓角容器內。
- 要顯示選取外圈（ring）的元素，容器要留足夠的內距，不然會被裁掉。
- 內建的捲軸太醜時用 `scrollbar-none`，但只要內容需要捲動，就要讓使用者看得出來可以捲（例如露出下一列）。

## 元件慣例

- **新增**：頁面右上角用 `PageHeader` 的 `right` 插槽放 `circle-btn` 加號，點了開**置中小視窗**。視窗規格：`card w-full max-w-[21rem] space-y-5 p-5 shadow-xl`，標題 `text-lg font-bold`，輸入框之間 `space-y-3`，按鈕 `grid grid-cols-2 gap-2`（取消用 `btn-soft`，確認用 `btn-primary`）。
- **顯示或隱藏**：用眼睛 `Eye` 和 `EyeOff` 圖示，不要用開關。被隱藏的內容整列變淡。
- **分頁**：用 `PillTabs`。分頁只用來切換不同內容；表單裡二選一的選項不要用分頁，用左邊文字、右邊 `ToggleSwitch` 的一列（看 `AccountFormSheet.vue` 的封存）。
- **拖曳排序**：長按整列（約 0.4 秒）開始，不要放拖曳把手圖示。被拖的那一列只加邊框和浮起，不要把背景變藍：`rounded-2xl bg-surface shadow-xl ring-2 ring-primary`（首頁記錄列、分類、資產、幣別都一樣），加 `translateY` 跟著手指，其他列即時換位並有滑動動畫（`TransitionGroup` 的 `rows` 與 `still`）。手指拖曳時要擋住頁面捲動（`touchmove` 的 `preventDefault`）。程式照 `CategoriesView.vue` 的 `press`、`startDrag`、`frame` 寫。放列的卡片要加 `relative`，不然列的 `offsetTop` 會相對於 body，位置算錯。
- **可編輯的列**：右邊放鉛筆圖示按鈕（`Pencil`，跟分類頁一樣）開編輯，不要用點整列；內建項目沒有鉛筆。
- **下拉選擇**：不要用原生 `select`。用 `SelectField`；選項不多的欄位（例如幣別）加 `inline`，選項直接懸浮展開。放在抽屜裡面的一定要加，不要再開一層抽屜。
- **抽屜或置中視窗要想過再選，不要預設用抽屜**：
  - 置中小視窗：輸入東西用這個，例如新增、改名、改幾個名稱、確認。看 `LedgerPickSheet.vue` 的新增帳本視窗。內容多時，只讓中間的區域在視窗內捲動，標題和按鈕固定。
  - 抽屜：只用來選擇或查看，例如選項清單、詳細內容、很長要捲動的內容。不要拿來放輸入欄位。現有的帳戶、分類編輯還是抽屜，是舊做法，新畫面不要照抄。
  - 抽屜的細節（`BottomSheet`）：按鈕放 `footer` 插槽，會固定在底部並有漸層。內容底部要多留空間，不然最後一列會被漸層蓋住。
- 同一個畫面不要抽屜疊抽屜。

## 圖示與資料

- 圖示集中在 `src/lib/uiIcons.ts`，要新圖示就在那邊加。
- 新增一張資料表要改：`db/types.ts`（型別、`TableName`、`TABLES`、`TableMap`）、`db/index.ts`（升 Dexie 版本）、`stores/data.ts`（`live` 與回傳）。同步、備份、清除資料都靠 `TABLES`，不用另外改。
- 會跟著 Google 試算表同步的資料要放資料表，不要放 `stores/settings.ts`（那個只存本機）。
- 內建項目的使用者選擇（例如顯示或隱藏）用固定 id 存一筆，避免多台裝置各建一份。
- 預設幣別是可以更換的，程式裡讀 `baseCurrency`（`lib/currency.ts`），不要寫死 TWD；畫面上要說新台幣的地方用 `currencyName(baseCurrency)`，不要直接寫台幣。
- 不存匯率：帳本和帳戶可以各自是別的幣別，金額照那個幣別記，不換算。記錄選的帳戶幣別要跟帳本一樣，外幣帳本也可以不指定帳戶；外幣帳戶不計入資產總額。換匯用轉帳，填轉出和轉入兩個金額，匯率只是幫忙算另一個金額，不會存下來。算餘額和信用卡帳單用 `data.counted`，不要用 `data.records`。記錄列和首頁每天合計的金額不寫 `$`，靠顏色分辨收入支出；其他要顯示 `$` 的地方用 `MoneyText`，`$` 和數字固定隔 1px，不要自己拼 `$` 字串。金額不特別寫幣別；外幣帳戶的幣別用名稱旁的灰色標籤表示。

## 驗證

改了畫面就要自己在瀏覽器看，不要請使用者看：

- 型別：`npx vue-tsc --noEmit -p tsconfig.app.json`
- 測試：`npx vitest run`
- 預覽：`.claude/launch.json` 的 `dev`（port 5173）。
- Vue 範本編譯錯誤不會被型別檢查抓到，要看 dev server 日誌和瀏覽器 console。
- 量座標確認對齊，不要只憑截圖；改完要再截圖確認，尤其是拖曳、捲動、漸層、被擋住的地方。
- 自動操作瀏覽器時，抽屜可能會在熱更新後自己關掉，要重新開再看。

## 工具注意

- Tailwind 是 v4：important 寫在最後（`class-name!`）；同一個屬性的兩個 class 衝突時，看的是樣式表順序，不是 class 寫的順序。
- 同一個元素不能有兩個 `:class`（Vue 編譯會失敗），要合併成陣列。
- Prettier 會重排多行標籤，之後再用字串比對改檔案容易失敗；改前先看最新內容，或整份重寫。
- 在 bash 裡用很長的 heredoc 包 python 容易因為引號失敗，改成寫成檔案再執行。

## 提交

- 使用者確認訊息前不要 commit，也不要 push。
- 前綴用 `feat`、`fix`、`style`、`refactor`、`docs`、`test`、`chore`；不同類型分開 commit。
- 訊息格式與流程見 commit 技能。

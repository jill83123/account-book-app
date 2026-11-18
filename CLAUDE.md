# 記帳本 Agent 入口

這份是給 Claude 看的：先在這裡找到該看的檔案，再去讀那個檔案，不要全專案 grep。

## 維護規則

只要新增、刪除、改名檔案、路由、資料表、store 欄位、公開函式、設定項或指令，就在同一次改動內更新下面對應的那一行。

- 一行一個檔案，寫它負責什麼；只寫讀程式前就該知道的事，不抄實作。
- 檔案被刪或改名，這裡的那一行也要刪或改名；新檔案要補一行。
- 路由、資料表、store 欄位、公開函式、設定項、指令變了，改對應段落的那一行，不另開新段。
- 使用者看得到的功能有增減或改變（新功能、拿掉的功能、行為改變），或資料模型、產品決策變了，也要在同一次改動內對照更新 `README.md` 的功能清單與 `docs/DECISIONS.md`；只寫已存在於程式的內容，改前先對照程式確認。純畫面微調（顏色、間距）不用。
- 這份只放索引。做法與慣例寫在最後面的開發守則。

## 一、架構

技術：Vue 3、Vue Router（hash 模式）、Pinia、Dexie（IndexedDB）、Tailwind v4、vite-plugin-pwa。離線優先，資料先存本機，選配同步到使用者自己的 Google 雲端硬碟，同步與推播靠 `worker/`。

流程：`main.ts` 先跑種子資料與一次性遷移，再啟動 `stores/data.ts` 的即時查詢、`stores/sync.ts`、`stores/push.ts`，最後掛上路由。畫面讀 `stores/data.ts`，寫入走 `db/index.ts` 的 `save`、`saveMany`、`remove`，寫入後 `markLocalChange` 觸發自動同步。

- `index.html`：入口頁，主題色 meta 與 PWA 圖示連結。
- `src/main.ts`：啟動順序；依 `stores/settings.ts` 的旗標跑 `lib/seed.ts` 與 `lib/palette.ts` 的一次性遷移，再 `splitInstallmentPeriods`、`autoPostDue`。
- `src/App.vue`：外框、底部導覽（帳單、資產、統計、更多）與中間的新增鈕、更新提示、同步補齊遮罩；全域掛 `BatchBar`、`RecordSheet`、`UiLayer`。
- `src/router/index.ts`：路由表，hash 模式；`meta.nav` 為真才顯示底部導覽；不認得的路徑回首頁。
- `src/assets/main.css`：Tailwind 入口、色彩變數、共用 class、動畫，見第七節。
- `env.d.ts`：Vite 型別宣告。

### 路由

| 路徑 | 畫面 | 備註 |
| --- | --- | --- |
| `/` | `HomeView` | 底部導覽 |
| `/accounts` | `AccountsView` | 底部導覽 |
| `/stats` | `StatsView` | 底部導覽 |
| `/more` | `MoreView` | 底部導覽 |
| `/stats/settings` | `StatsSettingsView` | |
| `/more/ledgers` | `LedgersView` | |
| `/more/categories` | `CategoriesView` | |
| `/more/merchants` | `MerchantsView` | |
| `/more/currencies` | `CurrenciesView` | |
| `/more/members` | `MembersView` | |
| `/more/recurring` | `RecurringView` | 週期與分期，query id 開啟指定項目 |
| `/more/loans` | `LoansView` | query open 開啟指定借款 |
| `/more/amort` | `AmortView` | |
| `/more/ai` | `AiView` | |
| `/more/data` | `DataView` | 同步與備份 |
| `/reminders` | `RemindersView` | |
| `/search` | `SearchView` | |
| `/account/:id` | `AccountDetailView` | |
| `/record/:id` | `RecordEditView` | id 為 new 是新增，query date 帶日期、copy 帶複製來源 |

舊路徑的轉址：`/more/sync` 到 `/more/data`；`/more/daily`、`/more/appearance`、`/more/about`、`/more/general` 到 `/more`（每日提醒與外觀已經收進更多頁的展開列）。

## 二、資料層

- `src/db/types.ts`：所有資料表的型別、`TableName`、`TABLES`、`TableMap`；每筆都有 `id`、`updatedAt`、`deleted`（刪除是標記，好讓別台裝置知道）。
- `src/db/index.ts`：Dexie 資料庫 `account-book`（目前版本 6）；`save`、`saveMany`、`remove`（記錄被刪時同步刪它產生的借款）、`table`、`stamp`；`markLocalChange`、`lastLocalChange`、`CHANGE_EVENT`。
- `src/composables/useLiveQuery.ts`：把 Dexie 的 liveQuery 包成 Vue ref。

資料表（`TABLES`，同步、備份、清除都靠它）：

- `pinnedParts`：釘在歷史清單最上面的細項名稱，id 由名稱算出。
- `currencies`：自訂幣別、內建幣別的顯示與排序、以及預設幣別那一筆（固定 id `BASE_ROW_ID`）。
- `members`：成員（同行、分帳、借款的對象）。
- `accounts`：帳戶，kind 為 cash、bank、card、wallet，可封存、可不計入資產、可有自己的幣別，信用卡有結帳日與繳款日。
- `categories`：分類，kind 為 expense 或 income，`parentId` 為空是大分類，有預算與隱藏。
- `ledgers`：帳本，可有自己的幣別、預設帳戶與預算。
- `records`：記錄，type 為 expense、income、transfer；一筆有多個 `lines`（品項，含細項、攤提月數、分期期數）；另有 split、companions、adjust、toTotal。
- `merchants`：商家與記住的品項。
- `recurrings`：週期交易與分期（kind 區分）。
- `loans`：借款，含還款紀錄；分帳產生的借款用 `recordId` 連回記錄。

不在 `TABLES` 的本機表：`images`（記錄附圖，走 Drive 檔案同步，不進備份）、`imageTrash`（已刪除、等雲端副本也刪掉的圖）。

## 三、狀態（stores）

- `src/stores/data.ts`：`useData`；每張表的即時資料，`sortedAccounts`、`sortedLedgers`、`sortedCategories`、`sortedRecords`；對照表 `catMap`、`accMap`、`ledgerMap`、`merchantMap`、`memberMap`、`memberName`；`counted`（算餘額與帳單用）、`balances`、`ledgerId`、`writeLedgerId`、`ledgerRecords`、`childrenOf`、`catPath`、`catName`、`start`、`ready`。
- `src/stores/settings.ts`：`useSettings`；只存本機（localStorage 的 `ab.settings`），欄位見下；`stopSavingSettings` 在清除資料後擋住舊設定寫回。
- `src/stores/ui.ts`：`useUi`；`toasts`、`toast`、`dismiss`、`dialog`、`confirm`、`prompt`、`closeDialog`（給 `UiLayer`）；`draft`（掃描後交給編輯頁的草稿）；`selectedDate`（首頁選的日期）；`viewingId`、`viewRecord`（開記錄查看視窗）；`selecting`、`selectedIds`、`startSelect`、`stopSelect`、`toggleSelect`（批次選取）。
- `src/stores/sync.ts`：`useSync`；登入、中斷、同步、自動同步與補齊、雲端備份與還原、清除雲端；`unsynced`、`syncing`、`catchingUp`、`signedIn`、`backups`。
- `src/stores/push.ts`：`usePush`；背景推播的開啟、關閉、測試與提醒時段上傳。
- `src/stores/reminders.ts`：`useReminders`；`all`、`list`、`archive`、`archiveNow`、`forget`、`restore`；結束的提醒自動進封存。
- `src/stores/members.ts`：`useMembers`；`list`、`usage`、`nameOf`、`add`、`resolve`、`rename`、`remove`、`taken`、`takenHint`、`hasLoans`。
- `src/stores/pwa.ts`：`usePwa`；`needRefresh`、`update`（有新版本）、`checking`、`checkNow`、`installEvent`、`installed`、`isIos`、`install`（安裝到桌面）。

`settings.s` 的欄位：

- 外觀：`theme`、`themeColor`。
- 一次性遷移旗標：`palette`、`otherLast`、`ledgerTeal`、`incomeGroups`、`incomeInterest`、`catRefresh`、`seeded`。
- 同步：`workerUrl`、`syncFileId`、`spreadsheetId`、`lastSyncAt`、`lastAutoBackup`。
- AI 辨識：`geminiKey`、`geminiModel`、`scanMode`。
- 提醒與推播：`remindEnabled`、`remindTime`、`remindTimeAt`、`deviceId`、`remindOnElsewhere`、`remindHintDismissed`、`reminderSeen`、`reminderArchive`、`reminderHidden`。
- 記帳習慣：`ledgerId`、`lastAccountId`、`amortize`、`tipDrag`。

## 四、邏輯（lib）

純函式與一次性邏輯，不碰畫面。

- `src/lib/calc.ts`：餘額、信用卡帳期、`countedRecords`、攤提排程、借款未還、分類彙總、幣別判斷。
- `src/lib/money.ts`：金額格式、千分位、算式求值 `evalExpr`、平分。
- `src/lib/date.ts`：日期字串運算、月曆格、星期與相對日期標籤。
- `src/lib/currency.ts`：內建幣別清單、`baseCurrency`（預設幣別）、`setBaseCurrency`。
- `src/lib/customCurrency.ts`：自訂與內建幣別的合併清單、顯示與排序存取、`currencyName`、`baseName`。
- `src/lib/budget.ts`：分類與帳本每月預算的取得與預設。
- `src/lib/order.ts`：記錄排序 `compareRecords`（日期、當天手動順序、時間）。
- `src/lib/split.ts`：分帳份額、自己的支出 `myTotal`、別人付、依分帳建立或更新借款。
- `src/lib/recurrence.ts`：週期與分期的日期推算、自動入帳、待確認項目、產生記錄。
- `src/lib/reminders.ts`：提醒的組成與封存規則（每日、待確認、即將、信用卡、借款）。
- `src/lib/merchants.ts`：商家品項建議 `suggest`、記住品項 `learn`。
- `src/lib/itemNames.ts`：從記錄蒐集品項與細項名稱，含釘選。
- `src/lib/members.ts`：依名稱找或建成員。
- `src/lib/seed.ts`：預設分類與帳本、首次種子資料、預設分類的版本更新（`STARTER_VERSION`）與舊資料遷移。
- `src/lib/palette.ts`：分類配色遷移（`PALETTE_VERSION`）。
- `src/lib/demo.ts`：載入與判斷示範資料。
- `src/lib/backup.ts`：JSON 備份匯出、匯入與下載。
- `src/lib/csv.ts`：表格轉 CSV、`exportAllCsv`（表格來自 `lib/google/export.ts`）。
- `src/lib/images.ts`：記錄附圖的縮圖、存取、移除。
- `src/lib/gemini.ts`：發票辨識的提詞、解析、轉草稿、縮圖、呼叫與模型清單。
- `src/lib/push.ts`：瀏覽器推播訂閱、呼叫 Worker 的 `/push/*`。
- `src/lib/pushSlots.ts`：算出接下來 `DAYS_AHEAD` 天要發的提醒時段。
- `src/lib/banks.ts`：銀行與支付的清單、圖示路徑、`accountIcon`。
- `src/lib/colors.ts`：分類、帳戶、帳本用的色彩 `P` 與 `COLORS`（以主題藍轉色相而成）。
- `src/lib/themes.ts`：主題色清單 `THEMES`。
- `src/lib/icons.ts`：分類圖示（FontAwesome）清單、分組、`iconOf`。
- `src/lib/uiIcons.ts`：介面圖示（Lucide）統一出口，新圖示加在這裡；`Nav` 開頭的是底部導覽用。
- `src/lib/dragScroll.ts`：`vDragScroll` 指令，滑鼠拖曳橫向捲動。
- `src/lib/id.ts`：`uid`、`shuffle`。

雲端同步（`src/lib/google/`）：

- `gis.ts`：Google 登入與權杖（透過 Worker 換發長效授權）、`aiToken`。
- `drive.ts`：Drive 應用程式資料夾的讀寫、附圖檔案、備份檔案。
- `syncEngine.ts`：`runSync`，把本機與雲端同一份檔案逐筆合併，較新的 `updatedAt` 為準；也共享提醒設定。
- `imageSync.ts`：附圖雙向同步。
- `legacy.ts`：舊版試算表同步的資料搬遷，搬完不再使用。
- `export.ts`：把資料整理成表格欄位（供 CSV 匯出）。

## 五、畫面（views）

- `src/views/HomeView.vue`：首頁；帳單、月曆、月報三個視圖，同步狀態鈕、提醒入口、批次編輯、當天長按拖曳排序。
- `src/views/RecordEditView.vue`：新增、編輯、複製記錄；多品項分頁、細項、商家、分帳、同行、轉帳、週期與分期、攤提、附圖、掃描入口。最大的檔案，改動前先搜尋區塊。
- `src/views/SearchView.vue`：搜尋與篩選（關鍵字比對品項、商家、分類、備註；再篩分類、商家、帳戶、日期範圍），結果可選取。
- `src/views/StatsView.vue`：統計、預算、內容三個分頁；月、年、自訂範圍；圓環圖與分類明細。
- `src/views/StatsSettingsView.vue`：統計設定（攤提開關）。
- `src/views/AccountsView.vue`：資產總覽、帳戶列表（長按拖曳排序）、借款摘要、已封存帳戶。
- `src/views/AccountDetailView.vue`：單一帳戶的記錄、餘額調整。
- `src/views/MoreView.vue`：更多頁；各設定入口，每日提醒與外觀以展開列內嵌。
- `src/views/CategoriesView.vue`：分類管理；拖曳排序、隱藏、編輯，是列表頁的範本。
- `src/views/LedgersView.vue`：帳本管理、預算、預設帳戶、幣別。
- `src/views/MerchantsView.vue`：商家與品項管理、細項改名。
- `src/views/CurrenciesView.vue`：預設幣別、顯示與隱藏、自訂幣別、排序。
- `src/views/MembersView.vue`：成員新增與改名，簡單新增的範本。
- `src/views/RecurringView.vue`：週期交易與分期（兩個分頁）。
- `src/views/AmortView.vue`：攤提設定，挑一筆支出設定月數。
- `src/views/LoansView.vue`：借款三區（別人欠我、我欠別人、已結清）、還款。
- `src/views/RemindersView.vue`：提醒清單與已結束的封存。
- `src/views/DataView.vue`：同步與備份；Google 同步、備份、匯出表格、示範資料、重置。
- `src/views/AiView.vue`：Gemini 金鑰與模型設定、手動提詞。

## 六、元件（components）

抽屜與視窗：

- `src/components/BottomSheet.vue`：抽屜底座，插槽 `actions`、`search`、預設、`footer`；`fade` 控制底部漸層。
- `src/components/PickSheet.vue`：選項清單抽屜。
- `src/components/UiLayer.vue`：全域提示 `toast` 與確認或輸入對話框，置中小視窗的範本。
- `src/components/LedgerPickSheet.vue`：選帳本的抽屜，內含新增帳本的置中視窗。
- `src/components/CategoryPickerSheet.vue`：兩層選分類。
- `src/components/MerchantPickerSheet.vue`：選商家與新增。
- `src/components/CompanionSheet.vue`：選同行成員。
- `src/components/SplitSheet.vue`：設定分帳。
- `src/components/RepeatSheet.vue`：設定週期或分期。
- `src/components/BudgetSheet.vue`：改某月或每月預設預算（置中視窗）。
- `src/components/AccountFormSheet.vue`：帳戶新增與編輯（舊做法的抽屜）。
- `src/components/KeypadSheet.vue`：數字鍵盤。
- `src/components/DatePickerSheet.vue`、`src/components/TimePickerSheet.vue`：日期與時間選擇。
- `src/components/ScanSheet.vue`：發票掃描與貼回 AI 回覆。
- `src/components/RecordSheet.vue`：點記錄開的查看視窗，含編輯、複製、刪除；餘額調整記錄只能改金額與日期。
- `src/components/ImageViewer.vue`：附圖全螢幕檢視，縮放與拖曳。

列表與顯示：

- `src/components/RecordList.vue`：記錄列表，可選取、當天長按拖曳。
- `src/components/RecordCard.vue`：單筆記錄的一列。
- `src/components/BatchBar.vue`：批次編輯的底部操作列。
- `src/components/DonutChart.vue`：圓環圖。
- `src/components/CatIcon.vue`、`src/components/CatPath.vue`：分類圖示、分類路徑。
- `src/components/MoneyText.vue`：帶 `$` 的金額，`$` 與數字隔 1px。
- `src/components/MenuRow.vue`：更多頁的入口列與展開列。
- `src/components/PageHeader.vue`：頁首，插槽 `left`、`title`、`right`，貼頂。
- `src/components/MonthNav.vue`：月或年切換與選擇器。

輸入：

- `src/components/SelectField.vue`：下拉選擇，`inline` 為懸浮展開。
- `src/components/PillTabs.vue`：分頁切換。
- `src/components/ToggleSwitch.vue`：開關。
- `src/components/MoneyInput.vue`：金額輸入框，顯示千分位。
- `src/components/DateField.vue`、`src/components/TimeField.vue`：日期與時間欄位，點了開對應抽屜。

設定區塊：

- `src/components/AppearanceSettings.vue`：主題與主題色。
- `src/components/DailySettings.vue`：每日提醒開關與時間。

## 七、樣式

全部在 `src/assets/main.css`，用 Tailwind v4；深色模式靠根元素的 `dark` class（`@custom-variant dark`）。

顏色（CSS 變數，深色另有一組；Tailwind 名稱同變數去掉兩條線）：

- 主色 `primary`（由設定的主題色寫入）、`primary-soft`、`primary-strong`。
- 底色 `bg`、卡片 `surface`、次級 `surface-2`、文字 `ink`、淡字 `muted`、分隔線 `line`。
- 語意色 `expense`、`income`、`danger`、`success`、`warn`；月曆週日 `sun`、週六 `sat`。
- 分類、帳戶、帳本的顏色不寫死，從 `lib/colors.ts` 取。

共用 class（`@layer components`）：

- `card`；`circle-btn`、`icon-btn`（圓形圖示鈕）。
- `btn` 搭配 `btn-sm`、`btn-primary`、`btn-soft`、`btn-ghost`、`btn-delete`、`btn-danger`。
- `input`、`field`、`field-empty`、`label`、`chip`、`chip-on`、`tag`、`check`、`section-title`。
- 工具 class：`scrollbar-none`。

字型與字級：

- 字型 `--font-sans`：符號走 Chiron Hei HK（`Slash`），英數走 Inter，中文走 Chiron Hei HK；數字等寬。
- 字級只用 Tailwind 預設：`text-xs`（最多）、`text-sm`、`text-base`、`text-lg`（視窗標題）、`text-xl`（頁首標題）、`text-2xl`、`text-3xl`；不寫像素值。
- 粗細：`font-medium`、`font-semibold`、`font-bold`。

圓角：卡片 20px，視窗與按鈕 `rounded-2xl`，小元件 `rounded-xl`，圓形 `rounded-full`。

層級（z-index）：

- `z-10`：卡片內被拖的列、抽屜內的固定區。
- `z-20`：頁首與各頁的貼頂列。
- `z-30`：底部導覽、`SelectField` 的 `inline` 清單、編輯頁被拖曳中的品項分頁。
- `z-40`：抽屜與遮罩、批次操作列、一般置中視窗、更新提示。
- `z-50`：附圖檢視、同步補齊遮罩。
- `z-[55]`、`z-[60]`：疊在抽屜或另一個視窗上的置中視窗與全域對話框。
- `z-[70]`：`toast`。

動畫（class 名稱都在 `main.css`，搭配 Vue 的 `Transition`）：

- `fade`：遮罩與置中視窗淡入淡出，0.15 秒。
- `sheet`：抽屜與 toast 由下滑入，0.22 秒。
- `rows`：拖曳排序時列的換位滑動，0.2 秒；`still` 是不拖曳時用的無動畫版本。
- `tabs`：記錄編輯頁品項分頁的加入、移除與換位。
- 按下效果內建在 `btn`、`icon-btn`、`circle-btn`、`chip`、`field` 的 `active:scale-*`；轉圈用 `animate-spin`。
- `TimePickerSheet.vue` 內有自己的 `fade-y` 遮罩。

## 八、後端（worker）

Cloudflare Worker，用來保管 Google 用戶端密鑰、代理 Gemini、發送推播；不存金額與記錄。

- `worker/src/index.js`：入口與路由；`/config`、`/token`、`/refresh`、`/revoke`，其他轉給 `ai.js` 與 `push.js`；檢查 `ALLOWED_ORIGINS`。
- `worker/src/ai.js`：`/ai/models`、`/ai/generate`，用 Google 權杖驗證後轉給 Gemini，金鑰存在 Worker 的密鑰。
- `worker/src/push.js`：`/push/*`；每台裝置一個 Durable Object `PushDevice`，存訂閱與提醒時段，到時間自己醒來發送。
- `worker/wrangler.toml`：範例設定（佔位值）；實際值寫在被忽略的 `wrangler.local.toml`。
- `worker/scripts/deploy.mjs`：`npm run deploy`；檢查設定、部署時把推播私鑰改存成加密密鑰。
- `worker/scripts/gen-vapid.mjs`：產生推播金鑰並寫進本機設定，不印出。
- `worker/scripts/sync-config.mjs`：讓本機設定跟上範例，列出沒填的項目。
- `worker/package.json`、`worker/.gitignore`：Worker 自己的指令與忽略清單。
- `public/push-sw.js`：前端 service worker 內顯示推播與點擊開啟 App。

## 九、建置與設定

- `package.json`：指令 `dev`、`build`（型別檢查加建置）、`build-only`、`type-check`、`preview`、`test`、`test:watch`、`lint`（依序跑 `lint:oxlint` 與 `lint:eslint`，會自動修正）、`format`。
- `vite.config.ts`：別名 `@` 指向 `src`；`base` 為相對路徑；PWA 設定（`registerType: 'prompt'`、匯入 `push-sw.js`）；`__APP_VERSION__` 為建置日期；伺服器對區域網路開放。
- `vitest.config.ts`：測試跑在 node 環境，檔案在 `src/**/*.test.ts`，`__APP_VERSION__` 為 test。
- `tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`：型別設定，`tsconfig.app.json` 開了 `noUncheckedIndexedAccess`，不含測試檔。
- `eslint.config.ts`、`.oxlintrc.json`：lint 設定。
- `.prettierrc.json`、`.prettierignore`、`.editorconfig`、`.gitattributes`：格式與換行；Prettier 無分號、單引號、寬度 100。
- `.vscode/extensions.json`：建議的編輯器擴充。
- `.claude/launch.json`：預覽伺服器 `dev`，port 5173。
- `.github/workflows/deploy.yml`：推到 `main` 後測試、建置、部署到 GitHub Pages；只改文件、說明、編輯器與 lint 設定、`worker/` 時不觸發；可手動執行。
- `.gitignore`：忽略建置輸出、`*.local`、編輯器資料夾（`.vscode/extensions.json` 除外）。
- `public/banks/`：銀行與支付圖示（`NNN.jpg`，代碼對照 `lib/banks.ts`）。
- `public/icon.svg`、`public/icon-maskable.svg`、`public/apple-touch-icon.png`、`public/favicon.ico`：網站與 PWA 圖示。
- `README.md`：給人看的功能說明、快速開始、部署與同步設定步驟。

## 十、測試（src/__tests__）

用 Vitest，資料庫以 `fake-indexeddb` 取代；`setup.ts` 補上 localStorage 與 window 的最小替身，`helpers.ts` 有 `line`、`rec`、`account` 工廠。

- `budget.test.ts`：每月預算。
- `calc.test.ts`：餘額、帳單、攤提、借款。
- `csv.test.ts`：CSV 輸出。
- `date.test.ts`：日期運算。
- `db.test.ts`：存、刪、時間戳。
- `demo.test.ts`：示範資料。
- `members.test.ts`：成員。
- `money.test.ts`：金額與算式。
- `order.test.ts`：記錄排序。
- `palette.test.ts`：配色遷移。
- `recurrence.test.ts`：週期與分期。
- `reminderShare.test.ts`：同步時提醒設定的合併。
- `seed.test.ts`：種子資料與遷移。
- `split.test.ts`：分帳。

---

# 開發守則

做畫面或功能前先讀一遍，不要憑印象做。

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
- **除了路徑，不要使用任何引號**（「」、『』、半形與全形的單雙引號），強調直接寫字。
- 路徑（例如更多 → 攤提）用箭頭連接，整段用「」包起來，不要加粗體。
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

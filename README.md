# 資訊安全單選題刷題網站

這是一個純 HTML、CSS、JavaScript 與 Python 製作的本機刷題網站。題庫來源是 Word `.docx` 或 `.doc` 檔，轉換後會產生 `data/questions.json`。

## 檔案結構

```text
docs/                         原始 Word 題庫
data/questions.json           轉換後題庫
data/parse_errors.txt         無法解析的段落
scripts/convert_doc_to_json.py 題庫轉換程式
index.html                    刷題網站
style.css                     RWD 樣式
app.js                        刷題邏輯與 localStorage 進度
```

## 如何放入 Word 題庫

把依章節整理好的 `.docx` 或 `.doc` 檔放進 `docs/` 資料夾。

建議每題格式如下：

```text
題目文字
(A) 選項 A (B) 選項 B (C) 選項 C (D) 選項 D
正確答案：B
```

題目不需要題號，轉換時會依照檔案章節順序與題目出現順序自動產生 `question_id`，例如 `CH01_Q001`、`CH01_Q002`、`CH02_Q001`。

## 如何執行轉換程式

在專案資料夾執行：

```powershell
py scripts/convert_doc_to_json.py
```

如果電腦沒有安裝 Python，但你是在 Codex 工作區中，可以使用 bundled Python：

```powershell
& "C:\Users\ANNA\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts/convert_doc_to_json.py
```

轉換完成後會產生：

```text
data/questions.json
data/parse_errors.txt
```

如果 `parse_errors.txt` 顯示無法解析的段落，請檢查該段題目是否缺少四個選項或答案。

## 如何啟動刷題網站

建議用本機伺服器開啟，避免瀏覽器阻擋 `questions.json`：

```powershell
& "C:\Users\ANNA\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 8000
```

然後在瀏覽器開啟：

```text
http://localhost:8000
```

## 如何在手機或平板使用

讓手機、平板和電腦連到同一個 Wi-Fi。電腦執行本機伺服器後，查詢電腦的區域網路 IP，再用手機或平板開啟：

```text
http://電腦IP:8000
```

例如：

```text
http://192.168.1.20:8000
```

## localStorage 進度儲存說明

網站會使用瀏覽器的 `localStorage` 保存練習進度，包含：

- 已作答題目
- 答對題目
- 錯題
- 每題答對次數
- 錯題連續答對次數
- 最近練習時間

同一台裝置、同一個瀏覽器重新開啟後，進度會保留。換裝置或換瀏覽器時，進度不會自動同步。

## 如何重置進度

在首頁右上角點選「重置進度」。系統會連續確認兩次，確認後會清除目前瀏覽器保存的所有練習紀錄。

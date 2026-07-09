# 補充規格：純文字知識庫上傳與知識庫優先回答功能

## 1. 新增功能目標

在原本 Gemini Static Chatbot 中新增「純文字知識庫」功能。使用者可以上傳 `.txt` 或 `.md` 檔案，系統會在瀏覽器端讀取文字內容，並在使用者提問時，優先依據上傳的文字內容回答。

本功能必須維持純前端架構，不使用後端伺服器、不使用資料庫、不將檔案上傳至任何第三方伺服器。

---

## 2. 技術限制

1. 僅使用 HTML、CSS、JavaScript。
2. 可部署於 GitHub Pages。
3. 上傳檔案只在使用者瀏覽器中處理。
4. 不得將使用者上傳的知識庫檔案儲存到 GitHub。
5. 不得將知識庫檔案上傳到網站伺服器。
6. 只有在呼叫 Gemini API 時，才將與問題相關的知識片段放入 prompt 中送出。
7. 第一版僅支援純文字檔案，不處理 PDF、Word、PowerPoint、Excel。

---

## 3. 支援檔案格式

第一版支援：

```text
.txt
.md
```

可接受 MIME type：

```text
text/plain
text/markdown
```

若使用者上傳不支援的格式，請顯示：

```text
目前僅支援 .txt 或 .md 純文字檔案。
```

---

## 4. 知識庫上傳區 UI

請在設定區新增「知識庫」區塊，包含：

1. 檔案上傳欄位
2. 目前載入的檔名
3. 文字總字數
4. 知識片段數
5. 清除知識庫按鈕
6. 回答模式選擇

回答模式包含：

```text
優先根據知識庫，必要時可用模型補充
嚴格限制在知識庫範圍內回答
```

預設使用：

```text
優先根據知識庫，必要時可用模型補充
```

---

## 5. 前端狀態管理

請在 `app.js` 中新增以下狀態：

```js
let knowledgeBaseText = "";
let knowledgeChunks = [];
let knowledgeFileName = "";
let answerMode = "knowledge_first";
```

其中 `answerMode` 可用：

```js
"knowledge_first" // 優先根據知識庫，必要時可用模型補充
"strict_knowledge" // 嚴格限制在知識庫範圍內回答
```

知識片段格式：

```js
{
  id: number,
  source: string,
  text: string,
  score: number
}
```

---

## 6. 檔案讀取規格

使用 `FileReader` 在瀏覽器端讀取檔案。

流程如下：

```text
使用者選擇檔案
        ↓
檢查副檔名與 MIME type
        ↓
用 FileReader.readAsText(file) 讀取文字
        ↓
儲存原始文字到 knowledgeBaseText
        ↓
呼叫 splitKnowledgeText() 切段
        ↓
更新畫面顯示檔名、字數、片段數
```

若讀取失敗，顯示：

```text
檔案讀取失敗，請確認檔案是否為純文字格式。
```

---

## 7. 知識庫切段規格

請建立函式：

```js
function splitKnowledgeText(text, fileName) {}
```

建議參數：

```js
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
```

切段規則：

1. 每段約 1000 字。
2. 每段與前一段重疊約 150 字。
3. 去除過多空白。
4. 空段落不加入 knowledgeChunks。
5. 每個 chunk 需保留來源檔名。

---

## 8. 知識片段搜尋規格

請建立函式：

```js
function retrieveRelevantChunks(question, chunks, topK = 5) {}
```

搜尋策略第一版使用簡易關鍵字比對，不使用 embedding。

處理流程：

1. 將使用者問題轉小寫。
2. 移除常見標點符號。
3. 切成關鍵字。
4. 過濾太短的字詞。
5. 計算每個 chunk 中命中的關鍵字數量。
6. 依分數排序。
7. 回傳分數最高的前 5 段。
8. 若所有片段分數皆為 0，仍可回傳前 1～2 段，或在 prompt 中標示「未找到明確相關片段」。

---

## 9. Prompt 組裝規格

請建立函式：

```js
function buildPromptWithKnowledge(question, relevantChunks, answerMode, systemPrompt) {}
```

當知識庫存在時，送給 Gemini 的使用者內容應包含：

```text
你是一個根據使用者上傳知識庫回答問題的 AI 助手。

請遵守以下規則：
1. 請優先根據「知識庫內容」回答。
2. 如果知識庫內容足夠，請不要自行延伸。
3. 回答時盡量指出依據來自哪個知識片段。
4. 如果回答模式允許補充，且知識庫內容不足，可以使用模型一般知識補充。
5. 只要使用了知識庫以外的內容，回答最後必須加註：
「補充說明：以上部分內容超出上傳知識庫範圍，已使用模型一般知識補充。」
6. 如果回答模式是嚴格限制在知識庫範圍，且知識庫不足，請回答：
「根據目前上傳的知識庫，無法確認這個問題的答案。」

【回答模式】
{{answerModeLabel}}

【知識庫內容】
{{relevantChunksText}}

【使用者問題】
{{question}}
```

---

## 10. 無知識庫時的行為

若使用者尚未上傳知識庫，聊天功能仍可正常使用 Gemini 模型。

此時不需要加入知識庫 prompt，只使用一般 chatbot 模式。

可以在聊天區顯示淡色提示：

```text
目前尚未載入知識庫，AI 將使用一般模型能力回答。
```

---

## 11. 有知識庫時的回答要求

當使用者已上傳知識庫時，AI 回答需符合以下規則：

### 11.1 知識庫足夠回答

回答格式：

```text
根據上傳知識庫，……
```

可加上：

```text
依據：example.txt，片段 2
```

### 11.2 知識庫部分不足，但允許模型補充

回答格式：

```text
根據上傳知識庫，……

補充說明：以上部分內容超出上傳知識庫範圍，已使用模型一般知識補充。
```

### 11.3 嚴格知識庫模式且資料不足

回答格式：

```text
根據目前上傳的知識庫，無法確認這個問題的答案。
```

---

## 12. 清除知識庫

請提供「清除知識庫」按鈕。

點擊後需清除：

```js
knowledgeBaseText = "";
knowledgeChunks = [];
knowledgeFileName = "";
```

並更新 UI：

```text
目前未載入知識庫
```

---

## 13. localStorage 規格

第一版不建議將知識庫全文存入 localStorage，原因是：

1. 檔案可能過大。
2. localStorage 容量有限。
3. 使用者可能誤以為檔案已安全儲存。
4. 知識庫內容可能包含敏感資料。

可以只儲存回答模式：

```text
gemini_chatbot_answer_mode
```

不要儲存：

```text
knowledgeBaseText
knowledgeChunks
```

重新整理網頁後，使用者需要重新上傳知識庫。

---

## 14. 安全與隱私提醒

請在知識庫上傳區顯示：

```text
提醒：上傳的檔案只會在你的瀏覽器中讀取與切段，不會儲存在本網站伺服器。當你向 AI 提問時，系統會把與問題相關的文字片段連同問題送到 Gemini API 進行回答。請勿上傳高度敏感或不應提供給第三方 AI 服務的資料。
```

---

## 15. 驗收條件

完成後需符合以下條件：

1. 可上傳 `.txt` 檔案。
2. 可上傳 `.md` 檔案。
3. 上傳後能顯示檔名、字數、知識片段數。
4. 使用者提問時，系統會選出相關知識片段。
5. Gemini 回答會優先根據知識庫內容。
6. 若超出知識庫內容，回答會加註補充說明。
7. 嚴格知識庫模式下，若資料不足，AI 不得使用一般知識補充。
8. 可清除知識庫。
9. 重新整理後不自動保留知識庫全文。
10. GitHub Pages 部署後可正常使用。

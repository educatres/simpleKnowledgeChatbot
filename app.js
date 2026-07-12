const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const GOOGLE_MAX_OUTPUT_TOKENS = 8192;
const TYPEWRITER_CHARS_PER_FRAME = 3;
const ANSWER_MODE_STORAGE_KEY = "cgu_chatbot_answer_mode";
const TOOL_PANEL_STORAGE_KEY = "knowledge_chatbot_tool_panel_collapsed";
const PROVIDERS = {
  cgu: {
    label: "CGU",
    apiKeyLabel: "CGU API Key",
    apiKeyPlaceholder: "輸入你的 CGU API Key",
    endpoint: "https://air.cgu.edu.tw/cgullmapi/v1",
    models: ["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"],
    type: "responses",
  },
  openai: {
    label: "OpenAI",
    apiKeyLabel: "OpenAI API Key",
    apiKeyPlaceholder: "輸入你的 OpenAI API Key",
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-5.1", "gpt-5.1-mini", "gpt-4.1"],
    type: "responses",
  },
  google: {
    label: "Google AI Studio",
    apiKeyLabel: "Google AI Studio API Key",
    apiKeyPlaceholder: "輸入你的 Google AI Studio API Key",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    type: "google_generate_content",
  },
  claude: {
    label: "Claude",
    apiKeyLabel: "Claude API Key",
    apiKeyPlaceholder: "輸入你的 Claude API Key",
    endpoint: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
    type: "claude_messages",
  },
};

let knowledgeBaseText = "";
let knowledgeChunks = [];
let knowledgeFileName = "";
let answerMode = "knowledge_first";
let isToolPanelCollapsed = false;
let isSettingsLocked = false;

const appShell = document.querySelector("#appShell");
const apiKeyInput = document.querySelector("#apiKeyInput");
const apiKeyLabel = document.querySelector("#apiKeyLabel");
const providerSelect = document.querySelector("#providerSelect");
const endpointInput = document.querySelector("#endpointInput");
const modelSelect = document.querySelector("#modelSelect");
const customModelInput = document.querySelector("#customModelInput");
const systemPromptInput = document.querySelector("#systemPromptInput");
const generateStudentLinkButton = document.querySelector("#generateStudentLinkButton");
const studentLinkOutput = document.querySelector("#studentLinkOutput");
const copyStudentLinkButton = document.querySelector("#copyStudentLinkButton");
const studentQrCode = document.querySelector("#studentQrCode");
const knowledgeToggleButton = document.querySelector("#knowledgeToggleButton");
const knowledgeSettingsContent = document.querySelector("#knowledgeSettingsContent");
const knowledgeFileInput = document.querySelector("#knowledgeFileInput");
const knowledgeFileNameEl = document.querySelector("#knowledgeFileName");
const knowledgeCharCountEl = document.querySelector("#knowledgeCharCount");
const knowledgeChunkCountEl = document.querySelector("#knowledgeChunkCount");
const answerModeSelect = document.querySelector("#answerModeSelect");
const clearKnowledgeButton = document.querySelector("#clearKnowledgeButton");
const clearChatButton = document.querySelector("#clearChatButton");
const settingsToggleButton = document.querySelector("#settingsToggleButton");
const studentKnowledgeBox = document.querySelector("#studentKnowledgeBox");
const studentKnowledgeToggleButton = document.querySelector("#studentKnowledgeToggleButton");
const studentKnowledgeContent = document.querySelector("#studentKnowledgeContent");
const studentKnowledgeFileInput = document.querySelector("#studentKnowledgeFileInput");
const studentKnowledgeFileNameEl = document.querySelector("#studentKnowledgeFileName");
const studentKnowledgeCharCountEl = document.querySelector("#studentKnowledgeCharCount");
const studentKnowledgeChunkCountEl = document.querySelector("#studentKnowledgeChunkCount");
const studentAnswerModeSelect = document.querySelector("#studentAnswerModeSelect");
const studentClearKnowledgeButton = document.querySelector("#studentClearKnowledgeButton");
const studentKnowledgeHint = document.querySelector("#studentKnowledgeHint");
const chatHint = document.querySelector("#chatHint");
const messages = document.querySelector("#messages");
const chatForm = document.querySelector("#chatForm");
const questionInput = document.querySelector("#questionInput");
const sendButton = document.querySelector("#sendButton");

init();

function init() {
  const savedAnswerMode = localStorage.getItem(ANSWER_MODE_STORAGE_KEY);
  if (savedAnswerMode === "knowledge_first" || savedAnswerMode === "strict_knowledge") {
    answerMode = savedAnswerMode;
  }
  isToolPanelCollapsed = localStorage.getItem(TOOL_PANEL_STORAGE_KEY) !== "false";

  answerModeSelect.value = answerMode;
  studentAnswerModeSelect.value = answerMode;
  updateProviderUi(providerSelect.value);
  applyUrlSettings();
  updateToolPanelUi();
  updateKnowledgeUi();

  providerSelect.addEventListener("change", handleProviderChange);
  generateStudentLinkButton.addEventListener("click", generateStudentLink);
  copyStudentLinkButton.addEventListener("click", copyStudentLink);
  knowledgeToggleButton.addEventListener("click", toggleKnowledgeSettings);
  studentKnowledgeToggleButton.addEventListener("click", toggleStudentKnowledgeSettings);
  settingsToggleButton.addEventListener("click", toggleToolPanel);
  knowledgeFileInput.addEventListener("change", handleKnowledgeFileChange);
  studentKnowledgeFileInput.addEventListener("change", handleKnowledgeFileChange);
  answerModeSelect.addEventListener("change", handleAnswerModeChange);
  studentAnswerModeSelect.addEventListener("change", handleAnswerModeChange);
  clearKnowledgeButton.addEventListener("click", clearKnowledgeBase);
  studentClearKnowledgeButton.addEventListener("click", clearKnowledgeBase);
  clearChatButton.addEventListener("click", clearChat);
  chatForm.addEventListener("submit", handleChatSubmit);
  questionInput.addEventListener("keydown", handleQuestionKeydown);
}

function handleKnowledgeFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!isSupportedKnowledgeFile(file)) {
    showMessage("目前僅支援 .txt 或 .md 純文字檔案。", "error");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    knowledgeBaseText = String(reader.result || "");
    knowledgeFileName = file.name;
    knowledgeChunks = splitKnowledgeText(knowledgeBaseText, knowledgeFileName);
    updateKnowledgeUi();
    showMessage(`已載入知識庫：${knowledgeFileName}，共 ${knowledgeChunks.length} 個片段。`, "system");
  };

  reader.onerror = () => {
    showMessage("檔案讀取失敗，請確認檔案是否為純文字格式。", "error");
  };

  reader.readAsText(file);
}

function isSupportedKnowledgeFile(file) {
  const lowerName = file.name.toLowerCase();
  const hasSupportedExtension = lowerName.endsWith(".txt") || lowerName.endsWith(".md");
  const hasSupportedMime =
    file.type === "" || file.type === "text/plain" || file.type === "text/markdown";

  return hasSupportedExtension && hasSupportedMime;
}

function splitKnowledgeText(text, fileName) {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const chunks = [];
  let start = 0;
  let id = 1;

  while (start < normalizedText.length) {
    let end = Math.min(start + CHUNK_SIZE, normalizedText.length);

    if (end < normalizedText.length) {
      const nextBreak = normalizedText.lastIndexOf("\n", end);
      const nextSentence = Math.max(
        normalizedText.lastIndexOf("。", end),
        normalizedText.lastIndexOf(".", end),
        normalizedText.lastIndexOf("！", end),
        normalizedText.lastIndexOf("？", end),
        normalizedText.lastIndexOf("!", end),
        normalizedText.lastIndexOf("?", end)
      );
      const preferredBreak = Math.max(nextBreak, nextSentence);

      if (preferredBreak > start + CHUNK_SIZE * 0.5) {
        end = preferredBreak + 1;
      }
    }

    const chunkText = normalizedText.slice(start, end).replace(/\n{3,}/g, "\n\n").trim();

    if (chunkText) {
      chunks.push({
        id,
        source: fileName,
        text: chunkText,
        score: 0,
      });
      id += 1;
    }

    if (end >= normalizedText.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }

  return chunks;
}

function retrieveRelevantChunks(question, chunks, topK = 5) {
  const keywords = tokenize(question);

  if (!chunks.length) return [];

  if (!keywords.length) {
    return chunks.slice(0, Math.min(2, chunks.length)).map((chunk) => ({ ...chunk, score: 0 }));
  }

  const scoredChunks = chunks.map((chunk) => {
    const normalizedChunk = normalizeForSearch(chunk.text);
    const score = keywords.reduce((total, keyword) => {
      return total + (normalizedChunk.includes(keyword) ? 1 : 0);
    }, 0);

    return { ...chunk, score };
  });

  scoredChunks.sort((a, b) => b.score - a.score || a.id - b.id);

  if (scoredChunks[0]?.score === 0) {
    return scoredChunks.slice(0, Math.min(2, scoredChunks.length));
  }

  return scoredChunks.filter((chunk) => chunk.score > 0).slice(0, topK);
}

function buildPromptWithKnowledge(question, relevantChunks, currentAnswerMode, systemPrompt) {
  const answerModeLabel =
    currentAnswerMode === "strict_knowledge"
      ? "嚴格限制在知識庫範圍內回答"
      : "優先根據知識庫，必要時可用模型補充";
  const relevantChunksText = relevantChunks.length
    ? relevantChunks
        .map((chunk) => {
          const relevanceNote = chunk.score > 0 ? `相關分數：${chunk.score}` : "未找到明確相關片段";
          return `來源：${chunk.source}，片段 ${chunk.id}，${relevanceNote}\n${chunk.text}`;
        })
        .join("\n\n---\n\n")
    : "未找到明確相關片段。";

  return `${systemPrompt.trim() ? `${systemPrompt.trim()}\n\n` : ""}你是一個根據使用者上傳知識庫回答問題的 AI 助手。

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
${answerModeLabel}

【知識庫內容】
${relevantChunksText}

【使用者問題】
${question}`;
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const question = questionInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const provider = getSelectedProvider();
  const endpoint = endpointInput.value.trim();
  const model = getSelectedModel();

  if (!question) return;

  if (!apiKey) {
    showMessage(`請先輸入 ${provider.apiKeyLabel}。`, "error");
    apiKeyInput.focus();
    return;
  }

  if (!endpoint) {
    showMessage("請先輸入 API endpoint。", "error");
    endpointInput.focus();
    return;
  }

  if (!model) {
    showMessage("請先選擇或輸入模型名稱。", "error");
    customModelInput.focus();
    return;
  }

  showMessage(question, "user");
  questionInput.value = "";
  setSendingState(true);

  const pendingMessage = showMessage("正在思考...", "assistant");
  const pendingMessageBody = pendingMessage.querySelector(".message-body");
  pendingMessage.classList.add("streaming");

  try {
    const prompt = buildPrompt(question);
    let hasStreamedText = false;
    const answer = await callProviderApi({
      prompt,
      apiKey,
      model,
      endpoint,
      provider,
      onTextDelta: (text) => {
        if (!hasStreamedText) {
          pendingMessageBody.textContent = "";
          hasStreamedText = true;
        }

        pendingMessageBody.textContent += text;
        messages.scrollTop = messages.scrollHeight;
      },
    });

    if (!hasStreamedText) {
      await typeText(pendingMessageBody, answer);
    }
  } catch (error) {
    pendingMessage.classList.add("error");
    pendingMessageBody.textContent =
      error instanceof Error ? error.message : `${provider.label} API 呼叫失敗，請稍後再試。`;
  } finally {
    pendingMessage.classList.remove("streaming");
    setSendingState(false);
  }
}

function buildPrompt(question) {
  const systemPrompt = systemPromptInput.value;

  if (!knowledgeChunks.length) {
    return systemPrompt.trim() ? `${systemPrompt.trim()}\n\n${question}` : question;
  }

  const relevantChunks = retrieveRelevantChunks(question, knowledgeChunks, 5);
  return buildPromptWithKnowledge(question, relevantChunks, answerMode, systemPrompt);
}

async function callProviderApi({ prompt, apiKey, model, endpoint, provider, onTextDelta }) {
  if (provider.type === "google_generate_content") {
    return callGoogleAiStudioApi(prompt, apiKey, model, endpoint, provider.label, onTextDelta);
  }

  if (provider.type === "claude_messages") {
    return callClaudeApi(prompt, apiKey, model, endpoint, provider.label, onTextDelta);
  }

  return callResponsesApi(prompt, apiKey, model, endpoint, provider.label, onTextDelta);
}

async function callResponsesApi(prompt, apiKey, model, endpoint, providerLabel, onTextDelta) {
  const responseEndpoint = `${normalizeEndpoint(endpoint)}/responses`;

  const response = await fetch(responseEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      stream: Boolean(onTextDelta),
    }),
  });

  if (isSseResponse(response) && onTextDelta && response.body) {
    const streamedText = await readSseStream(response, (data) => {
      const delta =
        data.type === "response.output_text.delta"
          ? data.delta
          : data.type === "response.refusal.delta"
            ? data.delta
            : "";

      if (delta) {
        onTextDelta(delta);
      }

      return delta;
    });

    if (streamedText) return streamedText;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = data?.error?.message ? `：${data.error.message}` : "";
    throw new Error(`${providerLabel} API 呼叫失敗${apiMessage}`);
  }

  const answer = extractResponsesAnswerText(data);

  if (!answer) {
    throw new Error(`${providerLabel} API 沒有回傳可顯示的回答。`);
  }

  return answer;
}

async function callGoogleAiStudioApi(prompt, apiKey, model, endpoint, providerLabel, onTextDelta) {
  const methodName = onTextDelta ? "streamGenerateContent?alt=sse" : "generateContent";
  const responseEndpoint = `${normalizeEndpoint(endpoint)}/models/${encodeURIComponent(
    model
  )}:${methodName}`;

  const response = await fetch(responseEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: GOOGLE_MAX_OUTPUT_TOKENS,
      },
    }),
  });

  if (isSseResponse(response) && onTextDelta && response.body) {
    let finishReason = "";
    const streamedText = await readSseStream(response, (data) => {
      const candidate = data?.candidates?.[0];
      finishReason = candidate?.finishReason || finishReason;
      const delta = extractGoogleCandidateText(candidate);

      if (delta) {
        onTextDelta(delta);
      }

      return delta;
    });

    if (streamedText) {
      return appendMaxTokensWarning(streamedText, finishReason);
    }
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = data?.error?.message ? `：${data.error.message}` : "";
    throw new Error(`${providerLabel} API 呼叫失敗${apiMessage}`);
  }

  const candidate = data?.candidates?.[0];
  const answer = extractGoogleCandidateText(candidate).trim();

  if (!answer) {
    throw new Error(`${providerLabel} API 沒有回傳可顯示的回答。`);
  }

  return appendMaxTokensWarning(answer, candidate?.finishReason);
}

async function callClaudeApi(prompt, apiKey, model, endpoint, providerLabel, onTextDelta) {
  const responseEndpoint = `${normalizeEndpoint(endpoint)}/messages`;

  const response = await fetch(responseEndpoint, {
    method: "POST",
    headers: {
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      stream: Boolean(onTextDelta),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (isSseResponse(response) && onTextDelta && response.body) {
    const streamedText = await readSseStream(response, (data) => {
      const delta = data.type === "content_block_delta" ? data.delta?.text || "" : "";

      if (delta) {
        onTextDelta(delta);
      }

      return delta;
    });

    if (streamedText) return streamedText;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = data?.error?.message ? `：${data.error.message}` : "";
    throw new Error(`${providerLabel} API 呼叫失敗${apiMessage}`);
  }

  const answer = data?.content
    ?.map((content) => content.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error(`${providerLabel} API 沒有回傳可顯示的回答。`);
  }

  return answer;
}

async function readSseStream(response, handleData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n|\r\n\r\n/);
    buffer = events.pop() || "";

    for (const eventText of events) {
      const delta = parseSseEvent(eventText, handleData);
      if (delta) fullText += delta;
    }
  }

  if (buffer.trim()) {
    const delta = parseSseEvent(buffer, handleData);
    if (delta) fullText += delta;
  }

  return fullText.trim();
}

function parseSseEvent(eventText, handleData) {
  const dataLines = eventText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());

  let fullDelta = "";

  for (const dataLine of dataLines) {
    if (!dataLine || dataLine === "[DONE]") continue;

    try {
      const data = JSON.parse(dataLine);
      fullDelta += handleData(data) || "";
    } catch (error) {
      // Ignore malformed stream chunks and keep reading the rest of the response.
    }
  }

  return fullDelta;
}

function extractGoogleCandidateText(candidate) {
  return (
    candidate?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || ""
  );
}

function appendMaxTokensWarning(answer, finishReason) {
  if (finishReason !== "MAX_TOKENS") return answer;

  return `${answer}\n\n提醒：Google AI Studio 回覆達到目前輸出上限，內容可能仍被截斷。你可以要求模型「繼續」或把問題拆小一點。`;
}

function extractResponsesAnswerText(data) {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }

  const outputText = data?.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text || content.value || "")
    .join("")
    .trim();

  if (outputText) return outputText;

  return (
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.text ||
    ""
  ).trim();
}

function normalizeEndpoint(endpoint) {
  return endpoint.replace(/\/+$/, "");
}

function isSseResponse(response) {
  return response.ok && response.headers.get("content-type")?.includes("text/event-stream");
}

function getSelectedProvider() {
  return PROVIDERS[providerSelect.value] || PROVIDERS.cgu;
}

function getSelectedModel() {
  return customModelInput.value.trim() || modelSelect.value;
}

function handleProviderChange(event) {
  updateProviderUi(event.target.value);
}

function toggleKnowledgeSettings() {
  const willShow = knowledgeSettingsContent.hidden;
  knowledgeSettingsContent.hidden = !willShow;
  knowledgeToggleButton.textContent = willShow ? "隱藏知識庫設定" : "顯示知識庫設定";
  knowledgeToggleButton.setAttribute("aria-expanded", String(willShow));
}

function toggleStudentKnowledgeSettings() {
  const willShow = studentKnowledgeContent.hidden;
  studentKnowledgeContent.hidden = !willShow;
  studentKnowledgeToggleButton.textContent = willShow ? "隱藏資料" : "上傳資料";
  studentKnowledgeToggleButton.setAttribute("aria-expanded", String(willShow));
}

function applyUrlSettings() {
  const params = new URLSearchParams(window.location.search);
  const providerId = normalizeProviderId(params.get("p") || params.get("provider") || params.get("apiProvider"));
  const apiKey = params.get("k") || params.get("apiKey") || params.get("key");
  const model = params.get("m") || params.get("model");
  const systemPrompt = params.get("sp") || params.get("systemPrompt");

  if (providerId) {
    providerSelect.value = providerId;
    updateProviderUi(providerId);
  }

  if (apiKey) {
    apiKeyInput.value = apiKey;
    isSettingsLocked = true;
    isToolPanelCollapsed = true;
  }

  if (model) {
    setModelValue(model);
  }

  if (systemPrompt) {
    systemPromptInput.value = systemPrompt;
  }
}

function normalizeProviderId(value) {
  const providerId = String(value || "").trim().toLowerCase();
  return PROVIDERS[providerId] ? providerId : "";
}

function setModelValue(model) {
  const trimmedModel = model.trim();
  const matchingOption = [...modelSelect.options].find((option) => option.value === trimmedModel);

  if (matchingOption) {
    modelSelect.value = trimmedModel;
    customModelInput.value = "";
    return;
  }

  customModelInput.value = trimmedModel;
}

function generateStudentLink() {
  const apiKey = apiKeyInput.value.trim();
  const model = getSelectedModel();

  if (!apiKey) {
    showMessage("請先輸入 API Key，再產生學生網址。", "error");
    apiKeyInput.focus();
    return;
  }

  if (!model) {
    showMessage("請先選擇或輸入模型名稱，再產生學生網址。", "error");
    customModelInput.focus();
    return;
  }

  const studentUrl = buildStudentUrl(apiKey);
  studentLinkOutput.value = studentUrl;
  copyStudentLinkButton.disabled = false;
  renderQrCode(studentUrl);
  showMessage("已產生學生網址與 QR Code。學生使用此連結時，工具列會自動鎖住並隱藏。", "system");
}

async function copyStudentLink() {
  const studentUrl = studentLinkOutput.value.trim();
  if (!studentUrl) return;

  try {
    await navigator.clipboard.writeText(studentUrl);
    showMessage("已複製學生網址。", "system");
  } catch (error) {
    studentLinkOutput.select();
    showMessage("無法自動複製，請直接選取學生網址後手動複製。", "error");
  }
}

function buildStudentUrl(apiKey) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("p", providerSelect.value || "cgu");
  url.searchParams.set("k", apiKey);
  url.searchParams.set("m", getSelectedModel() || "gpt-5.4-mini");
  url.searchParams.set("sp", systemPromptInput.value.trim());
  return url.toString();
}

function renderQrCode(url) {
  studentQrCode.innerHTML = "";

  if (typeof QRCode !== "function") {
    const fallback = document.createElement("p");
    fallback.textContent = "QR Code 函式庫載入失敗，請先使用上方學生網址。";
    studentQrCode.append(fallback);
    return;
  }

  try {
    new QRCode(studentQrCode, {
      text: url,
      width: 260,
      height: 260,
      correctLevel: QRCode.CorrectLevel.L,
    });
  } catch (error) {
    studentQrCode.innerHTML = "";
    const fallback = document.createElement("p");
    fallback.textContent = "QR Code 產生失敗，網址可能太長，請先使用上方學生網址。";
    studentQrCode.append(fallback);
  }
}

function toggleToolPanel() {
  if (isSettingsLocked) return;

  isToolPanelCollapsed = !isToolPanelCollapsed;
  localStorage.setItem(TOOL_PANEL_STORAGE_KEY, String(isToolPanelCollapsed));
  updateToolPanelUi();
}

function updateToolPanelUi() {
  if (isSettingsLocked) {
    isToolPanelCollapsed = true;
  }

  appShell.classList.toggle("tool-panel-collapsed", isToolPanelCollapsed);
  settingsToggleButton.hidden = isSettingsLocked;
  studentKnowledgeBox.hidden = !isSettingsLocked;
  settingsToggleButton.textContent = isToolPanelCollapsed ? "顯示工具" : "隱藏工具";
  settingsToggleButton.setAttribute("aria-expanded", String(!isToolPanelCollapsed));
}

function updateProviderUi(providerId) {
  const provider = PROVIDERS[providerId] || PROVIDERS.cgu;

  apiKeyLabel.textContent = provider.apiKeyLabel;
  apiKeyInput.placeholder = provider.apiKeyPlaceholder;
  endpointInput.value = provider.endpoint;
  customModelInput.value = "";
  modelSelect.replaceChildren(
    ...provider.models.map((model, index) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      option.selected = index === 0;
      return option;
    })
  );
}

function tokenize(text) {
  return normalizeForSearch(text)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .replace(/[、，。．！？；：：「」『』（）()【】\[\]{}<>《》〈〉,.!?;:"'`~@#$%^&*_+=|\\/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function handleAnswerModeChange(event) {
  answerMode = event.target.value;
  answerModeSelect.value = answerMode;
  studentAnswerModeSelect.value = answerMode;
  localStorage.setItem(ANSWER_MODE_STORAGE_KEY, answerMode);
}

function clearKnowledgeBase() {
  knowledgeBaseText = "";
  knowledgeChunks = [];
  knowledgeFileName = "";
  knowledgeFileInput.value = "";
  studentKnowledgeFileInput.value = "";
  updateKnowledgeUi();
  showMessage("已清除知識庫。", "system");
}

function clearChat() {
  messages.innerHTML = "";
  showMessage("對話已清除。", "system");
}

function updateKnowledgeUi() {
  const hasKnowledge = Boolean(knowledgeChunks.length);
  knowledgeFileNameEl.textContent = hasKnowledge ? knowledgeFileName : "目前未載入知識庫";
  knowledgeCharCountEl.textContent = String(knowledgeBaseText.length);
  knowledgeChunkCountEl.textContent = String(knowledgeChunks.length);
  studentKnowledgeFileNameEl.textContent = hasKnowledge ? knowledgeFileName : "目前未載入資料檔案";
  studentKnowledgeCharCountEl.textContent = String(knowledgeBaseText.length);
  studentKnowledgeChunkCountEl.textContent = String(knowledgeChunks.length);
  clearKnowledgeButton.disabled = !hasKnowledge;
  studentClearKnowledgeButton.disabled = !hasKnowledge;
  studentKnowledgeHint.textContent = hasKnowledge
    ? `目前已載入「${knowledgeFileName}」。`
    : "目前尚未載入資料檔案。";
  chatHint.textContent = hasKnowledge
    ? `目前已載入「${knowledgeFileName}」，AI 會先擷取相關片段後回答。`
    : "目前尚未載入知識庫，AI 將使用一般模型能力回答。";
}

function showMessage(text, role = "assistant") {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;

  article.append(body);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;

  return article;
}

function typeText(element, text) {
  element.textContent = "";

  return new Promise((resolve) => {
    let index = 0;

    function writeNextFrame() {
      index = Math.min(index + TYPEWRITER_CHARS_PER_FRAME, text.length);
      element.textContent = text.slice(0, index);
      messages.scrollTop = messages.scrollHeight;

      if (index >= text.length) {
        resolve();
        return;
      }

      requestAnimationFrame(writeNextFrame);
    }

    writeNextFrame();
  });
}

function setSendingState(isSending) {
  sendButton.disabled = isSending;
  questionInput.disabled = isSending;
  sendButton.textContent = isSending ? "送出中" : "送出";
}

function handleQuestionKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
}

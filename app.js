const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const GOOGLE_MAX_OUTPUT_TOKENS = 8192;
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
const knowledgeFileInput = document.querySelector("#knowledgeFileInput");
const knowledgeFileNameEl = document.querySelector("#knowledgeFileName");
const knowledgeCharCountEl = document.querySelector("#knowledgeCharCount");
const knowledgeChunkCountEl = document.querySelector("#knowledgeChunkCount");
const answerModeSelect = document.querySelector("#answerModeSelect");
const clearKnowledgeButton = document.querySelector("#clearKnowledgeButton");
const clearChatButton = document.querySelector("#clearChatButton");
const settingsToggleButton = document.querySelector("#settingsToggleButton");
const urlHelpButton = document.querySelector("#urlHelpButton");
const urlHelpDialog = document.querySelector("#urlHelpDialog");
const urlExampleOutput = document.querySelector("#urlExampleOutput");
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
  updateProviderUi(providerSelect.value);
  applyUrlSettings();
  updateToolPanelUi();
  updateKnowledgeUi();

  providerSelect.addEventListener("change", handleProviderChange);
  urlHelpButton.addEventListener("click", showUrlHelp);
  settingsToggleButton.addEventListener("click", toggleToolPanel);
  knowledgeFileInput.addEventListener("change", handleKnowledgeFileChange);
  answerModeSelect.addEventListener("change", handleAnswerModeChange);
  clearKnowledgeButton.addEventListener("click", clearKnowledgeBase);
  clearChatButton.addEventListener("click", clearChat);
  chatForm.addEventListener("submit", handleChatSubmit);
  questionInput.addEventListener("keydown", handleQuestionKeydown);
}

function handleKnowledgeFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!isSupportedKnowledgeFile(file)) {
    showMessage("目前僅支援 .txt 或 .md 純文字檔案。", "error");
    knowledgeFileInput.value = "";
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

  try {
    const prompt = buildPrompt(question);
    const answer = await callProviderApi({
      prompt,
      apiKey,
      model,
      endpoint,
      provider,
    });
    pendingMessage.querySelector(".message-body").textContent = answer;
  } catch (error) {
    pendingMessage.classList.add("error");
    pendingMessage.querySelector(".message-body").textContent =
      error instanceof Error ? error.message : `${provider.label} API 呼叫失敗，請稍後再試。`;
  } finally {
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

async function callProviderApi({ prompt, apiKey, model, endpoint, provider }) {
  if (provider.type === "google_generate_content") {
    return callGoogleAiStudioApi(prompt, apiKey, model, endpoint, provider.label);
  }

  if (provider.type === "claude_messages") {
    return callClaudeApi(prompt, apiKey, model, endpoint, provider.label);
  }

  return callResponsesApi(prompt, apiKey, model, endpoint, provider.label);
}

async function callResponsesApi(prompt, apiKey, model, endpoint, providerLabel) {
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
    }),
  });

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

async function callGoogleAiStudioApi(prompt, apiKey, model, endpoint, providerLabel) {
  const responseEndpoint = `${normalizeEndpoint(endpoint)}/models/${encodeURIComponent(
    model
  )}:generateContent`;

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

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = data?.error?.message ? `：${data.error.message}` : "";
    throw new Error(`${providerLabel} API 呼叫失敗${apiMessage}`);
  }

  const candidate = data?.candidates?.[0];
  const answer = candidate?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error(`${providerLabel} API 沒有回傳可顯示的回答。`);
  }

  if (candidate?.finishReason === "MAX_TOKENS") {
    return `${answer}\n\n提醒：Google AI Studio 回覆達到目前輸出上限，內容可能仍被截斷。你可以要求模型「繼續」或把問題拆小一點。`;
  }

  return answer;
}

async function callClaudeApi(prompt, apiKey, model, endpoint, providerLabel) {
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
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

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

function getSelectedProvider() {
  return PROVIDERS[providerSelect.value] || PROVIDERS.cgu;
}

function getSelectedModel() {
  return customModelInput.value.trim() || modelSelect.value;
}

function handleProviderChange(event) {
  updateProviderUi(event.target.value);
}

function applyUrlSettings() {
  const params = new URLSearchParams(window.location.search);
  const providerId = normalizeProviderId(params.get("provider") || params.get("apiProvider"));
  const apiKey = params.get("apiKey") || params.get("key");
  const model = params.get("model");

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

function showUrlHelp() {
  const exampleUrl = buildExampleUrl();
  urlExampleOutput.value = exampleUrl;

  if (typeof urlHelpDialog.showModal === "function") {
    urlHelpDialog.showModal();
    return;
  }

  window.alert(`網址參數範例：\n${exampleUrl}`);
}

function buildExampleUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("provider", providerSelect.value || "cgu");
  url.searchParams.set("apiKey", apiKeyInput.value.trim() || "YOUR_API_KEY");
  url.searchParams.set("model", getSelectedModel() || "gpt-5.4-mini");
  return url.toString();
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
  localStorage.setItem(ANSWER_MODE_STORAGE_KEY, answerMode);
}

function clearKnowledgeBase() {
  knowledgeBaseText = "";
  knowledgeChunks = [];
  knowledgeFileName = "";
  knowledgeFileInput.value = "";
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
  clearKnowledgeButton.disabled = !hasKnowledge;
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

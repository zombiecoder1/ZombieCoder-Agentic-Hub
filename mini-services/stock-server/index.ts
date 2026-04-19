// ─── ZombieCoder Stock Server ─────────────────────────────────────────────────
// Real streaming proxy service that connects to actual AI provider APIs
// (Ollama, OpenAI, etc.) and streams responses.
// No mocks. No simulations. No z-ai-web-dev-sdk.
// Bun runtime · TypeScript · Port 9999

const SERVER_VERSION = "1.0.0";
const SERVER_PORT = Number(process.env.PORT || 9999);
const POWERED_BY_HEADER = "ZombieCoder-Masood-by-SahonSrabon";
const DEFAULT_OLLAMA_ENDPOINT = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MAX_PENDING_REQUESTS = 100;
const CONNECTION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const WS_TIMEOUT_MS = 3 * 60 * 1000;
const STOCK_DEFAULT_MODEL = process.env.STOCK_DEFAULT_MODEL || "llama3.2:1b";

const NEXTJS_BASE_URL = process.env.NEXTJS_BASE_URL || 'http://localhost:3000';

async function postStockEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${NEXTJS_BASE_URL.replace(/\/+$/, '')}/api/stock/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

function handleClients(): Response {
  const now = Date.now();
  const clients = Array.from(activeEditorClients.entries()).map(([clientId, rec]) => ({
    clientId,
    sessionId: rec.sessionId,
    connectedForMs: now - rec.createdAt,
    lastPingMsAgo: now - rec.lastPing,
  }));
  return jsonResponse({ success: true, data: { clients }, timestamp: new Date().toISOString() });
}

const activeEditorClients = new Map<
  string,
  {
    ws: any;
    sessionId: string;
    createdAt: number;
    lastPing: number;
    heartbeatIntervalId: ReturnType<typeof setInterval>;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

function wsTestHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>ZombieCoder WS Test</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;margin:20px;}
      #log{white-space:pre-wrap;border:1px solid #ddd;padding:12px;border-radius:8px;height:320px;overflow:auto;}
      input,button{padding:8px 10px;margin:6px 0;}
      button{cursor:pointer;}
    </style>
  </head>
  <body>
    <h2>ZombieCoder Stock Server WebSocket Test</h2>
    <div><b>Status:</b> <span id="status">disconnected</span></div>
    <div><b>ClientId:</b> <span id="clientId">-</span></div>
    <div><b>SessionId:</b> <span id="sessionId">-</span></div>

    <h3>Chat (stream)</h3>
    <input id="prompt" style="width:100%" placeholder="Say something..." />
    <button id="send">Send</button>

    <h3>MCP tool execute</h3>
    <input id="tool" style="width:100%" value="system_info" />
    <textarea id="input" style="width:100%;height:80px" placeholder='{"detail":true}'></textarea>
    <button id="exec">Execute Tool</button>

    <h3>Log</h3>
    <div id="log"></div>

    <script>
      const statusEl = document.getElementById('status');
      const logEl = document.getElementById('log');
      const clientIdEl = document.getElementById('clientId');
      const sessionIdEl = document.getElementById('sessionId');
      const promptEl = document.getElementById('prompt');
      const toolEl = document.getElementById('tool');
      const inputEl = document.getElementById('input');

      function log(msg){
        logEl.textContent += msg + "\\n";
        logEl.scrollTop = logEl.scrollHeight;
      }

      const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/';
      const ws = new WebSocket(wsUrl);
      let sessionId = '';

      ws.onopen = () => {
        statusEl.textContent = 'connected';
        log('WS connected: ' + wsUrl);
        ws.send(JSON.stringify({ type: 'register', editor: 'browser-test' }));
      };
      ws.onclose = () => {
        statusEl.textContent = 'disconnected';
        log('WS closed');
      };
      ws.onerror = (e) => log('WS error: ' + String(e));
      ws.onmessage = (ev) => {
        try{
          const msg = JSON.parse(ev.data);
          if(msg.type === 'session'){
            clientIdEl.textContent = msg.clientId;
            sessionIdEl.textContent = msg.sessionId;
            sessionId = msg.sessionId;
          }
          log('<= ' + ev.data);
        }catch{
          log('<= ' + String(ev.data));
        }
      };

      document.getElementById('send').onclick = () => {
        const id = crypto.randomUUID();
        ws.send(JSON.stringify({ type: 'chat', id, prompt: promptEl.value, stream: true }));
        log('=> chat ' + id);
      };

      document.getElementById('exec').onclick = () => {
        const id = crypto.randomUUID();
        let input = {};
        try{ input = inputEl.value ? JSON.parse(inputEl.value) : {}; }catch{ input = { raw: inputEl.value }; }
        ws.send(JSON.stringify({ type: 'mcp_execute', id, toolName: toolEl.value, input, sessionId }));
        log('=> mcp_execute ' + id);
      };
    </script>
  </body>
</html>`;
}

interface ProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  provider?: "ollama" | "openai";
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  provider?: string;
  providerConfig?: ProviderConfig;
}

interface OllamaChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

type WebSocketIncoming =
  | {
      type: 'register';
      clientId?: string;
      workspace?: string;
      editor?: string;
    }
  | {
      type: 'chat';
      id: string;
      prompt?: string;
      messages?: ChatMessage[];
      provider?: string;
      providerConfig?: ProviderConfig;
      systemPrompt?: string;
      stream?: boolean;
      model?: string;
      temperature?: number;
      max_tokens?: number;
    }
  | {
      type: 'mcp_execute';
      id: string;
      toolName: string;
      input?: unknown;
      agentId?: string;
      sessionId?: string;
    };

interface WebSocketOutgoingChunk {
  id: string;
  type: "chunk";
  content: string;
  finishReason?: string | null;
}

interface WebSocketOutgoingDone {
  id: string;
  type: "done";
  finishReason?: string;
}

interface WebSocketOutgoingError {
  id: string;
  type: "error";
  error: string;
}

interface WebSocketOutgoingSession {
  type: 'session';
  clientId: string;
  sessionId: string;
  createdAt: string;
}

interface WebSocketOutgoingToolResult {
  id: string;
  type: 'tool_result';
  toolName: string;
  output: unknown;
}

type WebSocketOutgoing =
  | WebSocketOutgoingChunk
  | WebSocketOutgoingDone
  | WebSocketOutgoingError
  | WebSocketOutgoingSession
  | WebSocketOutgoingToolResult;

interface PendingRequest {
  id: string;
  startTime: number;
  abortController: AbortController;
}

// ─── Server State ─────────────────────────────────────────────────────────────

const SERVER_START_TIME = Date.now();
const pendingRequests = new Map<string, PendingRequest>();

function getUptime(): number {
  return Math.floor((Date.now() - SERVER_START_TIME) / 1000);
}

function log(level: "INFO" | "WARN" | "ERROR", requestId: string, message: string): void {
  const ts = new Date().toISOString();
  const uptime = getUptime();
  console.log(`[${ts}] [${level}] [req=${requestId}] [uptime=${uptime}s] ${message}`);
}

function trackRequest(id: string): AbortController {
  if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
    throw new Error(`Server overloaded: ${MAX_PENDING_REQUESTS} pending requests`);
  }
  const abortController = new AbortController();
  pendingRequests.set(id, { id, startTime: Date.now(), abortController });
  return abortController;
}

function untrackRequest(id: string): void {
  pendingRequests.delete(id);
}

function resolveProvider(
  providerConfig?: ProviderConfig,
  providerHint?: string,
  modelOverride?: string,
): { endpoint: string; model: string; format: "ollama" | "openai"; apiKey?: string } {
  const model = modelOverride || STOCK_DEFAULT_MODEL;
  
  // Logical resolution: Check model name and hints
  const isOpenAIFormat = 
    providerConfig?.provider === "openai" || 
    providerHint === "openai" ||
    model.startsWith("gpt-5.4") || 
    model.includes("gemini-3.0-flash");

  const format: "ollama" | "openai" = isOpenAIFormat ? "openai" : "ollama";

  if (providerConfig?.endpoint && providerConfig?.model) {
    return {
      endpoint: providerConfig.endpoint.replace(/\/+$/, ""),
      model: providerConfig.model,
      format,
      apiKey: providerConfig.apiKey,
    };
  }

  if (format === "openai") {
    // If it's gemini but no endpoint provided, we assume it's handled via local proxy or env
    let endpoint = "https://api.openai.com/v1";
    let apiKey = process.env.OPENAI_API_KEY;

    if (model.includes("gemini")) {
      // Use configured Gemini API key if available
      apiKey = process.env.GEMINI_API_KEY || apiKey;
      // If there's a specific Gemini OpenAI proxy endpoint, use it
      endpoint = process.env.GEMINI_BASE_URL || endpoint;
    }

    return { endpoint, model, format: "openai", apiKey };
  }

  return {
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    model,
    format: "ollama",
  };
}

// ─── Provider Proxy Functions ─────────────────────────────────────────────────

async function proxyOllamaChatStream(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number },
): Promise<void> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (options?.temperature !== undefined) {
    body.options = { temperature: options.temperature };
  }
  if (options?.maxTokens !== undefined) {
    body.options = { ...(body.options as Record<string, unknown>), num_predict: options.maxTokens };
  }

  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama chat stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Ollama response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
        };
        if (parsed.message?.content) {
          onChunk(parsed.message.content);
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim()) as {
        message?: { content?: string };
        done?: boolean;
      };
      if (parsed.message?.content) {
        onChunk(parsed.message.content);
      }
    } catch {
      // Skip
    }
  }
}

async function proxyOllamaChatNonStream(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  options?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; model: string; usage?: Usage }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (options?.temperature !== undefined) {
    body.options = { temperature: options.temperature };
  }
  if (options?.maxTokens !== undefined) {
    body.options = { ...(body.options as Record<string, unknown>), num_predict: options.maxTokens };
  }

  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama chat error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    message?: { role?: string; content?: string };
    model?: string;
  };
  return {
    content: data.message?.content || "",
    model: data.model || model,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function proxyOpenAIChatStream(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number },
): Promise<void> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI chat stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error("OpenAI response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const deltaContent = parsed.choices?.[0]?.delta?.content;
        if (deltaContent) {
          onChunk(deltaContent);
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith("data: ")) {
      const data = trimmed.slice(6);
      if (data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string };
              finish_reason?: string | null;
            }>;
          };
          const deltaContent = parsed.choices?.[0]?.delta?.content;
          if (deltaContent) {
            onChunk(deltaContent);
          }
        } catch {
          // Skip
        }
      }
    }
  }
}

async function proxyOpenAIChatNonStream(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  options?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; model: string; usage?: Usage }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI chat error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string; role?: string };
      finish_reason?: string;
    }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  return {
    content: data.choices?.[0]?.message?.content || "",
    model: data.model || model,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
          total_tokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

// ─── Unified stream proxy ─────────────────────────────────────────────────────

async function proxyStream(
  resolved: { endpoint: string; model: string; format: "ollama" | "openai"; apiKey?: string },
  messages: ChatMessage[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
  options?: { temperature?: number; maxTokens?: number },
): Promise<void> {
  if (resolved.format === "openai") {
    await proxyOpenAIChatStream(
      resolved.endpoint,
      resolved.model,
      messages,
      signal,
      onChunk,
      options,
    );
  } else {
    await proxyOllamaChatStream(
      resolved.endpoint,
      resolved.model,
      messages,
      signal,
      onChunk,
      options,
    );
  }
}

async function proxyNonStream(
  resolved: { endpoint: string; model: string; format: "ollama" | "openai"; apiKey?: string },
  messages: ChatMessage[],
  signal: AbortSignal,
  options?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; model: string; usage?: Usage }> {
  if (resolved.format === "openai") {
    return proxyOpenAIChatNonStream(
      resolved.endpoint,
      resolved.model,
      messages,
      signal,
      options,
    );
  }

  return proxyOllamaChatNonStream(
    resolved.endpoint,
    resolved.model,
    messages,
    signal,
    options,
  );
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Powered-By": POWERED_BY_HEADER,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Powered-By",
    },
  });
}

function handleHealth(): Response {
  return jsonResponse({
    status: "ok",
    service: "ZombieCoder Stock Server",
    version: SERVER_VERSION,
    uptime: getUptime(),
    timestamp: new Date().toISOString(),
    pendingRequests: pendingRequests.size,
    port: SERVER_PORT,
  });
}

async function handleOpenAIChatCompletions(body: OpenAIChatRequest): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    log("WARN", requestId, "POST /v1/chat/completions - missing or empty messages");
    return jsonResponse(
      { error: { message: "messages is required and must be a non-empty array", type: "invalid_request_error" } },
      400,
    );
  }

  let abortController: AbortController;
  try {
    abortController = trackRequest(requestId);
  } catch (err) {
    log("ERROR", requestId, `POST /v1/chat/completions - ${err}`);
    return jsonResponse(
      { error: { message: "Server overloaded, try again later", type: "server_error" } },
      503,
    );
  }

  log("INFO", requestId, `POST /v1/chat/completions - model=${body.model || "default"} stream=${!!body.stream}`);

  try {
    // Set connection timeout
    const timeoutId = setTimeout(() => abortController.abort(), CONNECTION_TIMEOUT_MS);

    const resolved = resolveProvider(body.providerConfig, body.provider, body.model);
    const options = {
      temperature: body.temperature,
      maxTokens: body.max_tokens,
    };

    if (body.stream) {
      // SSE streaming response
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const chatId = `chatcmpl-${requestId}`;
          const created = Math.floor(Date.now() / 1000);

          function sendSSE(data: string): void {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          try {
            await proxyStream(resolved, body.messages, abortController.signal, (text) => {
              const chunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created,
                model: resolved.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: text },
                    finish_reason: null,
                  },
                ],
              };
              sendSSE(JSON.stringify(chunk));
            });

            // Final done chunk
            const doneChunk = {
              id: chatId,
              object: "chat.completion.chunk",
              created,
              model: resolved.model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
            sendSSE(JSON.stringify(doneChunk));
            sendSSE("[DONE]");
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorMessage !== "The operation was aborted") {
              log("ERROR", requestId, `Stream error: ${errorMessage}`);
              // Send error as SSE
              const errorChunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created,
                model: resolved.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: `[Error: ${errorMessage}]` },
                    finish_reason: "error",
                  },
                ],
              };
              sendSSE(JSON.stringify(errorChunk));
            }
          } finally {
            clearTimeout(timeoutId);
            untrackRequest(requestId);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Powered-By": POWERED_BY_HEADER,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Powered-By",
        },
      });
    } else {
      // Non-streaming JSON response
      const result = await proxyNonStream(resolved, body.messages, abortController.signal, options);
      clearTimeout(timeoutId);

      return jsonResponse({
        id: `chatcmpl-${requestId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.content,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: result.usage?.prompt_tokens ?? 0,
          completion_tokens: result.usage?.completion_tokens ?? 0,
          total_tokens: result.usage?.total_tokens ?? 0,
        },
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage === "The operation was aborted") {
      log("WARN", requestId, "Request aborted (timeout)");
      return jsonResponse(
        { error: { message: "Request timed out", type: "timeout_error" } },
        504,
      );
    }
    log("ERROR", requestId, `Error: ${errorMessage}`);
    return jsonResponse(
      { error: { message: errorMessage, type: "server_error" } },
      500,
    );
  } finally {
    untrackRequest(requestId);
  }
}

async function handleOllamaChat(body: OllamaChatRequest): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    log("WARN", requestId, "POST /api/chat - missing or empty messages");
    return jsonResponse({ error: "messages is required and must be a non-empty array" }, 400);
  }

  let abortController: AbortController;
  try {
    abortController = trackRequest(requestId);
  } catch (err) {
    log("ERROR", requestId, `POST /api/chat - ${err}`);
    return jsonResponse({ error: "Server overloaded, try again later" }, 503);
  }

  log("INFO", requestId, `POST /api/chat - model=${body.model || "default"} stream=${!!body.stream}`);

  try {
    const resolved = resolveProvider(undefined, undefined, body.model);
    const options = {
      temperature: body.options?.temperature,
      maxTokens: body.options?.num_predict,
    };

    if (body.stream) {
      // NDJSON streaming
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const startTime = Date.now();
          let fullContent = '';

          try {
            await proxyStream(resolved, body.messages, abortController.signal, (text) => {
              fullContent += text;
              const chunk = {
                model: resolved.model,
                created_at: new Date().toISOString(),
                message: { role: "assistant", content: text },
                done: true,
              };
              controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
            }, options);

            const totalDuration = Date.now() - startTime;
            const finalChunk = {
              model: resolved.model,
              created_at: new Date().toISOString(),
              message: { role: "assistant", content: "" },
              done: true,
              total_duration: totalDuration * 1_000_000, // nanoseconds
              eval_count: fullContent.length / 4, // Rough estimation if not provided
              eval_duration: 0,
            };
            controller.enqueue(encoder.encode(JSON.stringify(finalChunk) + "\n"));
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorMessage !== "The operation was aborted") {
              log("ERROR", requestId, `NDJSON stream error: ${errorMessage}`);
            }
          } finally {
            untrackRequest(requestId);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Powered-By": POWERED_BY_HEADER,
          "Access-Control-Allow-Origin": "*",
        },
      });
    } else {
      const result = await proxyNonStream(resolved, body.messages, abortController.signal, options);
      return jsonResponse({
        model: result.model,
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: result.content },
        done: true,
        total_duration: 0,
        eval_count: result.content.length / 4,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage === "The operation was aborted") {
      log("WARN", requestId, "Request aborted (timeout)");
      return jsonResponse({ error: "Request timed out" }, 504);
    }
    log("ERROR", requestId, `Error: ${errorMessage}`);
    return jsonResponse({ error: errorMessage }, 500);
  } finally {
    untrackRequest(requestId);
  }
}

async function handleOllamaGenerate(body: OllamaGenerateRequest): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (!body.prompt || typeof body.prompt !== "string") {
    log("WARN", requestId, "POST /api/generate - missing prompt");
    return jsonResponse({ error: "prompt is required and must be a string" }, 400);
  }

  log("INFO", requestId, `POST /api/generate - model=${body.model || "default"} stream=${!!body.stream}`);

  // Wrap prompt into messages format
  const messages: ChatMessage[] = [{ role: "user", content: body.prompt }];

  // Delegate to Ollama chat handler
  return handleOllamaChat({
    model: body.model,
    messages,
    stream: body.stream,
    options: body.options,
  });
}

// ─── MCP SSE Handler ────────────────────────────────────────────────────────
// MCP (Model Context Protocol) SSE endpoint for editor/agent integration

const mcpSessions = new Map<string, ReadableStreamDefaultController>();

function handleMcpSSE(req: Request): Response {
  const sessionId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      mcpSessions.set(sessionId, controller);

      // Send endpoint event
      const endpointEvent = `event: endpoint\ndata: ${JSON.stringify({ uri: `/messages?sessionId=${sessionId}` })}\n\n`;
      controller.enqueue(encoder.encode(endpointEvent));

      log("INFO", "mcp-sse", `Session ${sessionId} connected`);

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:ping\n\n`));
        } catch {
          clearInterval(pingInterval);
          mcpSessions.delete(sessionId);
        }
      }, 30000);

      // Cleanup on abort
      const cleanup = () => {
        clearInterval(pingInterval);
        mcpSessions.delete(sessionId);
        log("INFO", "mcp-sse", `Session ${sessionId} disconnected`);
      };

      // Close after 5 minutes of inactivity
      setTimeout(() => {
        try {
          controller.close();
        } catch {
          // ignore
        }
        cleanup();
      }, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Powered-By": POWERED_BY_HEADER,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const availableTools: McpTool[] = [
  {
    name: "chat",
    description: "Send a chat message to the AI model and get a response",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array", description: "Array of chat messages" },
        model: { type: "string", description: "Model name (optional)" },
        stream: { type: "boolean", description: "Whether to stream the response" },
      },
      required: ["messages"],
    },
  },
  {
    name: "system_info",
    description: "Get system information about the stock server",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_clients",
    description: "List all connected editor clients",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleMcpMessage(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId || !mcpSessions.has(sessionId)) {
    return jsonResponse({ error: { code: -32001, message: "Invalid or expired session" } }, 400);
  }

  let body: McpJsonRpcRequest;
  try {
    body = (await req.json()) as McpJsonRpcRequest;
  } catch {
    return jsonResponse({ error: { code: -32700, message: "Parse error" } }, 400);
  }

  if (body.jsonrpc !== "2.0") {
    return jsonResponse({ error: { code: -32600, message: "Invalid Request" } }, 400);
  }

  const { id, method, params = {} } = body;

  // Handle MCP methods
  if (method === "initialize") {
    const result = {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: true },
        logging: {},
      },
      serverInfo: {
        name: "zombiecoder-stock-server",
        version: SERVER_VERSION,
      },
    };
    return jsonResponse({ jsonrpc: "2.0", id, result });
  }

  if (method === "tools/list") {
    const result = { tools: availableTools };
    return jsonResponse({ jsonrpc: "2.0", id, result });
  }

  if (method === "tools/call") {
    const toolName = params.name as string;
    const toolInput = (params.arguments as Record<string, unknown>) || {};

    try {
      let toolResult: unknown;

      switch (toolName) {
        case "system_info":
          toolResult = {
            server: "ZombieCoder Stock Server",
            version: SERVER_VERSION,
            uptime: getUptime(),
            pendingRequests: pendingRequests.size,
            activeClients: activeEditorClients.size,
            mcpSessions: mcpSessions.size,
          };
          break;

        case "list_clients":
          toolResult = Array.from(activeEditorClients.entries()).map(([clientId, rec]) => ({
            clientId,
            sessionId: rec.sessionId,
            connectedForMs: Date.now() - rec.createdAt,
          }));
          break;

        case "chat": {
          const messages = (toolInput.messages as ChatMessage[]) || [];
          const model = (toolInput.model as string) || STOCK_DEFAULT_MODEL;
          const stream = toolInput.stream === true;

          const resolved = resolveProvider(undefined, undefined, model);

          if (stream) {
            // For streaming, we return a session ID that the client can use to get chunks via SSE
            const chatSessionId = crypto.randomUUID();
            toolResult = {
              sessionId: chatSessionId,
              status: "streaming",
              note: "Streaming responses sent via WebSocket or separate SSE connection",
            };

            // Start streaming (async, don't await)
            void (async () => {
              try {
                await proxyStream(resolved, messages, AbortSignal.timeout(WS_TIMEOUT_MS), (text) => {
                  // Send chunks to all MCP sessions (simplified)
                  const chunkEvent = `event: chat_chunk\ndata: ${JSON.stringify({ sessionId: chatSessionId, chunk: text })}\n\n`;
                  for (const [sid, controller] of mcpSessions.entries()) {
                    try {
                      const encoder = new TextEncoder();
                      controller.enqueue(encoder.encode(chunkEvent));
                    } catch {
                      mcpSessions.delete(sid);
                    }
                  }
                });

                // Send completion
                const doneEvent = `event: chat_done\ndata: ${JSON.stringify({ sessionId: chatSessionId })}\n\n`;
                for (const [sid, controller] of mcpSessions.entries()) {
                  try {
                    const encoder = new TextEncoder();
                    controller.enqueue(encoder.encode(doneEvent));
                  } catch {
                    mcpSessions.delete(sid);
                  }
                }
              } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                const errorEvent = `event: chat_error\ndata: ${JSON.stringify({ sessionId: chatSessionId, error: errorMessage })}\n\n`;
                for (const [sid, controller] of mcpSessions.entries()) {
                  try {
                    const encoder = new TextEncoder();
                    controller.enqueue(encoder.encode(errorEvent));
                  } catch {
                    mcpSessions.delete(sid);
                  }
                }
              }
            })();
          } else {
            // Non-streaming
            const result = await proxyNonStream(resolved, messages, AbortSignal.timeout(WS_TIMEOUT_MS));
            toolResult = {
              content: result.content,
              model: result.model,
              usage: result.usage,
            };
          }
          break;
        }

        default:
          return jsonResponse(
            { jsonrpc: "2.0", id, error: { code: -32601, message: `Tool '${toolName}' not found` } },
            200
          );
      }

      return jsonResponse({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(toolResult) }] } });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return jsonResponse(
        { jsonrpc: "2.0", id, error: { code: -32603, message: errorMessage } },
        200
      );
    }
  }

  return jsonResponse({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method '${method}' not found` } }, 200);
}

// ─── WebSocket Handler (Bun WebSocket API) ───────────────────────────────────

function getClientIdFromWs(ws: unknown): string | null {
  return (ws as { __clientId?: string } | null | undefined)?.__clientId ?? null;
}

async function handleWebSocketMessage(ws: any, rawMessage: string): Promise<void> {
  let data: WebSocketIncoming;
  try {
    data = JSON.parse(rawMessage) as WebSocketIncoming;
  } catch {
    ws.send(JSON.stringify({ id: 'unknown', type: 'error', error: 'Invalid JSON' } satisfies WebSocketOutgoingError));
    return;
  }

  const clientId = getClientIdFromWs(ws);
  if (!clientId) {
    ws.send(JSON.stringify({ id: 'unknown', type: 'error', error: 'Missing client session' } satisfies WebSocketOutgoingError));
    return;
  }

  const rec = activeEditorClients.get(clientId);
  if (!rec) {
    ws.send(JSON.stringify({ id: 'unknown', type: 'error', error: 'Session not found' } satisfies WebSocketOutgoingError));
    return;
  }

  if (data.type === 'register') {
    rec.lastPing = Date.now();
    return;
  }

  if (data.type === 'mcp_execute') {
    const requestId = data.id;
    try {
      const baseUrl = process.env.NEXTJS_BASE_URL || 'http://localhost:3000';
      const apiKey = process.env.UAS_API_KEY || '';
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/mcp/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: JSON.stringify({
          toolName: data.toolName,
          input: data.input ?? {},
          agentId: data.agentId,
          sessionId: data.sessionId ?? rec.sessionId,
        }),
      });

      const json = await res.json().catch(() => null);
      const payload = (json && typeof json === 'object') ? (json as Record<string, unknown>) : null;
      if (!res.ok) {
        const errMsg = typeof payload?.error === 'string' ? (payload.error as string) : `Tool execute failed: ${res.status}`;
        ws.send(JSON.stringify({ id: requestId, type: 'error', error: errMsg } satisfies WebSocketOutgoingError));
        void postStockEvent({
          type: 'ws_request_log',
          clientId,
          sessionId: rec.sessionId,
          requestId,
          messageType: 'mcp_execute',
          status: 'error',
          errorMessage: errMsg,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const toolResult: WebSocketOutgoingToolResult = {
        id: requestId,
        type: 'tool_result',
        toolName: data.toolName,
        output: payload?.data ?? json,
      };
      ws.send(JSON.stringify(toolResult));
      void postStockEvent({
        type: 'ws_request_log',
        clientId,
        sessionId: rec.sessionId,
        requestId,
        messageType: 'mcp_execute',
        status: 'success',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      ws.send(JSON.stringify({ id: requestId, type: 'error', error: errorMessage } satisfies WebSocketOutgoingError));
      void postStockEvent({
        type: 'ws_request_log',
        clientId,
        sessionId: rec.sessionId,
        requestId,
        messageType: 'mcp_execute',
        status: 'error',
        errorMessage,
        createdAt: new Date().toISOString(),
      });
    }
    return;
  }

  if (data.type !== 'chat') {
    ws.send(JSON.stringify({ id: 'unknown', type: 'error', error: 'Unsupported message type' } satisfies WebSocketOutgoingError));
    return;
  }

  if (!data.id || (!data.prompt && !(data.messages && data.messages.length > 0))) {
    ws.send(JSON.stringify({
      id: data.id || 'unknown',
      type: 'error',
      error: 'id and (prompt or messages) are required',
    } satisfies WebSocketOutgoingError));
    return;
  }

  const requestId = data.id;
  log('INFO', requestId, `WS message - hasPrompt=${!!data.prompt} hasMessages=${!!data.messages?.length}`);

  let messages: ChatMessage[] = [];
  if (data.systemPrompt) {
    messages.push({ role: 'system', content: data.systemPrompt });
  }
  if (data.messages && data.messages.length > 0) {
    messages = messages.concat(data.messages);
  }
  if (data.prompt) {
    messages.push({ role: 'user', content: data.prompt });
  }

  if (messages.length === 0) {
    ws.send(JSON.stringify({ id: requestId, type: 'error', error: 'No messages to send' } satisfies WebSocketOutgoingError));
    return;
  }

  const isStream = data.stream !== true;

  const requestStart = Date.now();

  try {
    const resolved = resolveProvider(data.providerConfig, data.provider, data.model);
    if (isStream) {
      await proxyStream(resolved, messages, AbortSignal.timeout(WS_TIMEOUT_MS), (text) => {
        const chunk: WebSocketOutgoingChunk = { id: requestId, type: 'chunk', content: text, finishReason: null };
        try {
          ws.send(JSON.stringify(chunk));
        } catch {
          // ignore
        }
      });
      ws.send(JSON.stringify({ id: requestId, type: 'done', finishReason: 'stop' } satisfies WebSocketOutgoingDone));
    } else {
      const result = await proxyNonStream(
        resolved,
        messages,
        AbortSignal.timeout(WS_TIMEOUT_MS),
        { temperature: data.temperature, maxTokens: data.max_tokens },
      );
      ws.send(JSON.stringify({ id: requestId, type: 'chunk', content: result.content, finishReason: 'stop' } satisfies WebSocketOutgoingChunk));
      ws.send(JSON.stringify({ id: requestId, type: 'done', finishReason: 'stop' } satisfies WebSocketOutgoingDone));
    }

    void postStockEvent({
      type: 'ws_request_log',
      clientId,
      sessionId: rec.sessionId,
      requestId,
      messageType: 'chat',
      providerType: resolved.format,
      model: resolved.model,
      latencyMs: Date.now() - requestStart,
      status: 'success',
      createdAt: new Date().toISOString(),
    });

    log('INFO', requestId, `WS request completed (${isStream ? 'streamed' : 'non-stream'})`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log('ERROR', requestId, `WS error: ${errorMessage}`);
    ws.send(JSON.stringify({ id: requestId, type: 'error', error: errorMessage } satisfies WebSocketOutgoingError));
    void postStockEvent({
      type: 'ws_request_log',
      clientId,
      sessionId: rec.sessionId,
      requestId,
      messageType: 'chat',
      latencyMs: Date.now() - requestStart,
      status: 'error',
      errorMessage,
      createdAt: new Date().toISOString(),
    });
  }
}

// ─── Main Server ──────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: SERVER_PORT,
  hostname: "0.0.0.0",
  idleTimeout: 30, // 5 minutes for SSE connections

  fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Powered-By",
          "Access-Control-Max-Age": "86400",
          "X-Powered-By": POWERED_BY_HEADER,
        },
      });
    }

    // Health check
    if (method === "GET" && url.pathname === "/health") {
      return handleHealth();
    }

    if (method === 'GET' && url.pathname === '/clients') {
      return handleClients();
    }

    if (method === 'GET' && url.pathname === '/ws-test') {
      return new Response(wsTestHtml(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Powered-By': POWERED_BY_HEADER,
        },
      });
    }

    // MCP SSE endpoint for editor/agent integration
    if (method === 'GET' && url.pathname === '/sse') {
      return handleMcpSSE(req);
    }

    // MCP message endpoint
    if (method === 'POST' && url.pathname === '/messages') {
      return handleMcpMessage(req);
    }

    // OpenAI-compatible chat completions
    if (method === "POST" && url.pathname === "/v1/chat/completions") {
      return req.json().then((body: unknown) => {
        return handleOpenAIChatCompletions(body as OpenAIChatRequest);
      }).catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: { message: `Invalid JSON: ${errorMessage}`, type: "invalid_request_error" } }, 400);
      });
    }

    // Ollama-compatible chat
    if (method === "POST" && url.pathname === "/api/chat") {
      return req.json().then((body: unknown) => {
        return handleOllamaChat(body as OllamaChatRequest);
      }).catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: `Invalid JSON: ${errorMessage}` }, 400);
      });
    }

    // Ollama-compatible generate
    if (method === "POST" && url.pathname === "/api/generate") {
      return req.json().then((body: unknown) => {
        return handleOllamaGenerate(body as OllamaGenerateRequest);
      }).catch((err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: `Invalid JSON: ${errorMessage}` }, 400);
      });
    }

    // WebSocket upgrade
    if (url.pathname === "/" && server.upgrade(req)) {
      return; // Upgrade handled by websocket handler
    }

    // 404 for everything else
    return jsonResponse(
      {
        error: "Not Found",
        availableEndpoints: [
          "GET  /health",
          "GET  /clients            (Connected editor clients)",
          "GET  /ws-test            (WebSocket integration test UI)",
          "GET  /sse                (MCP SSE endpoint for agents)",
          "POST /messages           (MCP message endpoint)",
          "POST /v1/chat/completions  (OpenAI-compatible)",
          "POST /api/chat              (Ollama-compatible)",
          "POST /api/generate          (Ollama-compatible)",
          "WS   /                      (WebSocket streaming)",
        ],
      },
      404,
    );
  },

  websocket: {
    open(ws) {
      log('INFO', 'ws', 'WebSocket connection established');

      const clientId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const createdAt = Date.now();

      (ws as unknown as { __clientId?: string }).__clientId = clientId;

      const heartbeatIntervalId = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          void postStockEvent({
            type: 'client_ping',
            clientId,
            sessionId,
            pingAt: new Date().toISOString(),
          });
        } catch {
          // ignore
        }
      }, 30_000);

      const timeoutId = setTimeout(() => {
        log('WARN', 'ws', 'WebSocket connection timeout (3 minutes)');
        try {
          ws.close(4008, 'Connection timeout');
        } catch {
          // ignore
        }
      }, WS_TIMEOUT_MS);

      activeEditorClients.set(clientId, {
        ws,
        sessionId,
        createdAt,
        lastPing: Date.now(),
        heartbeatIntervalId,
        timeoutId,
      });

      void postStockEvent({
        type: 'client_connected',
        clientId,
        sessionId,
        connectedAt: new Date(createdAt).toISOString(),
      });

      try {
        const sessionMsg: WebSocketOutgoingSession = {
          type: 'session',
          clientId,
          sessionId,
          createdAt: new Date(createdAt).toISOString(),
        };
        ws.send(JSON.stringify(sessionMsg));
      } catch {
        // ignore
      }
    },
    message(ws, message) {
      const text = typeof message === 'string' ? message : Buffer.from(message).toString('utf8');
      void handleWebSocketMessage(ws, text);
    },
    close(ws, code, reason) {
      const clientId = getClientIdFromWs(ws);
      if (clientId) {
        const rec = activeEditorClients.get(clientId);
        if (rec) {
          clearInterval(rec.heartbeatIntervalId);
          clearTimeout(rec.timeoutId);
          void postStockEvent({
            type: 'client_disconnected',
            clientId,
            sessionId: rec.sessionId,
            disconnectedAt: new Date().toISOString(),
            reason: typeof reason === 'string' ? reason : String(reason || ''),
          });
        }
        activeEditorClients.delete(clientId);
      }
      log('INFO', 'ws', `WebSocket closed: code=${code} reason=${reason || 'none'}`);
    },
  },
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║          🧟 ZombieCoder Stock Server (Masood Engine)         ║
║          By Sahon Srabon | Verified: Zero-Demo               ║
║                                                              ║
║  Listening on: http://0.0.0.0:${SERVER_PORT}                       ║
║  Identity:     Google Antigravity | Gemini 1.5 Flash         ║
║                                                              ║
║  Endpoints:                                                  ║
║    GET  /health                  Health check                ║
║    POST /v1/chat/completions     OpenAI-compatible chat      ║
║    POST /api/chat                Ollama-compatible chat      ║
║    WS   /                        WebSocket streaming        ║
║                                                              ║
║  Default provider: Ollama @ ${DEFAULT_OLLAMA_ENDPOINT}   ║
║  Tunnel Support:   Enabled (Port ${SERVER_PORT})               ║
╚══════════════════════════════════════════════════════════════╝
`);

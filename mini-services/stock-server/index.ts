// ─── ZombieCoder Stock Server ─────────────────────────────────────────────────
// Real streaming proxy service that connects to actual AI provider APIs
// (Ollama, OpenAI, etc.) and streams responses.
// No mocks. No simulations. No z-ai-web-dev-sdk.
// Bun runtime · TypeScript · Port 9999

const SERVER_VERSION = "1.0.0";
const SERVER_PORT = 9999;
const POWERED_BY_HEADER = "ZombieCoder-by-SahonSrabon";
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const MAX_PENDING_REQUESTS = 100;
const CONNECTION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const WS_TIMEOUT_MS = 3 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface ProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  provider?: "ollama" | "openai";
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

interface WebSocketIncoming {
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

type WebSocketOutgoing =
  | WebSocketOutgoingChunk
  | WebSocketOutgoingDone
  | WebSocketOutgoingError;

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
  if (providerConfig?.endpoint && providerConfig?.model) {
    return {
      endpoint: providerConfig.endpoint.replace(/\/+$/, ""),
      model: providerConfig.model,
      format: providerConfig.provider === "openai" ? "openai" : "ollama",
      apiKey: providerConfig.apiKey,
    };
  }

  const format: "ollama" | "openai" = providerHint === "openai" ? "openai" : "ollama";
  const model = modelOverride || "llama3.1";

  if (format === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI provider requested but OPENAI_API_KEY env var is not set");
    }
    return {
      endpoint: "https://api.openai.com/v1",
      model,
      format: "openai",
      apiKey,
    };
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
): Promise<{ content: string; model: string }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
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
): Promise<{ content: string; model: string }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
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
): Promise<{ content: string; model: string }> {
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
          prompt_tokens: -1,
          completion_tokens: -1,
          total_tokens: -1,
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

          try {
            await proxyStream(resolved, body.messages, abortController.signal, (text) => {
              const chunk = {
                model: resolved.model,
                created_at: new Date().toISOString(),
                message: { role: "assistant", content: text },
                done: false,
              };
              controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
            });

            const totalDuration = Date.now() - startTime;
            const finalChunk = {
              model: resolved.model,
              created_at: new Date().toISOString(),
              message: { role: "assistant", content: "" },
              done: true,
              total_duration: totalDuration * 1_000_000, // nanoseconds
              eval_count: -1,
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
        eval_count: -1,
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

// ─── WebSocket Handler ────────────────────────────────────────────────────────

function handleWebSocket(ws: WebSocket): void {
  log("INFO", "ws", "WebSocket connection established");

  // Heartbeat / timeout
  const heartbeatInterval = setInterval(() => {
    try {
      ws.send(JSON.stringify({ type: "ping", timestamp: new Date().toISOString() }));
    } catch {
      clearInterval(heartbeatInterval);
    }
  }, 30_000);

  const timeoutId = setTimeout(() => {
    log("WARN", "ws", "WebSocket connection timeout (3 minutes)");
    ws.close(4008, "Connection timeout");
  }, WS_TIMEOUT_MS);

  ws.addEventListener("close", () => {
    clearInterval(heartbeatInterval);
    clearTimeout(timeoutId);
    log("INFO", "ws", "WebSocket connection closed");
  });

  ws.addEventListener("error", (event) => {
    clearInterval(heartbeatInterval);
    clearTimeout(timeoutId);
    log("ERROR", "ws", `WebSocket error: ${String(event)}`);
  });

  ws.addEventListener("message", async (event: MessageEvent) => {
    let data: WebSocketIncoming;

    try {
      data = JSON.parse(event.data as string) as WebSocketIncoming;
    } catch {
      ws.send(JSON.stringify({ id: "unknown", type: "error", error: "Invalid JSON" } satisfies WebSocketOutgoingError));
      return;
    }

    if (!data.id || !data.prompt && !(data.messages && data.messages.length > 0)) {
      ws.send(JSON.stringify({
        id: data.id || "unknown",
        type: "error",
        error: "id and (prompt or messages) are required",
      } satisfies WebSocketOutgoingError));
      return;
    }

    const requestId = data.id;
    log("INFO", requestId, `WS message - hasPrompt=${!!data.prompt} hasMessages=${!!data.messages?.length}`);

    // Build messages
    let messages: ChatMessage[] = [];
    if (data.systemPrompt) {
      messages.push({ role: "system", content: data.systemPrompt });
    }
    if (data.messages && data.messages.length > 0) {
      messages = messages.concat(data.messages);
    }
    if (data.prompt) {
      messages.push({ role: "user", content: data.prompt });
    }

    if (messages.length === 0) {
      ws.send(JSON.stringify({ id: requestId, type: "error", error: "No messages to send" } satisfies WebSocketOutgoingError));
      return;
    }

    const isStream = data.stream !== false; // default true

    try {
      const resolved = resolveProvider(data.providerConfig, data.provider, data.model);

      if (isStream) {
        // Streaming mode: send chunks
        await proxyStream(resolved, messages, AbortSignal.timeout(WS_TIMEOUT_MS), (text) => {
          const chunk: WebSocketOutgoingChunk = {
            id: requestId,
            type: "chunk",
            content: text,
            finishReason: null,
          };
          try {
            ws.send(JSON.stringify(chunk));
          } catch {
            // Connection might be closed
          }
        });

        const done: WebSocketOutgoingDone = {
          id: requestId,
          type: "done",
          finishReason: "stop",
        };
        try {
          ws.send(JSON.stringify(done));
        } catch {
          // Connection might be closed
        }
      } else {
        // Non-streaming mode: send single response
        const result = await proxyNonStream(
          resolved,
          messages,
          AbortSignal.timeout(WS_TIMEOUT_MS),
          { temperature: data.temperature, maxTokens: data.max_tokens },
        );

        const chunk: WebSocketOutgoingChunk = {
          id: requestId,
          type: "chunk",
          content: result.content,
          finishReason: "stop",
        };
        try {
          ws.send(JSON.stringify(chunk));
        } catch {
          // Connection might be closed
        }

        const done: WebSocketOutgoingDone = {
          id: requestId,
          type: "done",
          finishReason: "stop",
        };
        try {
          ws.send(JSON.stringify(done));
        } catch {
          // Connection might be closed
        }
      }

      log("INFO", requestId, `WS request completed (${isStream ? "streamed" : "non-stream"})`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log("ERROR", requestId, `WS error: ${errorMessage}`);
      const error: WebSocketOutgoingError = {
        id: requestId,
        type: "error",
        error: errorMessage,
      };
      try {
        ws.send(JSON.stringify(error));
      } catch {
        // Connection might be closed
      }
    }
  });
}

// ─── Main Server ──────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: SERVER_PORT,
  hostname: "0.0.0.0",

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
      handleWebSocket(ws);
    },
    message(ws, message) {
      // Handled by open handler via event listeners
    },
    close(ws, code, reason) {
      log("INFO", "ws", `WebSocket closed: code=${code} reason=${reason || "none"}`);
    },
  },
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║          🧟 ZombieCoder Stock Server v${SERVER_VERSION}               ║
║          By Sahon Srabon                                     ║
║                                                              ║
║  Listening on: http://0.0.0.0:${SERVER_PORT}                       ║
║                                                              ║
║  Endpoints:                                                  ║
║    GET  /health                  Health check                ║
║    POST /v1/chat/completions     OpenAI-compatible chat      ║
║    POST /api/chat                Ollama-compatible chat      ║
║    POST /api/generate            Ollama-compatible generate  ║
║    WS   /                        WebSocket streaming        ║
║                                                              ║
║  Default provider: Ollama @ ${DEFAULT_OLLAMA_ENDPOINT}   ║
║  Max pending: ${MAX_PENDING_REQUESTS}  |  Timeout: ${CONNECTION_TIMEOUT_MS / 1000}s         ║
╚══════════════════════════════════════════════════════════════╝
`);

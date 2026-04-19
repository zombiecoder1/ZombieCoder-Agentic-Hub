#!/usr/bin/env bun
/**
 * ZombieCoder WebSocket Server v2.0
 * Experimental Agent-First Architecture
 * 
 * Architecture Principles:
 * 1. Agent-first: Every conversation starts with agent selection
 * 2. Gateway-mediated: Uses main app API, never direct provider
 * 3. Unified sessions: Integrates with main ChatSession system
 * 4. Standard events: Consistent JSON format for all messages
 * 5. Heartbeat with ACK: Proper ping-pong for connection health
 * 6. Transparent identity: Clean ZombieCoder branding
 * 
 * @author Sahon Srabon
 * @version 2.0.0
 */

import type { ServerWebSocket } from "bun";

// ─── Configuration ─────────────────────────────────────────────────────────
const SERVER_PORT = Number(process.env.WS_PORT || 9998);
const NEXTJS_BASE_URL = process.env.NEXTJS_BASE_URL || "http://localhost:3000";
const WS_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const HEARTBEAT_TIMEOUT_MS = 60_000; // 60 seconds for ACK

// ─── Types ───────────────────────────────────────────────────────────────────

interface WebSocketClient {
  ws: ServerWebSocket;
  clientId: string;
  sessionId: string;
  hasRealSession: boolean; // true if session exists in DB
  agentId?: string;
  createdAt: number;
  lastPing: number;
  lastPong: number;
  heartbeatIntervalId: Timer;
  heartbeatTimeoutId?: Timer;
  timeoutId: Timer;
  isAlive: boolean;
}

interface StandardEvent {
  version: "2.0";
  timestamp: string;
  event: string;
  agentId?: string;
  sessionId?: string;
  conversationId?: string;
  payload?: Record<string, unknown>;
  error?: string;
}

interface ChatRequest {
  type: "chat.start";
  agentId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  sessionId?: string;
  stream?: boolean;
}

interface AgentSelectRequest {
  type: "agent.select";
  agentId: string;
}

interface HeartbeatPong {
  type: "heartbeat.pong";
  timestamp: string;
}

// ─── State Management ───────────────────────────────────────────────────────

const activeClients = new Map<string, WebSocketClient>();

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(level: "INFO" | "WARN" | "ERROR", clientId: string, message: string): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${clientId || "SYSTEM"}]`;
  console.log(`${prefix} ${message}`);
}

// ─── Event Builder ───────────────────────────────────────────────────────────

function buildEvent(
  eventType: string,
  client: WebSocketClient,
  payload?: Record<string, unknown>,
  error?: string
): StandardEvent {
  return {
    version: "2.0",
    timestamp: new Date().toISOString(),
    event: eventType,
    agentId: client.agentId,
    sessionId: client.sessionId,
    payload,
    error,
  };
}

// ─── Session Management ──────────────────────────────────────────────────────

async function createSession(clientId: string): Promise<string> {
  try {
    // Create session via main app API
    const response = await fetch(`${NEXTJS_BASE_URL}/api/chat/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, source: "websocket" }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }

    const data = await response.json();
    return data.sessionId;
  } catch (err) {
    log("ERROR", clientId, `Session creation failed: ${err}`);
    // Fallback: generate local session (will be synced later)
    return crypto.randomUUID();
  }
}

// ─── Agent Resolution ─────────────────────────────────────────────────────────

async function resolveAgent(agentId: string): Promise<{ name: string; systemPrompt: string; providerId: string } | null> {
  try {
    const response = await fetch(`${NEXTJS_BASE_URL}/api/agents/${agentId}`);
    if (!response.ok) return null;
    const result = await response.json();
    // API returns { success: true, data: agent }
    const agent = result.data || result;
    if (!agent || !agent.name) return null;
    return {
      name: agent.name,
      systemPrompt: agent.systemPrompt || null,
      providerId: agent.providerId || (agent.provider?.id) || null,
    };
  } catch {
    return null;
  }
}

// ─── Chat Processing ─────────────────────────────────────────────────────────

async function processChat(
  client: WebSocketClient,
  request: ChatRequest
): Promise<void> {
  const startTime = Date.now();
  
  log("INFO", client.clientId, `Starting chat with agent: ${request.agentId}`);

  // Validate agent
  const agent = await resolveAgent(request.agentId);
  if (!agent) {
    const errorEvent = buildEvent("error", client, undefined, "Agent not found");
    client.ws.send(JSON.stringify(errorEvent));
    return;
  }

  // Update client's agent
  client.agentId = request.agentId;

  try {
    // Send message.start event
    const startEvent = buildEvent("message.start", client, {
      agentName: agent.name,
      timestamp: new Date().toISOString(),
    });
    client.ws.send(JSON.stringify(startEvent));

    // Call main app API (NEVER direct provider)
    // Only send sessionId if it's confirmed by API (hasRealSession flag)
    const apiResponse = await fetch(`${NEXTJS_BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: request.messages,
        agentId: request.agentId,
        ...(client.hasRealSession && { sessionId: client.sessionId }),
        stream: true,
      }),
    });

    if (!apiResponse.ok || !apiResponse.body) {
      throw new Error(`API request failed: ${apiResponse.status}`);
    }

    // Stream chunks to client
    const reader = apiResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let tokenCount = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";

      for (const block of blocks) {
        const lines = block.split("\n");
        const eventLine = lines.find((l) => l.startsWith("event: "));
        const dataLine = lines.find((l) => l.startsWith("data: "));

        if (eventLine && dataLine) {
          const event = eventLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (event === "chunk" && data.content) {
            tokenCount += estimateTokens(data.content);
            const chunkEvent = buildEvent("message.chunk", client, {
              content: data.content,
            });
            client.ws.send(JSON.stringify(chunkEvent));
          }

          if (event === "session" && data.sessionId) {
            client.sessionId = data.sessionId;
            client.hasRealSession = true; // Mark as confirmed
            const sessionEvent = buildEvent("session.update", client, {
              sessionId: data.sessionId,
            });
            client.ws.send(JSON.stringify(sessionEvent));
          }
        }
      }
    }

    // Send message.end event
    const latency = Date.now() - startTime;
    const endEvent = buildEvent("message.end", client, {
      tokenCount,
      latencyMs: latency,
      finishReason: "stop",
    });
    client.ws.send(JSON.stringify(endEvent));

    log("INFO", client.clientId, `Chat completed: ${tokenCount} tokens, ${latency}ms`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log("ERROR", client.clientId, `Chat error: ${errorMessage}`);
    const errorEvent = buildEvent("error", client, undefined, errorMessage);
    client.ws.send(JSON.stringify(errorEvent));
  }
}

function estimateTokens(text: string): number {
  // Rough estimation: ~4 chars per token
  return Math.ceil(text.length / 4);
}

// ─── Heartbeat Management ────────────────────────────────────────────────────

function startHeartbeat(client: WebSocketClient): void {
  // Send ping every 30 seconds
  const intervalId = setInterval(() => {
    if (!client.isAlive) {
      log("WARN", client.clientId, "Client not responding, terminating");
      clearInterval(intervalId);
      client.ws.close(4008, "Heartbeat timeout");
      return;
    }

    client.isAlive = false;
    const pingEvent = buildEvent("heartbeat.ping", client, {
      timestamp: new Date().toISOString(),
    });
    
    try {
      client.ws.send(JSON.stringify(pingEvent));
      log("INFO", client.clientId, "Heartbeat ping sent");

      // Set timeout for ACK
      client.heartbeatTimeoutId = setTimeout(() => {
        if (!client.isAlive) {
          log("WARN", client.clientId, "No heartbeat ACK received");
          client.ws.close(4008, "No heartbeat ACK");
        }
      }, HEARTBEAT_TIMEOUT_MS);

    } catch {
      // Client disconnected
    }
  }, HEARTBEAT_INTERVAL_MS);

  client.heartbeatIntervalId = intervalId;
}

function handleHeartbeatPong(client: WebSocketClient): void {
  client.isAlive = true;
  client.lastPong = Date.now();
  
  // Clear the timeout
  if (client.heartbeatTimeoutId) {
    clearTimeout(client.heartbeatTimeoutId);
    client.heartbeatTimeoutId = undefined;
  }
  
  log("INFO", client.clientId, "Heartbeat pong received");
}

// ─── Message Handler ─────────────────────────────────────────────────────────

async function handleMessage(client: WebSocketClient, rawMessage: string): Promise<void> {
  try {
    const data = JSON.parse(rawMessage);
    const messageType = data.type || data.event;

    log("INFO", client.clientId, `Received: ${messageType}`);

    switch (messageType) {
      case "agent.select":
        const agentRequest = data as AgentSelectRequest;
        client.agentId = agentRequest.agentId;
        const agent = await resolveAgent(agentRequest.agentId);
        
        if (agent) {
          const confirmEvent = buildEvent("agent.selected", client, {
            agentId: agentRequest.agentId,
            agentName: agent.name,
          });
          client.ws.send(JSON.stringify(confirmEvent));
          log("INFO", client.clientId, `Agent selected: ${agent.name}`);
        } else {
          const errorEvent = buildEvent("error", client, undefined, "Agent not found");
          client.ws.send(JSON.stringify(errorEvent));
        }
        break;

      case "chat.start":
        const chatRequest = data as ChatRequest;
        if (!chatRequest.agentId && !client.agentId) {
          const errorEvent = buildEvent("error", client, undefined, "No agent selected");
          client.ws.send(JSON.stringify(errorEvent));
          return;
        }
        // Use request agentId or fall back to client's selected agent
        chatRequest.agentId = chatRequest.agentId || client.agentId!;
        await processChat(client, chatRequest);
        break;

      case "heartbeat.pong":
        handleHeartbeatPong(client);
        break;

      default:
        log("WARN", client.clientId, `Unknown message type: ${messageType}`);
        const errorEvent = buildEvent("error", client, undefined, `Unknown type: ${messageType}`);
        client.ws.send(JSON.stringify(errorEvent));
    }

  } catch (err) {
    log("ERROR", client.clientId, `Message parse error: ${err}`);
    const errorEvent = buildEvent("error", client, undefined, "Invalid message format");
    client.ws.send(JSON.stringify(errorEvent));
  }
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const server = Bun.serve({
  port: SERVER_PORT,
  hostname: "0.0.0.0",

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade endpoint
    if (url.pathname === "/ws") {
      const success = server.upgrade(req);
      if (success) {
        return undefined; // Upgraded to WebSocket
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        version: "2.0.0",
        clients: activeClients.size,
        timestamp: new Date().toISOString(),
      });
    }

    // Test page
    if (url.pathname === "/" || url.pathname === "/test") {
      return new Response(getTestPage(), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      const clientId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const now = Date.now();

      log("INFO", clientId, "WebSocket connection established");

      // Create client record
      const client: WebSocketClient = {
        ws,
        clientId,
        sessionId,
        hasRealSession: false, // Will be set to true when API confirms
        createdAt: now,
        lastPing: now,
        lastPong: now,
        heartbeatIntervalId: null as unknown as Timer,
        timeoutId: null as unknown as Timer,
        isAlive: true,
      };

      // Set connection timeout
      client.timeoutId = setTimeout(() => {
        log("WARN", clientId, "Connection timeout (3 minutes)");
        ws.close(4008, "Connection timeout");
      }, WS_TIMEOUT_MS);

      // Store clientId in ws.data for retrieval in message handlers
      (ws.data as unknown as { clientId: string }) = { clientId };

      // Store client
      activeClients.set(clientId, client);

      // Start heartbeat
      startHeartbeat(client);

      // Send session.init event
      const sessionEvent = buildEvent("session.init", client, {
        clientId,
        sessionId,
        message: "Welcome to ZombieCoder WebSocket Server v2.0",
        instructions: [
          "1. Select an agent using: { type: 'agent.select', agentId: '...' }",
          "2. Start chat using: { type: 'chat.start', messages: [...] }",
          "3. Respond to heartbeat.ping with heartbeat.pong",
        ],
      });
      
      ws.send(JSON.stringify(sessionEvent));

      log("INFO", clientId, `Session initialized: ${sessionId}`);
    },

    message(ws, message) {
      const clientId = getClientId(ws);
      if (!clientId) {
        ws.close(4001, "Unknown client");
        return;
      }

      const client = activeClients.get(clientId);
      if (!client) {
        ws.close(4002, "Client not found");
        return;
      }

      // Update last activity
      client.lastPing = Date.now();

      // Handle message
      const text = message.toString();
      handleMessage(client, text);
    },

    close(ws, code, reason) {
      const clientId = getClientId(ws);
      if (!clientId) return;

      const client = activeClients.get(clientId);
      if (client) {
        // Cleanup
        clearInterval(client.heartbeatIntervalId);
        clearTimeout(client.timeoutId);
        if (client.heartbeatTimeoutId) {
          clearTimeout(client.heartbeatTimeoutId);
        }

        activeClients.delete(clientId);
        log("INFO", clientId, `Connection closed: code=${code}, reason=${reason || "none"}`);
      }
    },

    ping(ws) {
      // Bun handles ping/pong at protocol level
      const clientId = getClientId(ws);
      if (clientId) {
        const client = activeClients.get(clientId);
        if (client) {
          client.lastPing = Date.now();
        }
      }
    },

    pong(ws) {
      // Bun handles ping/pong at protocol level
      const clientId = getClientId(ws);
      if (clientId) {
        const client = activeClients.get(clientId);
        if (client) {
          client.lastPong = Date.now();
        }
      }
    },
  },
});

function getClientId(ws: ServerWebSocket): string | undefined {
  // Store clientId in websocket data
  return (ws.data as unknown as { clientId?: string })?.clientId;
}

// ─── Test Page ───────────────────────────────────────────────────────────────

function getTestPage(): string {
  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZombieCoder WebSocket v2.0 - Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #0a0f1a 0%, #1a1f2e 100%);
      color: #e0e6ed;
      padding: 40px 20px;
      min-height: 100vh;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 {
      background: linear-gradient(90deg, #22c55e, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 10px;
    }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    
    .card {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
    }
    
    .status {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: bold;
    }
    .status.connected { background: #22c55e; color: white; }
    .status.disconnected { background: #ef4444; color: white; }
    .status.connecting { background: #f59e0b; color: white; }
    
    input, select, button, textarea {
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(15, 23, 42, 0.9);
      color: #e0e6ed;
      font-size: 1rem;
      margin: 5px;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #22c55e;
    }
    button {
      background: linear-gradient(90deg, #22c55e, #16a34a);
      border: none;
      cursor: pointer;
      font-weight: bold;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .log-container {
      background: #0d1117;
      border-radius: 8px;
      padding: 15px;
      height: 400px;
      overflow-y: auto;
      font-family: 'Fira Code', monospace;
      font-size: 0.85rem;
    }
    .log-entry {
      margin-bottom: 8px;
      padding: 8px;
      border-radius: 6px;
    }
    .log-entry.in { background: rgba(34, 197, 94, 0.1); border-left: 3px solid #22c55e; }
    .log-entry.out { background: rgba(59, 130, 246, 0.1); border-left: 3px solid #3b82f6; }
    .log-entry.error { background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; }
    .log-entry.system { background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; }
    .timestamp { color: #64748b; font-size: 0.75rem; }
    
    .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px; }
    
    .agent-badge {
      display: inline-block;
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid #f59e0b;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      color: #fbbf24;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🧟 ZombieCoder WebSocket v2.0</h1>
    <p class="subtitle">Experimental Agent-First Architecture Test</p>
    
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <div>
          <span id="status" class="status disconnected">Disconnected</span>
          <span id="agent-badge" class="agent-badge" style="display: none; margin-left: 10px;">No Agent</span>
        </div>
        <div>
          <button id="connect-btn" onclick="connect()">Connect</button>
          <button id="disconnect-btn" onclick="disconnect()" disabled>Disconnect</button>
        </div>
      </div>
      
      <div class="controls">
        <select id="agent-select">
          <option value="">Select Agent...</option>
          <option value="assistant">General Assistant</option>
          <option value="coder">Code Expert</option>
          <option value="researcher">Research Agent</option>
        </select>
        <button onclick="selectAgent()" id="select-agent-btn" disabled>Select Agent</button>
      </div>
      
      <div class="controls">
        <input type="text" id="message-input" placeholder="Type your message..." style="flex: 1;" disabled>
        <button onclick="sendMessage()" id="send-btn" disabled>Send</button>
      </div>
    </div>
    
    <div class="card">
      <h3 style="margin-bottom: 15px; color: #22c55e;">📡 Event Log</h3>
      <div id="log" class="log-container"></div>
      <button onclick="clearLog()" style="margin-top: 10px;">Clear Log</button>
    </div>
  </div>

  <script>
    let ws = null;
    let currentAgent = null;
    let messageBuffer = '';
    
    function log(message, type = 'system') {
      const container = document.getElementById('log');
      const entry = document.createElement('div');
      entry.className = 'log-entry ' + type;
      entry.innerHTML = '<span class="timestamp">' + new Date().toLocaleTimeString() + '</span> ' + message;
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;
    }
    
    function clearLog() {
      document.getElementById('log').innerHTML = '';
    }
    
    function updateStatus(status) {
      const el = document.getElementById('status');
      el.textContent = status;
      el.className = 'status ' + status.toLowerCase();
    }
    
    function updateUI(connected) {
      document.getElementById('connect-btn').disabled = connected;
      document.getElementById('disconnect-btn').disabled = !connected;
      document.getElementById('select-agent-btn').disabled = !connected;
      document.getElementById('message-input').disabled = !connected || !currentAgent;
      document.getElementById('send-btn').disabled = !connected || !currentAgent;
    }
    
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/ws';
      
      updateStatus('Connecting');
      log('Connecting to ' + wsUrl, 'system');
      
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        updateStatus('Connected');
        log('WebSocket connected', 'system');
        updateUI(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const pretty = JSON.stringify(data, null, 2);
          
          if (data.event === 'heartbeat.ping') {
            // Auto-respond to heartbeat
            ws.send(JSON.stringify({ type: 'heartbeat.pong', timestamp: new Date().toISOString() }));
            log('heartbeat.pong sent (auto)', 'out');
          }
          
          if (data.event === 'agent.selected') {
            currentAgent = data.payload?.agentName;
            document.getElementById('agent-badge').textContent = currentAgent;
            document.getElementById('agent-badge').style.display = 'inline-block';
            updateUI(true);
          }
          
          if (data.event === 'message.chunk') {
            messageBuffer += data.payload?.content || '';
          }
          
          if (data.event === 'message.end') {
            log('Response complete: ' + messageBuffer.slice(0, 100) + '...', 'in');
            messageBuffer = '';
          }
          
          log('← ' + data.event + '\\n' + pretty, 'in');
        } catch (e) {
          log('← ' + event.data, 'in');
        }
      };
      
      ws.onerror = (error) => {
        log('Error: ' + error, 'error');
      };
      
      ws.onclose = () => {
        updateStatus('Disconnected');
        log('WebSocket closed', 'system');
        updateUI(false);
        ws = null;
        currentAgent = null;
        document.getElementById('agent-badge').style.display = 'none';
      };
    }
    
    function disconnect() {
      if (ws) {
        ws.close();
      }
    }
    
    function selectAgent() {
      const agentId = document.getElementById('agent-select').value;
      if (!agentId) {
        alert('Please select an agent');
        return;
      }
      
      const msg = { type: 'agent.select', agentId };
      ws.send(JSON.stringify(msg));
      log('→ agent.select\\n' + JSON.stringify(msg, null, 2), 'out');
    }
    
    function sendMessage() {
      const input = document.getElementById('message-input');
      const content = input.value.trim();
      if (!content) return;
      
      const msg = {
        type: 'chat.start',
        agentId: currentAgent,
        messages: [{ role: 'user', content }],
        stream: true
      };
      
      ws.send(JSON.stringify(msg));
      log('→ chat.start\\n' + JSON.stringify(msg, null, 2), 'out');
      input.value = '';
    }
    
    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`;
}

// ─── Startup ─────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║          🧟 ZombieCoder WebSocket Server v2.0 (Experimental)                   ║
║                                                                              ║
║  Architecture: Agent-First | Gateway-Mediated | Standard Events              ║
║                                                                              ║
║  Features:                                                                   ║
║    ✓ Agent selection before chat                                             ║
║    ✓ Uses main app API (never direct provider)                             ║
║    ✓ Unified session management                                              ║
║    ✓ Standard event format (v2.0)                                            ║
║    ✓ Heartbeat with ACK (ping-pong)                                          ║
║    ✓ Clean identity (ZombieCoder-by-SahonSrabon)                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

console.log(`🚀 Server running on ws://localhost:${SERVER_PORT}`);
console.log(`🧪 Test page: http://localhost:${SERVER_PORT}/test`);
console.log(`💚 Health check: http://localhost:${SERVER_PORT}/health`);
console.log(`🔗 Connected to: ${NEXTJS_BASE_URL}`);
console.log(`\nPress Ctrl+C to stop\n`);

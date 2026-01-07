#!/usr/bin/env node

import http from "http";
import crypto from "crypto";

// ========== CONFIGURAÇÕES ==========
const ADVBOX_API_TOKEN = process.env.ADVBOX_API_TOKEN;
const ADVBOX_BASE_URL = process.env.ADVBOX_BASE_URL || "https://app.advbox.com.br/api/v1";
const PORT = parseInt(process.env.PORT || "3000");
const MCP_TOKEN = process.env.MCP_TOKEN;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",");
const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || "https://localhost:3000";

// Limites de segurança
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const RATE_LIMIT_MAX = 100; // requests por minuto
const MAX_RATE_LIMIT_ENTRIES = 10000; // máximo de IPs no map
const MAX_SSE_PER_IP = 5; // máximo de conexões SSE por IP
const SSE_TIMEOUT = 3600000; // 1 hora timeout SSE
const MAX_SSE_CONNECTIONS = 100; // máximo total de SSE

if (!ADVBOX_API_TOKEN) {
  console.error("Error: ADVBOX_API_TOKEN required");
  process.exit(1);
}

if (!MCP_TOKEN) {
  console.error("Error: MCP_TOKEN required");
  process.exit(1);
}

// ========== RATE LIMITING ==========
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const sseCountPerIP = new Map<string, number>();

function checkRateLimit(ip: string): boolean {
  // Proteção contra memory exhaustion
  if (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
    // Remove entradas mais antigas
    const now = Date.now();
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) rateLimitMap.delete(key);
      if (rateLimitMap.size < MAX_RATE_LIMIT_ENTRIES * 0.8) break;
    }
  }

  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}

// Limpeza periódica
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) rateLimitMap.delete(ip);
  }
}, 300000);

// ========== AUTENTICAÇÃO SEGURA ==========
function checkAuth(req: http.IncomingMessage): boolean {
  if (!MCP_TOKEN) return false;
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  
  if (token.length !== MCP_TOKEN.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, "utf8"),
      Buffer.from(MCP_TOKEN, "utf8")
    );
  } catch {
    return false;
  }
}

// ========== VALIDAÇÃO DE INPUT ==========
function sanitizeId(id: any): number | null {
  if (id === undefined || id === null) return null;
  const num = parseInt(String(id), 10);
  if (isNaN(num) || num < 0 || num > 999999999) return null;
  return num;
}

function sanitizeString(str: any, maxLen: number = 500): string | null {
  if (str === undefined || str === null) return null;
  const s = String(str).trim();
  if (s.length === 0 || s.length > maxLen) return null;
  return s.replace(/[<>"'`\\]/g, "");
}

function sanitizeDate(date: any): string | null {
  if (!date) return null;
  const d = String(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  // Valida se é data válida
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return null;
  return d;
}

function sanitizeEmail(email: any): string | null {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  if (e.length > 100) return null;
  return e;
}

function sanitizeArgs(args: any): Record<string, any> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(args)) {
    // Proteção contra prototype pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (typeof key !== "string" || key.length > 50) continue;
    clean[key] = value;
  }
  return clean;
}

// ========== SSE CONNECTIONS ==========
interface SSEConnection {
  res: http.ServerResponse;
  ip: string;
  createdAt: number;
  pingInterval: NodeJS.Timeout;
  timeout: NodeJS.Timeout;
}
const sseConnections = new Map<string, SSEConnection>();

function cleanupSSE(sessionId: string) {
  const conn = sseConnections.get(sessionId);
  if (conn) {
    clearInterval(conn.pingInterval);
    clearTimeout(conn.timeout);
    const count = sseCountPerIP.get(conn.ip) || 0;
    if (count > 1) sseCountPerIP.set(conn.ip, count - 1);
    else sseCountPerIP.delete(conn.ip);
    sseConnections.delete(sessionId);
    console.log(`SSE cleanup: ${sessionId.substring(0,8)}...`);
  }
}

// ========== ADVBOX API REQUEST ==========
async function advboxRequest(endpoint: string, method: string = "GET", params?: Record<string, any>, body?: Record<string, any>): Promise<any> {
  if (!/^\/[a-zA-Z0-9\/_-]+$/.test(endpoint)) {
    throw new Error("Invalid endpoint");
  }
  
  let url = `${ADVBOX_BASE_URL}${endpoint}`;
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    url += `?${searchParams.toString()}`;
  }
  
  const headers: Record<string, string> = { 
    "Authorization": `Bearer ${ADVBOX_API_TOKEN}`, 
    "Content-Type": "application/json", 
    "Accept": "application/json",
    "User-Agent": "AdvboxMCP/2.2.0"
  };
  
  const options: RequestInit = { method, headers };
  if (body && ["POST", "PUT", "PATCH"].includes(method)) {
    options.body = JSON.stringify(body);
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  options.signal = controller.signal;
  
  try {
    const response = await fetch(url, options);
    clearTimeout(timeout);
    if (!response.ok) {
      console.error(`API Error: ${response.status} on ${method} ${endpoint}`);
      throw new Error(`API error ${response.status}`);
    }
    return response.json();
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Request timeout");
    throw e;
  }
}

// ========== TOOLS ==========
const mcpTools = [
  { name: "list_customers", description: "List customers", inputSchema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, city: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_customer", description: "Get customer by ID", inputSchema: { type: "object", properties: { customer_id: { type: "number" } }, required: ["customer_id"] } },
  { name: "search_customers", description: "Search customers", inputSchema: { type: "object", properties: { query: { type: "string" }, name: { type: "string" } } } },
  { name: "create_customer", description: "Create customer", inputSchema: { type: "object", properties: { users_id: { type: "number" }, customers_origins_id: { type: "number" }, name: { type: "string" }, email: { type: "string" }, document: { type: "string" }, identification: { type: "string" }, phone: { type: "string" }, birthdate: { type: "string" } }, required: ["users_id", "customers_origins_id", "name"] } },
  { name: "list_lawsuits", description: "List lawsuits", inputSchema: { type: "object", properties: { name: { type: "string" }, process_number: { type: "string" }, customer_id: { type: "number" }, responsible_id: { type: "number" }, group_id: { type: "number" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_lawsuit", description: "Get lawsuit by ID", inputSchema: { type: "object", properties: { lawsuit_id: { type: "number" } }, required: ["lawsuit_id"] } },
  { name: "search_lawsuits", description: "Search lawsuits", inputSchema: { type: "object", properties: { query: { type: "string" }, name: { type: "string" } } } },
  { name: "create_lawsuit", description: "Create lawsuit", inputSchema: { type: "object", properties: { users_id: { type: "number" }, customers_id: { type: "array", items: { type: "number" } }, stages_id: { type: "number" }, type_lawsuits_id: { type: "number" }, process_number: { type: "string" }, protocol_number: { type: "string" }, folder: { type: "string" }, date: { type: "string" }, notes: { type: "string" } }, required: ["users_id", "customers_id", "stages_id", "type_lawsuits_id"] } },
  { name: "update_lawsuit", description: "Update lawsuit", inputSchema: { type: "object", properties: { lawsuit_id: { type: "number" }, users_id: { type: "number" }, stages_id: { type: "number" }, type_lawsuits_id: { type: "number" }, process_number: { type: "string" }, protocol_number: { type: "string" }, folder: { type: "string" }, date: { type: "string" }, notes: { type: "string" } }, required: ["lawsuit_id"] } },
  { name: "list_transactions", description: "List transactions", inputSchema: { type: "object", properties: { date_payment_start: { type: "string" }, date_payment_end: { type: "string" }, date_due_start: { type: "string" }, date_due_end: { type: "string" }, lawsuit_id: { type: "number" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "get_transaction", description: "Get transaction by ID", inputSchema: { type: "object", properties: { transaction_id: { type: "number" } }, required: ["transaction_id"] } },
  { name: "get_users_rewards", description: "Get rewards", inputSchema: { type: "object", properties: { date: { type: "string" } } } },
  { name: "get_settings", description: "Get settings", inputSchema: { type: "object", properties: {} } },
  { name: "get_users", description: "Get users", inputSchema: { type: "object", properties: {} } },
  { name: "get_origins", description: "Get origins", inputSchema: { type: "object", properties: {} } },
  { name: "get_stages", description: "Get stages", inputSchema: { type: "object", properties: {} } },
  { name: "get_type_lawsuits", description: "Get lawsuit types", inputSchema: { type: "object", properties: {} } },
  { name: "list_tasks", description: "List tasks", inputSchema: { type: "object", properties: { date_start: { type: "string" }, date_end: { type: "string" }, user_id: { type: "number" }, lawsuit_id: { type: "number" }, task_id: { type: "number" }, limit: { type: "number" }, offset: { type: "number" } } } },
  { name: "create_task", description: "Create task", inputSchema: { type: "object", properties: { from: { type: "number" }, guests: { type: "array", items: { type: "number" } }, tasks_id: { type: "number" }, lawsuits_id: { type: "number" }, start_date: { type: "string" }, start_time: { type: "string" }, end_date: { type: "string" }, end_time: { type: "string" }, date_deadline: { type: "string" }, comments: { type: "string" }, local: { type: "string" }, urgent: { type: "boolean" }, important: { type: "boolean" } }, required: ["from", "guests", "tasks_id", "lawsuits_id", "start_date"] } }
];

// ========== TOOL HANDLERS ==========
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  list_customers: async (a) => {
    const limit = Math.min(sanitizeId(a.limit) || 100, 500);
    return advboxRequest("/customers", "GET", { name: sanitizeString(a.name), phone: sanitizeString(a.phone), email: sanitizeEmail(a.email), city: sanitizeString(a.city), limit, offset: sanitizeId(a.offset) || 0 });
  },
  get_customer: async (a) => {
    const id = sanitizeId(a.customer_id);
    if (!id) throw new Error("Invalid customer_id");
    return advboxRequest(`/customers/${id}`);
  },
  search_customers: async (a) => {
    const query = sanitizeString(a.name || a.query);
    if (!query) throw new Error("Query required");
    return advboxRequest("/customers", "GET", { name: query, limit: 100 });
  },
  create_customer: async (a) => {
    const users_id = sanitizeId(a.users_id);
    const customers_origins_id = sanitizeId(a.customers_origins_id);
    const name = sanitizeString(a.name, 200);
    if (!users_id || !customers_origins_id || !name) throw new Error("Missing required");
    return advboxRequest("/customers", "POST", undefined, { users_id, customers_origins_id, name, email: sanitizeEmail(a.email), document: sanitizeString(a.document, 20), identification: sanitizeString(a.identification, 30), phone: sanitizeString(a.phone, 20), birthdate: sanitizeDate(a.birthdate) });
  },
  list_lawsuits: async (a) => {
    const limit = Math.min(sanitizeId(a.limit) || 100, 500);
    return advboxRequest("/lawsuits", "GET", { name: sanitizeString(a.name), process_number: sanitizeString(a.process_number), customer_id: sanitizeId(a.customer_id), responsible_id: sanitizeId(a.responsible_id), group_id: sanitizeId(a.group_id), limit, offset: sanitizeId(a.offset) || 0 });
  },
  get_lawsuit: async (a) => {
    const id = sanitizeId(a.lawsuit_id);
    if (!id) throw new Error("Invalid lawsuit_id");
    return advboxRequest(`/lawsuits/${id}`);
  },
  search_lawsuits: async (a) => {
    const query = sanitizeString(a.name || a.query);
    if (!query) throw new Error("Query required");
    return advboxRequest("/lawsuits", "GET", { name: query, limit: 100 });
  },
  create_lawsuit: async (a) => {
    const users_id = sanitizeId(a.users_id);
    const stages_id = sanitizeId(a.stages_id);
    const type_lawsuits_id = sanitizeId(a.type_lawsuits_id);
    if (!users_id || !stages_id || !type_lawsuits_id || !Array.isArray(a.customers_id)) throw new Error("Missing required");
    const customers_id = a.customers_id.map(sanitizeId).filter(Boolean);
    if (customers_id.length === 0) throw new Error("Invalid customers_id");
    return advboxRequest("/lawsuits", "POST", undefined, { users_id, customers_id, stages_id, type_lawsuits_id, process_number: sanitizeString(a.process_number, 50), protocol_number: sanitizeString(a.protocol_number, 50), folder: sanitizeString(a.folder, 200), date: sanitizeDate(a.date), notes: sanitizeString(a.notes, 5000) });
  },
  update_lawsuit: async (a) => {
    const lawsuit_id = sanitizeId(a.lawsuit_id);
    if (!lawsuit_id) throw new Error("Invalid lawsuit_id");
    const data: any = {};
    if (a.users_id) data.users_id = sanitizeId(a.users_id);
    if (a.stages_id) data.stages_id = sanitizeId(a.stages_id);
    if (a.type_lawsuits_id) data.type_lawsuits_id = sanitizeId(a.type_lawsuits_id);
    if (a.process_number) data.process_number = sanitizeString(a.process_number, 50);
    if (a.protocol_number) data.protocol_number = sanitizeString(a.protocol_number, 50);
    if (a.folder) data.folder = sanitizeString(a.folder, 200);
    if (a.date) data.date = sanitizeDate(a.date);
    if (a.notes) data.notes = sanitizeString(a.notes, 5000);
    return advboxRequest(`/lawsuits/${lawsuit_id}`, "PUT", undefined, data);
  },
  list_transactions: async (a) => {
    const limit = Math.min(sanitizeId(a.limit) || 100, 500);
    return advboxRequest("/transactions", "GET", { date_payment_start: sanitizeDate(a.date_payment_start), date_payment_end: sanitizeDate(a.date_payment_end), date_due_start: sanitizeDate(a.date_due_start), date_due_end: sanitizeDate(a.date_due_end), lawsuit_id: sanitizeId(a.lawsuit_id), limit, offset: sanitizeId(a.offset) || 0 });
  },
  get_transaction: async (a) => {
    const id = sanitizeId(a.transaction_id);
    if (!id) throw new Error("Invalid transaction_id");
    return advboxRequest(`/transactions/${id}`);
  },
  get_users_rewards: async (a) => advboxRequest("/users/rewards", "GET", { date: sanitizeDate(a.date) }),
  get_settings: async () => advboxRequest("/settings"),
  get_users: async () => { const r = await advboxRequest("/settings"); return r.users; },
  get_origins: async () => { const r = await advboxRequest("/settings"); return r.origins; },
  get_stages: async () => { const r = await advboxRequest("/settings"); return r.stages; },
  get_type_lawsuits: async () => { const r = await advboxRequest("/settings"); return r.type_lawsuits; },
  list_tasks: async (a) => {
    const limit = Math.min(sanitizeId(a.limit) || 100, 500);
    return advboxRequest("/posts", "GET", { date_start: sanitizeDate(a.date_start), date_end: sanitizeDate(a.date_end), user_id: sanitizeId(a.user_id), lawsuit_id: sanitizeId(a.lawsuit_id), task_id: sanitizeId(a.task_id), limit, offset: sanitizeId(a.offset) || 0 });
  },
  create_task: async (a) => {
    const from = sanitizeId(a.from);
    const tasks_id = sanitizeId(a.tasks_id);
    const lawsuits_id = sanitizeId(a.lawsuits_id);
    const start_date = sanitizeDate(a.start_date);
    if (!from || !tasks_id || !lawsuits_id || !start_date || !Array.isArray(a.guests)) throw new Error("Missing required");
    const guests = a.guests.map(sanitizeId).filter(Boolean);
    if (guests.length === 0) throw new Error("Invalid guests");
    return advboxRequest("/posts", "POST", undefined, { from, guests, tasks_id, lawsuits_id, start_date, start_time: sanitizeString(a.start_time, 5), end_date: sanitizeDate(a.end_date), end_time: sanitizeString(a.end_time, 5), date_deadline: sanitizeDate(a.date_deadline), comments: sanitizeString(a.comments, 2000), local: sanitizeString(a.local, 200), urgent: Boolean(a.urgent), important: Boolean(a.important) });
  }
};

// ========== MCP HANDLER ==========
async function handleMcpMessage(msg: any): Promise<any> {
  const { jsonrpc, id, method, params } = msg;
  if (jsonrpc !== "2.0") return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  
  try {
    switch (method) {
      case "initialize":
        return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "advbox-mcp-server", version: "2.2.0" } } };
      case "notifications/initialized":
        return null;
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: mcpTools } };
      case "tools/call":
        const cleanParams = sanitizeArgs(params || {});
        const { name, arguments: args } = cleanParams;
        if (!name || typeof name !== "string") return { jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params" } };
        const handler = toolHandlers[name];
        if (!handler) return { jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool" } };
        try {
          const cleanArgs = sanitizeArgs(args || {});
          const result = await handler(cleanArgs);
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
        } catch (e: any) {
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } };
        }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
    }
  } catch (e: any) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } };
  }
}

function sendSSE(res: http.ServerResponse, event: string, data: any) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
}

async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    const timeout = setTimeout(() => { req.destroy(); reject(new Error("Timeout")); }, 30000);
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) { clearTimeout(timeout); req.destroy(); reject(new Error("Body too large")); return; }
      body += chunk;
    });
    req.on("end", () => { clearTimeout(timeout); try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

function getClientIP(req: http.IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function getCorsOrigin(req: http.IncomingMessage): string {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) return origin;
  return ALLOWED_ORIGINS[0];
}

// ========== HTTP SERVER ==========
const server = http.createServer(async (req, res) => {
  const clientIP = getClientIP(req);
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;
  
  // Security Headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Access-Control-Allow-Origin", getCorsOrigin(req));
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // Health (público)
  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", version: "2.2.0", tools: mcpTools.length, sse: sseConnections.size }));
    return;
  }

  // Rate Limit
  if (!checkRateLimit(clientIP)) {
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "Too Many Requests" }));
    return;
  }

  // Auth
  if (!checkAuth(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // SSE
  if (pathname === "/sse") {
    // Limite de conexões SSE
    if (sseConnections.size >= MAX_SSE_CONNECTIONS) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many connections" }));
      return;
    }
    const ipSSE = sseCountPerIP.get(clientIP) || 0;
    if (ipSSE >= MAX_SSE_PER_IP) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many SSE per IP" }));
      return;
    }

    const sessionId = crypto.randomUUID();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    sendSSE(res, "endpoint", `${MCP_PUBLIC_URL}/message?sessionId=${sessionId}`);
    
    const pingInterval = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, 30000);
    const timeout = setTimeout(() => { res.end(); cleanupSSE(sessionId); }, SSE_TIMEOUT);
    
    sseConnections.set(sessionId, { res, ip: clientIP, createdAt: Date.now(), pingInterval, timeout });
    sseCountPerIP.set(clientIP, ipSSE + 1);
    console.log(`SSE: ${sessionId.substring(0,8)}... [${sseConnections.size}/${MAX_SSE_CONNECTIONS}]`);
    
    req.on("close", () => cleanupSSE(sessionId));
    return;
  }

  // Message
  if (pathname === "/message" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || !/^[a-f0-9-]{36}$/.test(sessionId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid sessionId" }));
      return;
    }
    const conn = sseConnections.get(sessionId);
    if (!conn) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    try {
      const msg = await parseBody(req);
      const response = await handleMcpMessage(msg);
      if (response) sendSSE(conn.res, "message", response);
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "accepted" }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    }
    return;
  }

  // Tools
  if (pathname === "/tools" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tools: mcpTools }));
    return;
  }

  // Execute
  if (pathname === "/execute" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { tool, arguments: args } = sanitizeArgs(body);
      if (!tool || typeof tool !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid tool" }));
        return;
      }
      const handler = toolHandlers[tool];
      if (!handler) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unknown tool" }));
        return;
      }
      const result = await handler(sanitizeArgs(args || {}));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.timeout = 120000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, () => {
  console.log(`Advbox MCP Server v2.2.0 (Hardened) on port ${PORT}`);
  console.log(`Tools: ${mcpTools.length} | Max SSE: ${MAX_SSE_CONNECTIONS}`);
});

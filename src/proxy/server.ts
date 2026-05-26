import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { ToolConfig } from "../shared/types.js";
import {
  anthropicMessageToChatRequest,
  chatCompletionToAnthropicMessage,
  createAnthropicStreamEvents,
  formatSseEvent,
  type AnthropicMessageRequest,
  type ChatCompletionResponse,
  type ChatStreamChunk
} from "./anthropic-chat.js";
import { chatCompletionToResponses, responsesToChatCompletionRequest, type ResponsesRequest } from "./responses.js";
import { parseOpenAiSseStream } from "./sse.js";

type FetchLike = (input: string, init: RequestInit) => Promise<{
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: ReadableStream<Uint8Array> | null;
  json?(): Promise<unknown>;
  text?(): Promise<string>;
}>;

export interface StartProxyServerInput {
  profileId: string;
  config: ToolConfig;
  host?: string;
  port?: number;
  fetchImpl?: FetchLike;
}

export interface ProxyServerHandle {
  baseURL: string;
  close(): Promise<void>;
}

export async function startProxyServer(input: StartProxyServerInput): Promise<ProxyServerHandle> {
  const profile = input.config.profiles[input.profileId];
  if (!profile) {
    throw new Error(`Unknown provider profile: ${input.profileId}`);
  }

  const host = input.host ?? input.config.proxy.host;
  const port = input.port ?? input.config.proxy.port;
  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as FetchLike);
  const authToken = input.config.proxy.authToken;

  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        writeJson(response, 200, { ok: true, profile: profile.id });
        return;
      }

      if (!isAuthorized(request, authToken)) {
        writeJson(response, 401, { error: { type: "authentication_error", message: "Missing or invalid proxy token" } });
        return;
      }

      if (request.method === "GET" && request.url === "/v1/models") {
        writeJson(response, 200, {
          data: profile.models.map((model) => ({ id: model, display_name: model }))
        });
        return;
      }

      if (request.method === "POST" && request.url === "/v1/messages") {
        await handleMessages(request, response, profile, fetchImpl);
        return;
      }

      if (request.method === "POST" && (request.url === "/v1/chat/completions" || request.url === "/v1/completions")) {
        await passthroughOpenAi(request, response, profile, fetchImpl, request.url);
        return;
      }

      if (request.method === "POST" && request.url === "/v1/responses") {
        await handleResponses(request, response, profile, fetchImpl);
        return;
      }

      writeJson(response, 404, { error: { type: "not_found_error", message: "Not found" } });
    } catch (error) {
      writeJson(response, statusForError(error), {
        error: { type: "invalid_request_error", message: error instanceof Error ? error.message : String(error) }
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address() as AddressInfo;
  return {
    baseURL: `http://${address.address}:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function passthroughOpenAi(
  request: IncomingMessage,
  response: ServerResponse,
  profile: ToolConfig["profiles"][string],
  fetchImpl: FetchLike,
  path: string
) {
  const body = await readRaw(request);
  const upstream = await fetchImpl(`${profile.baseURL.replace(/\/+$/, "")}${path.replace(/^\/v1/, "")}`, {
    method: "POST",
    headers: {
      "content-type": request.headers["content-type"] ?? "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {})
    },
    body: new Uint8Array(body)
  });

  if (!upstream.ok) {
    const message = upstream.text ? await upstream.text() : upstream.statusText;
    writeJson(response, upstream.status ?? 502, { error: { type: "upstream_error", message } });
    return;
  }

  if (isStreamingOpenAiRequest(body) && upstream.body) {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8"
    });
    for await (const chunk of upstream.body) {
      response.write(Buffer.from(chunk));
    }
    response.end();
    return;
  }

  if (!upstream.json) {
    throw new Error("Upstream response did not include JSON");
  }
  writeJson(response, 200, await upstream.json());
}

function isStreamingOpenAiRequest(body: Buffer): boolean {
  try {
    return Boolean((JSON.parse(body.toString("utf8")) as { stream?: unknown }).stream);
  } catch {
    return false;
  }
}

async function handleResponses(
  request: IncomingMessage,
  response: ServerResponse,
  profile: ToolConfig["profiles"][string],
  fetchImpl: FetchLike
) {
  const body = (await readJson(request)) as ResponsesRequest;
  const chatRequest = responsesToChatCompletionRequest(body);
  const upstream = await fetchImpl(`${profile.baseURL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {})
    },
    body: JSON.stringify(chatRequest)
  });

  if (!upstream.ok) {
    const message = upstream.text ? await upstream.text() : upstream.statusText;
    writeJson(response, upstream.status ?? 502, { error: { type: "upstream_error", message } });
    return;
  }

  if (!upstream.json) {
    throw new Error("Upstream response did not include JSON");
  }

  writeJson(response, 200, chatCompletionToResponses((await upstream.json()) as ChatCompletionResponse));
}

async function handleMessages(
  request: IncomingMessage,
  response: ServerResponse,
  profile: ToolConfig["profiles"][string],
  fetchImpl: FetchLike
) {
  const body = normalizeAnthropicModel((await readJson(request)) as AnthropicMessageRequest, profile);
  const chatRequest = anthropicMessageToChatRequest(body);
  const upstream = await fetchImpl(`${profile.baseURL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {})
    },
    body: JSON.stringify(chatRequest)
  });

  if (!upstream.ok) {
    const message = upstream.text ? await upstream.text() : upstream.statusText;
    writeJson(response, upstream.status ?? 502, { error: { type: "upstream_error", message } });
    return;
  }

  if (body.stream) {
    if (!upstream.body) {
      throw new Error("Upstream streaming response did not include a body");
    }
    const chunks = (await parseOpenAiSseStream(upstream.body)) as ChatStreamChunk[];
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    for (const event of createAnthropicStreamEvents(chunks, body.model)) {
      response.write(formatSseEvent(event));
    }
    response.end();
    return;
  }

  if (!upstream.json) {
    throw new Error("Upstream response did not include JSON");
  }
  writeJson(response, 200, chatCompletionToAnthropicMessage((await upstream.json()) as ChatCompletionResponse));
}

function normalizeAnthropicModel(
  body: AnthropicMessageRequest,
  profile: ToolConfig["profiles"][string]
): AnthropicMessageRequest {
  if (!isClaudeModelAlias(body.model) || profile.models.includes(body.model) || profile.models.length === 0) {
    return body;
  }

  return {
    ...body,
    model: profile.models[0]
  };
}

function isClaudeModelAlias(model: string): boolean {
  return /(^claude-|sonnet|opus|haiku)/i.test(model);
}

function isAuthorized(request: IncomingMessage, authToken: string): boolean {
  const authorization = request.headers.authorization;
  const apiKey = request.headers["x-api-key"];
  return authorization === `Bearer ${authToken}` || apiKey === authToken;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  return JSON.parse((await readRaw(request)).toString("utf8") || "{}");
}

async function readRaw(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function statusForError(error: unknown): number {
  return error instanceof Error && error.message.startsWith("Unsupported Anthropic content block type") ? 400 : 500;
}

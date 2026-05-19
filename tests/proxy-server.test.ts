import { afterEach, describe, expect, it, vi } from "vitest";
import { startProxyServer, type ProxyServerHandle } from "../src/proxy/server";
import type { ToolConfig } from "../src/shared/types";

const servers: ProxyServerHandle[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function toolConfig(): ToolConfig {
  return {
    profiles: {
      local: {
        id: "local",
        name: "Local",
        baseURL: "http://upstream.test/v1",
        apiKey: "sk-upstream",
        models: ["qwen"]
      }
    },
    proxy: { host: "127.0.0.1", port: 0, authToken: "mpx-token" }
  };
}

describe("proxy server", () => {
  it("serves health and gateway model discovery", async () => {
    const server = await startProxyServer({
      profileId: "local",
      config: toolConfig(),
      host: "127.0.0.1",
      port: 0,
      fetchImpl: vi.fn()
    });
    servers.push(server);

    const health = await fetch(`${server.baseURL}/health`);
    const models = await fetch(`${server.baseURL}/v1/models`, {
      headers: { Authorization: "Bearer mpx-token" }
    });

    expect(await health.json()).toEqual({ ok: true, profile: "local" });
    expect(await models.json()).toEqual({
      data: [{ id: "qwen", display_name: "qwen" }]
    });
  });

  it("proxies non-streaming Messages requests to chat completions", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "chatcmpl_1",
        model: "qwen",
        choices: [{ message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 1 }
      })
    });
    const server = await startProxyServer({
      profileId: "local",
      config: toolConfig(),
      host: "127.0.0.1",
      port: 0,
      fetchImpl
    });
    servers.push(server);

    const response = await fetch(`${server.baseURL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer mpx-token"
      },
      body: JSON.stringify({
        model: "qwen",
        max_tokens: 128,
        messages: [{ role: "user", content: "Hello" }]
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "hello" }]
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://upstream.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-upstream" })
      })
    );
  });

  it("emits Anthropic streaming events for chat completion streams", async () => {
    const upstreamBody = [
      'data: {"id":"chatcmpl_1","model":"qwen","choices":[{"delta":{"content":"Hi"}}]}',
      'data: {"id":"chatcmpl_1","model":"qwen","choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}',
      "data: [DONE]",
      ""
    ].join("\n\n");
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: new Response(upstreamBody).body
    });
    const server = await startProxyServer({
      profileId: "local",
      config: toolConfig(),
      host: "127.0.0.1",
      port: 0,
      fetchImpl
    });
    servers.push(server);

    const response = await fetch(`${server.baseURL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer mpx-token"
      },
      body: JSON.stringify({
        model: "qwen",
        max_tokens: 128,
        stream: true,
        messages: [{ role: "user", content: "Hello" }]
      })
    });

    const text = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain('"text":"Hi"');
    expect(text).toContain("event: message_stop");
  });
});

import { describe, expect, it } from "vitest";
import {
  anthropicMessageToChatRequest,
  chatCompletionToAnthropicMessage,
  createAnthropicStreamEvents
} from "../src/proxy/anthropic-chat";

describe("Anthropic Messages and Chat Completions conversion", () => {
  it("converts a text Messages request to a chat completion request", () => {
    const chat = anthropicMessageToChatRequest({
      model: "qwen",
      system: "You are concise.",
      max_tokens: 256,
      temperature: 0.2,
      top_p: 0.9,
      stop_sequences: ["</done>"],
      stream: false,
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }]
    });

    expect(chat).toEqual({
      model: "qwen",
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "Hello" }
      ],
      max_tokens: 256,
      temperature: 0.2,
      top_p: 0.9,
      stop: ["</done>"],
      stream: false
    });
  });

  it("converts tool definitions and tool result blocks", () => {
    const chat = anthropicMessageToChatRequest({
      model: "qwen",
      max_tokens: 128,
      tools: [
        {
          name: "lookup",
          description: "Look up a value",
          input_schema: { type: "object", properties: { id: { type: "string" } } }
        }
      ],
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "toolu_1", name: "lookup", input: { id: "42" } }]
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "result text" }]
        }
      ]
    });

    expect(chat.tools?.[0]).toEqual({
      type: "function",
      function: {
        name: "lookup",
        description: "Look up a value",
        parameters: { type: "object", properties: { id: { type: "string" } } }
      }
    });
    expect(chat.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "toolu_1",
            type: "function",
            function: { name: "lookup", arguments: "{\"id\":\"42\"}" }
          }
        ]
      },
      { role: "tool", tool_call_id: "toolu_1", content: "result text" }
    ]);
  });

  it("rejects unsupported multimodal blocks with a deterministic error", () => {
    expect(() =>
      anthropicMessageToChatRequest({
        model: "qwen",
        max_tokens: 128,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64" } }] }]
      })
    ).toThrow("Unsupported Anthropic content block type: image");
  });

  it("converts a chat completion response to an Anthropic message", () => {
    const message = chatCompletionToAnthropicMessage({
      id: "chatcmpl_1",
      model: "qwen",
      choices: [
        {
          message: { role: "assistant", content: "Hi there" },
          finish_reason: "stop"
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 3 }
    });

    expect(message).toEqual({
      id: "msg_chatcmpl_1",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      model: "qwen",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 3 }
    });
  });

  it("converts chat streaming chunks to Anthropic SSE events", () => {
    const events = createAnthropicStreamEvents(
      [
        { id: "chatcmpl_1", model: "qwen", choices: [{ delta: { role: "assistant" } }] },
        { id: "chatcmpl_1", model: "qwen", choices: [{ delta: { content: "Hel" } }] },
        { id: "chatcmpl_1", model: "qwen", choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] }
      ],
      "qwen"
    );

    expect(events.map((event) => event.event)).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop"
    ]);
    expect(events[2].data).toMatchObject({ delta: { type: "text_delta", text: "Hel" } });
  });
});

import { describe, expect, it } from "vitest";
import { chatCompletionToResponses, responsesToChatCompletionRequest } from "../src/proxy/responses";

describe("Responses and Chat Completions conversion", () => {
  it("converts a text Responses request to a chat completion request", () => {
    const chat = responsesToChatCompletionRequest({
      model: "qwen",
      instructions: "You are concise.",
      max_output_tokens: 256,
      temperature: 0.2,
      top_p: 0.9,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "Hello" }]
        }
      ]
    });

    expect(chat).toEqual({
      model: "qwen",
      messages: [
        { role: "system", content: "You are concise." },
        { role: "user", content: "Hello" }
      ],
      max_tokens: 256,
      temperature: 0.2,
      top_p: 0.9
    });
  });

  it("converts a chat completion response to a Responses response", () => {
    const response = chatCompletionToResponses({
      id: "chatcmpl_1",
      model: "qwen",
      choices: [{ message: { role: "assistant", content: "Hi there" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 7, completion_tokens: 3 }
    });

    expect(response).toEqual({
      id: "resp_chatcmpl_1",
      object: "response",
      status: "completed",
      model: "qwen",
      output: [
        {
          id: "msg_chatcmpl_1",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: "Hi there", annotations: [] }]
        }
      ],
      output_text: "Hi there",
      usage: { input_tokens: 7, output_tokens: 3 }
    });
  });

  it("rejects streaming until Responses SSE conversion is implemented", () => {
    expect(() =>
      responsesToChatCompletionRequest({
        model: "qwen",
        input: "Hello",
        stream: true
      })
    ).toThrow("Responses streaming is not supported yet");
  });
});

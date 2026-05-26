import type { ChatCompletionRequest, ChatCompletionResponse, ChatMessage } from "./anthropic-chat.js";

export interface ResponsesRequest {
  model: string;
  input: string | ResponsesInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ResponsesTool[];
}

type ResponsesInputItem =
  | {
      type?: "message";
      role: "system" | "developer" | "user" | "assistant";
      content: string | ResponsesContentPart[];
    }
  | { type: "function_call_output"; call_id: string; output: string };

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string }
  | { type: "text"; text: string };

type ResponsesTool = {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export function responsesToChatCompletionRequest(request: ResponsesRequest): ChatCompletionRequest {
  if (request.stream) {
    throw new Error("Responses streaming is not supported yet");
  }

  const messages: ChatMessage[] = [];
  if (request.instructions) {
    messages.push({ role: "system", content: request.instructions });
  }

  if (typeof request.input === "string") {
    messages.push({ role: "user", content: request.input });
  } else {
    for (const item of request.input) {
      messages.push(responsesInputItemToChatMessage(item));
    }
  }

  return pruneUndefined({
    model: request.model,
    messages,
    max_tokens: request.max_output_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    tools: request.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? {}
      }
    }))
  });
}

export function chatCompletionToResponses(response: ChatCompletionResponse) {
  const choice = response.choices[0];
  const message = choice?.message;
  const output: Array<Record<string, unknown>> = [];

  if (message?.content) {
    output.push({
      id: `msg_${response.id}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: message.content, annotations: [] }]
    });
  }

  for (const toolCall of message?.tool_calls ?? []) {
    output.push({
      id: toolCall.id,
      type: "function_call",
      status: "completed",
      call_id: toolCall.id,
      name: toolCall.function.name,
      arguments: toolCall.function.arguments
    });
  }

  return {
    id: `resp_${response.id}`,
    object: "response",
    status: "completed",
    model: response.model,
    output,
    output_text: outputText(output),
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0
    }
  };
}

function responsesInputItemToChatMessage(item: ResponsesInputItem): ChatMessage {
  if (item.type === "function_call_output") {
    return { role: "tool", tool_call_id: item.call_id, content: item.output };
  }

  const content = responsesContentToText(item.content);
  if (item.role === "assistant") {
    return { role: "assistant", content };
  }

  return {
    role: item.role === "user" ? "user" : "system",
    content
  };
}

function responsesContentToText(content: string | ResponsesContentPart[]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
        return part.text;
      }
      throw new Error(`Unsupported Responses content part type: ${(part as { type?: string }).type ?? "unknown"}`);
    })
    .join("\n");
}

function outputText(output: Array<Record<string, unknown>>): string {
  return output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((part): part is { type: string; text: string } => isRecord(part) && part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

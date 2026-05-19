export interface AnthropicMessageRequest {
  model: string;
  max_tokens: number;
  system?: string | AnthropicContentBlock[];
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[] }
  | { type: string; [key: string]: unknown };

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
  tools?: ChatTool[];
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: "assistant";
      content?: string | null;
      tool_calls?: ChatToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface ChatStreamChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: ChatToolCall[];
    };
    finish_reason?: string | null;
  }>;
}

export interface AnthropicStreamEvent {
  event: string;
  data: Record<string, unknown>;
}

export function anthropicMessageToChatRequest(request: AnthropicMessageRequest): ChatCompletionRequest {
  const messages: ChatMessage[] = [];

  if (request.system) {
    messages.push({ role: "system", content: contentToText(request.system) });
  }

  for (const message of request.messages) {
    messages.push(...anthropicMessageToChatMessages(message));
  }

  return pruneUndefined({
    model: request.model,
    messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stop: request.stop_sequences,
    stream: request.stream,
    tools: request.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }))
  });
}

export function chatCompletionToAnthropicMessage(response: ChatCompletionResponse) {
  const choice = response.choices[0];
  const content = chatMessageContentToAnthropicBlocks(choice?.message);

  return {
    id: `msg_${response.id}`,
    type: "message",
    role: "assistant",
    content,
    model: response.model,
    stop_reason: mapFinishReason(choice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0
    }
  };
}

export function createAnthropicStreamEvents(chunks: ChatStreamChunk[], fallbackModel: string): AnthropicStreamEvent[] {
  const first = chunks.find((chunk) => chunk.id || chunk.model);
  const id = `msg_${first?.id ?? `stream_${Date.now()}`}`;
  const model = first?.model ?? fallbackModel;
  const events: AnthropicStreamEvent[] = [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id,
          type: "message",
          role: "assistant",
          content: [],
          model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      }
    }
  ];
  let blockOpen = false;
  let finishReason: string | null | undefined;

  for (const chunk of chunks) {
    const choice = chunk.choices?.[0];
    const text = choice?.delta?.content;
    if (text) {
      if (!blockOpen) {
        blockOpen = true;
        events.push({ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });
      }
      events.push({ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } });
    }
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
  }

  if (!blockOpen) {
    events.push({ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } });
  }

  events.push({ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } });
  events.push({
    event: "message_delta",
    data: { type: "message_delta", delta: { stop_reason: mapFinishReason(finishReason), stop_sequence: null }, usage: { output_tokens: 0 } }
  });
  events.push({ event: "message_stop", data: { type: "message_stop" } });
  return events;
}

export function formatSseEvent(event: AnthropicStreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function anthropicMessageToChatMessages(message: AnthropicMessage): ChatMessage[] {
  const blocks = normalizeContent(message.content);
  const toolResultBlocks = blocks.filter(isToolResultBlock);
  if (toolResultBlocks.length > 0) {
    return toolResultBlocks.map((block) => ({
      role: "tool",
      tool_call_id: String(block.tool_use_id),
      content: contentToText(block.content)
    }));
  }

  const toolUseBlocks = blocks.filter(isToolUseBlock);
  const text = blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("\n");

  for (const block of blocks) {
    if (block.type !== "text" && block.type !== "tool_use") {
      throw new Error(`Unsupported Anthropic content block type: ${block.type}`);
    }
  }

  if (message.role === "assistant") {
    return [
      {
        role: "assistant",
        content: text,
        tool_calls: toolUseBlocks.map((block) => ({
          id: String(block.id),
          type: "function",
          function: {
            name: String(block.name),
            arguments: JSON.stringify(block.input ?? {})
          }
        }))
      }
    ];
  }

  return [{ role: "user", content: text }];
}

function chatMessageContentToAnthropicBlocks(message: ChatCompletionResponse["choices"][number]["message"] | undefined) {
  const blocks: Array<Record<string, unknown>> = [];
  if (message?.content) {
    blocks.push({ type: "text", text: message.content });
  }

  for (const toolCall of message?.tool_calls ?? []) {
    blocks.push({
      type: "tool_use",
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseToolArguments(toolCall.function.arguments)
    });
  }

  return blocks.length > 0 ? blocks : [{ type: "text", text: "" }];
}

function contentToText(content: string | AnthropicContentBlock[] | undefined): string {
  if (!content) {
    return "";
  }
  return normalizeContent(content)
    .map((block) => {
      if (block.type === "text") {
        return String(block.text);
      }
      if (isToolResultBlock(block)) {
        return contentToText(block.content);
      }
      throw new Error(`Unsupported Anthropic content block type: ${block.type}`);
    })
    .join("\n");
}

function normalizeContent(content: string | AnthropicContentBlock[]): AnthropicContentBlock[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

function isTextBlock(block: AnthropicContentBlock): block is Extract<AnthropicContentBlock, { type: "text" }> {
  return block.type === "text";
}

function isToolUseBlock(block: AnthropicContentBlock): block is Extract<AnthropicContentBlock, { type: "tool_use" }> {
  return block.type === "tool_use";
}

function isToolResultBlock(block: AnthropicContentBlock): block is Extract<AnthropicContentBlock, { type: "tool_result" }> {
  return block.type === "tool_result";
}

function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mapFinishReason(reason: string | null | undefined): string {
  if (reason === "length") {
    return "max_tokens";
  }
  if (reason === "tool_calls") {
    return "tool_use";
  }
  return "end_turn";
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

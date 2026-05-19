export async function parseOpenAiSseStream(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const parsed = parseSsePart(part);
      if (parsed !== undefined) {
        chunks.push(parsed);
      }
    }
  }

  const parsed = parseSsePart(buffer);
  if (parsed !== undefined) {
    chunks.push(parsed);
  }

  return chunks;
}

function parseSsePart(part: string): unknown | undefined {
  const data = part
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (!data || data === "[DONE]") {
    return undefined;
  }

  return JSON.parse(data);
}

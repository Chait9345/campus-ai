const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://campus-ai-api-ifp5.onrender.com";

export type ChartKind = "line" | "bar" | "pie";

export interface ChartPayload {
  type: ChartKind;
  title?: string;
  data: Array<Record<string, string | number>>;
  xKey?: string;
  yKey?: string;
  pieDataKey?: string;
  pieNameKey?: string;
}

export interface ChatResponse {
  message: string;
  chart?: ChartPayload;
  sessionId?: string | null;
  citations?: string[];
}

export type Intent = "interview" | "analytics" | "chat";

export function detectIntent(input: string): Intent {
  const text = input.toLowerCase();
  if (text.includes("interview")) return "interview";
  if (/(trend|stats|statistics|compare|chart|graph)/i.test(text)) {
    return "analytics";
  }
  return "chat";
}

async function safePost<T>(url: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Raw `/chat` payload: either nested `data` or legacy flat shape. */
export type ChatRequestPayload = {
  message?: string;
  session_id?: string | null;
  citations?: string[];
  chart?: ChartPayload;
  data?: { message?: string };
};

export async function requestChat(
  message: string,
  sessionId?: string | null
): Promise<ChatRequestPayload | Record<string, unknown>> {
  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        session_id: sessionId ?? null,
      }),
    });
    const data = (await res.json()) as Record<string, unknown> & {
      success?: boolean;
      error?: string | null;
      data?: ChatRequestPayload;
    };
    if (!res.ok) {
      throw new Error(
        typeof data?.error === "string" ? data.error : `Chat request failed with status ${res.status}`
      );
    }
    if (data.success === false) {
      throw new Error(typeof data.error === "string" ? data.error : "Chat request failed");
    }
    return data?.data ?? data;
  } catch (error) {
    console.error("Chat request error:", error);
    throw error;
  }
}

export async function startInterview(): Promise<ChatResponse> {
  const apiResponse = await safePost<ChatResponse>("/interview/start", {});
  if (apiResponse?.message) return apiResponse;
  return {
    message:
      "Interview started. First question: Tell me about yourself and your strongest technical project.",
  };
}

export async function answerInterview(answer: string): Promise<ChatResponse> {
  const apiResponse = await safePost<ChatResponse>("/interview/answer", { answer });
  if (apiResponse?.message) return apiResponse;
  return {
    message:
      "Good response. Next question: explain a challenge you faced while building a project and how you resolved it.",
  };
}

export interface ChatHistoryMessage {
  role: string;
  content: string;
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryMessage[]> {
  const res = await fetch(
    `${API_URL}/chat/history?session_id=${encodeURIComponent(sessionId)}`
  );
  if (!res.ok) {
    throw new Error(`History request failed with status ${res.status}`);
  }
  const payload = (await res.json()) as {
    data?: { messages?: ChatHistoryMessage[] };
    error?: string | null;
  };
  if (payload.error) {
    throw new Error(payload.error);
  }
  const list = payload.data?.messages;
  return Array.isArray(list) ? list : [];
}

export interface UploadDocumentResult {
  success: boolean;
  file: string;
  chunks_indexed: number;
}

export async function uploadDocument(file: File): Promise<UploadDocumentResult> {
  try {
    const form = new FormData();
    form.append("file", file);

    console.log(`Uploading to: ${API_URL}/documents/upload`);
    const res = await fetch(`${API_URL}/documents/upload`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Upload failed with status ${res.status}:`, text);
      throw new Error(text || `Upload failed with status ${res.status}`);
    }

    const result = (await res.json()) as UploadDocumentResult;
    console.log("Upload successful:", result);
    return result;
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

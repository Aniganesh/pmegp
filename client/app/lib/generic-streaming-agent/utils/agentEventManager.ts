export interface Citation {
  citationId?: string;
  docId: string;
  docTitle?: string;
  fragmentId?: string;
  snippet?: string;
  // Legacy support
  title?: string;
  page?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
}

export interface ContextFragment {
  docId: string;
  fragmentId: string;
  snippet: string;
  score: number;
}

export interface Confidence {
  score: number;
  level: "low" | "medium" | "high";
  basis?: {
    topFragmentScore?: number;
    sourcesUsed?: number;
    retrievalMode?: string;
  };
}

export interface DebugInfo {
  usedModel?: string;
  fragmentCount?: number;
}

export interface AgentStreamEvent {
  type:
    | "message"
    | "tool_start"
    | "tool_result"
    | "error"
    | "complete"
    | "connected"
    | "step";
  content?: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: any;
  error?: string;
  conversationId?: string;
  conversationTitle?: string;
  timestamp: number;
  stepKey?: string;
  stepStatus?: "start" | "end";
  stepLabel?: string;
  stepPayload?: unknown;
  modeMetadata?: unknown;
  // Additional metadata from API
  citations?: Citation[];
  confidence?: Confidence;
  contextFragments?: ContextFragment[];
  debugInfo?: DebugInfo;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface StreamingAgentOptions {
  onMessage?: (event: AgentStreamEvent) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export class AgentEventManager {
  private abortController: AbortController | null = null;
  private isConnected = false;

  constructor(private options: StreamingAgentOptions = {}) {}

  async connect(url: string, body: any, accessToken?: string): Promise<void> {
    if (this.abortController) {
      this.disconnect();
    }

    this.abortController = new AbortController();
    this.isConnected = false;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const isDev = Boolean(import.meta.env?.DEV);
    if (isDev) {
      // Never log request bodies (may contain user prompts / sensitive data).
      // Cookie headers are sent automatically via `credentials: "include"`.
      console.debug("[AgentEventManager] Connecting", {
        url,
        hasAccessToken: Boolean(accessToken),
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: this.abortController.signal,
      credentials: "include",
    });

    if (isDev) {
      console.debug("[AgentEventManager] Response", {
        status: response.status,
        ok: response.ok,
      });
    }

    if (!response.ok) {
      let details = "";
      try {
        details = (await response.text()).trim();
      } catch {
        // ignore
      }
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}${details ? ` - ${details.slice(0, 200)}` : ""}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    this.isConnected = true;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      let buffer = "";

      const processRawEvent = (rawEvent: string) => {
        const lines = rawEvent.split(/\r?\n/);
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (!line) continue;
          if (line.startsWith(":")) continue; // comment

          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
            continue;
          }

          if (line.startsWith("data:")) {
            // Per SSE spec: everything after "data:" (optionally one leading space)
            // is part of the data payload; multiple data lines are joined with "\n".
            let value = line.slice(5);
            if (value.startsWith(" ")) value = value.slice(1);
            data += `${value}\n`;
          }
        }

        if (!eventType) eventType = "message";
        if (data.endsWith("\n")) data = data.slice(0, -1);

        if (!data) {
          // Some servers emit "event: complete" without data.
          if (eventType === "complete") this.handleStreamEvent(eventType, {});
          return;
        }

        try {
          const parsed = JSON.parse(data);
          this.handleStreamEvent(eventType, parsed);
        } catch (error) {
          if (isDev) {
            console.warn("[AgentEventManager] Failed to parse SSE data", {
              eventType,
              dataPreview: data.slice(0, 200),
            });
          }
        }
      };

      const processBuffer = (flush: boolean) => {
        while (true) {
          const sepIndex = buffer.search(/\r?\n\r?\n/);
          if (sepIndex === -1) break;

          const sepMatch = buffer.slice(sepIndex).match(/^(\r?\n\r?\n)/);
          const sepLen = sepMatch?.[1]?.length ?? 2;

          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + sepLen);

          if (rawEvent.trim()) processRawEvent(rawEvent);
        }

        if (flush && buffer.trim()) {
          processRawEvent(buffer);
          buffer = "";
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer(false);
      }

      buffer += decoder.decode();
      processBuffer(true);
      this.options.onComplete?.();
    } catch (error) {
      const isAbort =
        (error instanceof Error && error.name === "AbortError") ||
        (typeof DOMException !== "undefined" &&
          error instanceof DOMException &&
          error.name === "AbortError");

      if (isAbort) {
        this.options.onComplete?.();
      } else {
        console.error("Stream reading error:", error);
        this.options.onError?.(
          error instanceof Error ? error.message : "Connection error occurred",
        );
      }
    } finally {
      this.isConnected = false;
      this.abortController = null;
    }
  }

  private handleStreamEvent(eventType: string, data: any): void {
    let agentEvent: AgentStreamEvent;

    switch (eventType) {
      case "meta":
        // Handle meta event with conversationId and metadata
        agentEvent = {
          type: "connected",
          conversationId: data.conversationId,
          requestId: data.requestId,
          traceId: data.traceId,
          spanId: data.spanId,
          timestamp: Date.now(),
        };
        break;
      case "connected":
        agentEvent = {
          type: "connected",
          conversationId: data.conversationId,
          timestamp: Date.now(),
        };
        break;
      case "delta":
        // Handle delta event for streaming chunks
        agentEvent = {
          type: "message",
          content: data.chunk || "",
          timestamp: Date.now(),
        };
        break;
      case "final":
        // Support both Ask SSE shape (answer/citations/...) and Chat SSE shape
        // (assistantMessage with metadata).
        const assistantMessage =
          data?.assistantMessage && typeof data.assistantMessage === "object"
            ? data.assistantMessage
            : undefined;
        const assistantMetadata =
          assistantMessage?.metadata &&
          typeof assistantMessage.metadata === "object"
            ? assistantMessage.metadata
            : undefined;

        agentEvent = {
          type: "complete",
          content:
            (typeof data.answer === "string" && data.answer) ||
            (typeof assistantMessage?.content === "string"
              ? assistantMessage.content
              : undefined),
          conversationId: data.conversationId ?? assistantMessage?.conversationId,
          citations:
            data.citations || (assistantMetadata as Record<string, any> | undefined)?.citations || [],
          confidence:
            data.confidence || (assistantMetadata as Record<string, any> | undefined)?.confidence,
          contextFragments:
            data.contextFragments ||
            (assistantMetadata as Record<string, any> | undefined)?.contextFragments ||
            [],
          debugInfo:
            data.debugInfo || (assistantMetadata as Record<string, any> | undefined)?.debugInfo,
          durationMs:
            data.durationMs ?? (assistantMetadata as Record<string, any> | undefined)?.durationMs,
          promptTokens:
            data.promptTokens ??
            (assistantMetadata as Record<string, any> | undefined)?.promptTokens,
          completionTokens:
            data.completionTokens ??
            (assistantMetadata as Record<string, any> | undefined)?.completionTokens,
          totalTokens:
            data.totalTokens ??
            (assistantMetadata as Record<string, any> | undefined)?.totalTokens,
          conversationTitle:
            (typeof data.conversationTitle === "string" && data.conversationTitle) ||
            (typeof (assistantMetadata as Record<string, any> | undefined)?.conversationTitle ===
            "string"
              ? (assistantMetadata as Record<string, any>).conversationTitle
              : undefined),
          modeMetadata: data.modeMetadata,
          timestamp: Date.now(),
        };
        break;
      case "message":
        agentEvent = {
          type: "message",
          content: data.chunk,
          timestamp: Date.now(),
        };
        break;
      case "step": {
        const stepKey =
          typeof data.step === "string" && data.step.trim().length > 0
            ? data.step.trim()
            : "_";
        const stepStatus: "start" | "end" =
          data.status === "end" ? "end" : "start";
        const labelRaw =
          typeof data.label === "string" && data.label.trim().length > 0
            ? data.label.trim()
            : stepKey !== "_"
              ? stepKey
              : "";
        agentEvent = {
          type: "step",
          stepKey,
          stepStatus,
          stepLabel: labelRaw || stepKey,
          stepPayload: data.payload,
          timestamp: Date.now(),
        };
        break;
      }
      case "tool_start":
        const toolStartName =
          typeof data.toolName === "string"
            ? data.toolName
            : typeof data.name === "string"
              ? data.name
              : undefined;
        agentEvent = {
          type: "tool_start",
          toolName: toolStartName,
          toolInput: data.input,
          timestamp: Date.now(),
        };
        break;
      case "tool_result":
        const toolResultName =
          typeof data.toolName === "string"
            ? data.toolName
            : typeof data.name === "string"
              ? data.name
              : undefined;
        agentEvent = {
          type: "tool_result",
          toolName: toolResultName,
          toolResult: data.result,
          timestamp: Date.now(),
        };
        break;
      case "error":
        agentEvent = {
          type: "error",
          error: data.error,
          timestamp: Date.now(),
        };
        break;
      case "complete":
        agentEvent = {
          type: "complete",
          timestamp: Date.now(),
          conversationId: data.conversationId,
        };

        break;
      default:
        console.error("Unknown event type:", eventType);
        return; // Skip unknown event types
    }

    this.options.onMessage?.(agentEvent);
  }

  disconnect(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.isConnected = false;
  }

  getConnectionState(): "connecting" | "open" | "closed" {
    if (this.abortController && !this.abortController.signal.aborted) {
      return this.isConnected ? "open" : "connecting";
    }

    return "closed";
  }

  isReady(): boolean {
    if (this.abortController) {
      return this.isConnected && !this.abortController.signal.aborted;
    }

    return false;
  }
}

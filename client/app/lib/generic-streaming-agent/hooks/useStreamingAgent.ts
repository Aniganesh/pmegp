import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  AgentEventManager,
  AgentStreamEvent,
  Citation,
  Confidence,
  ContextFragment,
  DebugInfo,
} from "../utils/agentEventManager";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  metadata?: Record<string, unknown>;
  citations?: Citation[];
  confidence?: Confidence;
  contextFragments?: ContextFragment[];
  debugInfo?: DebugInfo;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface UseStreamingAgentOptions {
  accessToken?: string;
  streamUrl: string;
  storageKey: string;
  workspaceId?: string;
  conversationId?: string;
  extraBody?: Record<string, unknown>;
  onConversationTitle?: (title: string) => void;
}

export interface UseStreamingAgentReturn {
  messages: ChatMessage[];
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  sendMessage: (
    message: string,
    extraBodyOverride?: Record<string, unknown>,
  ) => Promise<void>;
  clearHistory: () => void;
  retry: () => void;
}

export const useStreamingAgent = ({
  accessToken,
  streamUrl,
  storageKey,
  workspaceId,
  conversationId,
  extraBody,
  onConversationTitle,
}: UseStreamingAgentOptions): UseStreamingAgentReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<AgentEventManager | null>(null);
  const conversationIdRef = useRef<string | null>(conversationId || null);

  // Track only the ID of the current streaming message (never the full object).
  // Storing the full object caused React StrictMode double-invocation to read a
  // mutated ref and append each delta twice.
  const streamingMsgIdRef = useRef<string | null>(null);
  // Accumulate content OUTSIDE setMessages updaters so updaters are idempotent.
  const accumulatedContentRef = useRef<string>("");
  // Track last finalized assistant message ID to handle `final` arriving after
  // `complete` (backend sends both) without creating a duplicate message.
  const lastAssistantMsgIdRef = useRef<string | null>(null);

  const generateMessageId = () =>
    `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleAgentEvent = useCallback(
    (event: AgentStreamEvent) => {
      switch (event.type) {
        case "connected":
          if (event.conversationId) {
            conversationIdRef.current = event.conversationId;
            localStorage.setItem(storageKey, event.conversationId);
          }
          break;
        default:
        case "message": {
          if (!event.content) break;

          if (!streamingMsgIdRef.current) {
            // First delta for this turn — create the streaming message
            const newId = generateMessageId();
            const initialContent = event.content;

            streamingMsgIdRef.current = newId;
            lastAssistantMsgIdRef.current = newId;
            accumulatedContentRef.current = initialContent;

            setMessages((prev) => {
              // Idempotent: if already added (StrictMode second invocation), skip
              if (prev.some((m) => m.id === newId)) return prev;
              return [
                ...prev,
                {
                  id: newId,
                  role: "assistant",
                  content: initialContent,
                  timestamp: event.timestamp,
                  isStreaming: true,
                },
              ];
            });
          } else {
            // Subsequent delta — append outside the updater, then write snapshot
            accumulatedContentRef.current += event.content;
            const id = streamingMsgIdRef.current;
            const snapshot = accumulatedContentRef.current;

            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === id);
              if (idx === -1) return prev;
              const updated = [...prev];
              // Use snapshot captured outside — idempotent across double-invocations
              updated[idx] = { ...updated[idx], content: snapshot };
              return updated;
            });
          }
          break;
        }

        case "complete": {
          const modeMetadata =
            event.modeMetadata &&
            typeof event.modeMetadata === "object" &&
            !Array.isArray(event.modeMetadata)
              ? (event.modeMetadata as Record<string, unknown>)
              : null;
          const createGeneration =
            modeMetadata?.create &&
            typeof modeMetadata.create === "object" &&
            !Array.isArray(modeMetadata.create) &&
            (modeMetadata.create as Record<string, unknown>).generation &&
            typeof (modeMetadata.create as Record<string, unknown>)
              .generation === "object" &&
            !Array.isArray(
              (modeMetadata.create as Record<string, unknown>).generation,
            )
              ? ((modeMetadata.create as Record<string, unknown>)
                  .generation as Record<string, unknown>)
              : null;
          if (createGeneration?.status === "failed") {
            const reason =
              typeof createGeneration.reason === "string" &&
              createGeneration.reason.trim().length > 0
                ? createGeneration.reason.trim()
                : "generation_failed";
          }
          const assistantMetadata =
            createGeneration && typeof createGeneration === "object"
              ? {
                  ...(typeof createGeneration.status === "string"
                    ? { status: createGeneration.status }
                    : {}),
                  ...(typeof createGeneration.documentId === "string"
                    ? { documentId: createGeneration.documentId }
                    : {}),
                  ...(typeof createGeneration.fileName === "string"
                    ? { fileName: createGeneration.fileName }
                    : {}),
                  ...(typeof createGeneration.fileType === "string"
                    ? { fileType: createGeneration.fileType }
                    : {}),
                  ...(typeof createGeneration.createdAt === "string"
                    ? { createdAt: createGeneration.createdAt }
                    : {}),
                  ...(typeof createGeneration.reason === "string"
                    ? { reason: createGeneration.reason }
                    : {}),
                  ...(createGeneration.status === "failed"
                    ? { progress: 0 }
                    : createGeneration.status === "completed"
                      ? { progress: 100 }
                      : {}),
                }
              : undefined;
          const hasAssistantMetadata =
            !!assistantMetadata && Object.keys(assistantMetadata).length > 0;

          // Capture values outside setMessages so the updater is idempotent
          const id = streamingMsgIdRef.current;
          const finalContent = event.content || accumulatedContentRef.current;
          const lastId = lastAssistantMsgIdRef.current;

          // Clear streaming tracking before setMessages (safe — we captured above)
          streamingMsgIdRef.current = null;
          accumulatedContentRef.current = "";

          setMessages((prev) => {
            const updatedMessages = [...prev];

            if (id) {
              // Normal path: finalize the current streaming message
              const idx = updatedMessages.findIndex((m) => m.id === id);
              if (idx !== -1) {
                updatedMessages[idx] = {
                  ...updatedMessages[idx],
                  content: finalContent,
                  isStreaming: false,
                  ...(hasAssistantMetadata
                    ? { metadata: assistantMetadata }
                    : {}),
                  citations: event.citations,
                  confidence: event.confidence,
                  contextFragments: event.contextFragments,
                  debugInfo: event.debugInfo,
                  durationMs: event.durationMs,
                  promptTokens: event.promptTokens,
                  completionTokens: event.completionTokens,
                  totalTokens: event.totalTokens,
                };
              }
            } else if (event.content) {
              // `id` is null: either `complete` already fired before `final` (backend
              // sends both), or no deltas streamed at all.
              // Update the last assistant message instead of creating a duplicate.
              const prevIdx = lastId
                ? updatedMessages.findIndex((m) => m.id === lastId)
                : -1;

              if (prevIdx !== -1) {
                updatedMessages[prevIdx] = {
                  ...updatedMessages[prevIdx],
                  content: event.content,
                  isStreaming: false,
                  ...(hasAssistantMetadata
                    ? { metadata: assistantMetadata }
                    : {}),
                  citations: event.citations,
                  confidence: event.confidence,
                  contextFragments: event.contextFragments,
                  debugInfo: event.debugInfo,
                  durationMs: event.durationMs,
                  promptTokens: event.promptTokens,
                  completionTokens: event.completionTokens,
                  totalTokens: event.totalTokens,
                };
              } else {
                // Genuinely no prior assistant message (no-delta fallback) — create one
                const newId = generateMessageId();
                lastAssistantMsgIdRef.current = newId;
                updatedMessages.push({
                  id: newId,
                  role: "assistant",
                  content: event.content,
                  timestamp: event.timestamp,
                  isStreaming: false,
                  ...(hasAssistantMetadata
                    ? { metadata: assistantMetadata }
                    : {}),
                  citations: event.citations,
                  confidence: event.confidence,
                  contextFragments: event.contextFragments,
                  debugInfo: event.debugInfo,
                  durationMs: event.durationMs,
                  promptTokens: event.promptTokens,
                  completionTokens: event.completionTokens,
                  totalTokens: event.totalTokens,
                });
              }
            }

            return updatedMessages;
          });

          if (event.conversationId) {
            conversationIdRef.current = event.conversationId;
            localStorage.setItem(storageKey, event.conversationId);
          }
          if (
            typeof event.conversationTitle === "string" &&
            event.conversationTitle.trim().length > 0
          ) {
            onConversationTitle?.(event.conversationTitle.trim());
          }
          setError(null);
          break;
        }

        case "error":
          if (event.error) {
            console.error(event.error);
          }
          break;

        case "tool_result":
          break;
      }
    },
    [onConversationTitle, storageKey],
  );

  const handleComplete = useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);

    // Safety net: finalize any orphaned streaming message if `final` SSE event was lost
    const orphanId = streamingMsgIdRef.current;
    if (orphanId) {
      const finalContent = accumulatedContentRef.current;
      streamingMsgIdRef.current = null;
      accumulatedContentRef.current = "";
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === orphanId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          content: finalContent,
          isStreaming: false,
        };
        return updated;
      });
    }

    if (eventSourceRef.current) {
      eventSourceRef.current = null;
    }
  }, []);

  const handleConnectionError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setIsConnecting(false);
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback(
    async (content: string, extraBodyOverride?: Record<string, unknown>) => {
      if (!content.trim()) return;

      setError(null);

      // Disconnect any prior stream still running
      if (eventSourceRef.current) {
        eventSourceRef.current.disconnect();
        eventSourceRef.current = null;
      }
      streamingMsgIdRef.current = null;
      accumulatedContentRef.current = "";
      lastAssistantMsgIdRef.current = null;

      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        setIsConnecting(true);

        const eventSource = new AgentEventManager({
          onMessage: handleAgentEvent,
          onError: handleConnectionError,
          onComplete: handleComplete,
        });

        eventSourceRef.current = eventSource;

        const effectiveConversationId =
          conversationId ||
          localStorage.getItem(storageKey) ||
          conversationIdRef.current;

        if (effectiveConversationId) {
          conversationIdRef.current = effectiveConversationId;
        }

        setIsConnected(true);
        setIsConnecting(false);

        await eventSource.connect(
          streamUrl,
          {
            question: content.trim(),
            conversationId: conversationIdRef.current || undefined,
            stream: true,
            debug: true,
            ...extraBody,
            ...extraBodyOverride,
          },
          accessToken,
        );
      } catch (err) {
        const isAbort =
          (err instanceof Error && err.name === "AbortError") ||
          (typeof DOMException !== "undefined" &&
            err instanceof DOMException &&
            err.name === "AbortError");
        if (isAbort) {
          setIsConnecting(false);
          setIsConnected(false);
          if (eventSourceRef.current) {
            eventSourceRef.current.disconnect();
            eventSourceRef.current = null;
          }
          return;
        }

        console.error("Error sending message:", err);
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsConnecting(false);
        setIsConnected(false);

        if (eventSourceRef.current) {
          eventSourceRef.current.disconnect();
          eventSourceRef.current = null;
        }
      }
    },
    [
      accessToken,
      conversationId,
      extraBody,
      handleAgentEvent,
      handleComplete,
      handleConnectionError,
      storageKey,
      streamUrl,
      workspaceId,
    ],
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    streamingMsgIdRef.current = null;
    accumulatedContentRef.current = "";
    lastAssistantMsgIdRef.current = null;
    conversationIdRef.current = null;
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  const retry = useCallback(() => {
    setError(null);
    setIsConnecting(false);
    setIsConnected(false);

    if (eventSourceRef.current) {
      eventSourceRef.current.disconnect();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.disconnect();
      }
    };
  }, []);

  return {
    messages,
    isConnecting,
    isConnected,
    error,
    sendMessage,
    clearHistory,
    retry,
  };
};

export default useStreamingAgent;

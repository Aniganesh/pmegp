import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import ReactMarkdown from "react-markdown";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import useStreamingAgent, {
  type ChatMessage,
} from "~/lib/generic-streaming-agent/hooks/useStreamingAgent";
import { cn } from "~/lib/utils";

const API_BASE = "http://localhost:5000";

const MD_MIN_WIDTH = "(min-width: 768px)";

function isMobileViewport(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

interface Usage {
  used: number;
  remaining: number;
  resetAt: string;
  hasBYOK: boolean;
}

interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
}

function mapApiToMessages(
  msgs: { role: string; content: string }[],
): ChatMessage[] {
  const now = Date.now();
  return msgs.map((m, i) => ({
    id: `hist_${now}_${i}`,
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    timestamp: now + i,
  }));
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChatThreadProps {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  storageKey: string;
  apiKey: string;
  provider: "google" | "openai" | "anthropic";
  onConversationId: (id: string) => void;
}

function ChatThread({
  conversationId,
  initialMessages,
  storageKey,
  apiKey,
  provider,
  onConversationId,
}: ChatThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const {
    messages,
    isConnecting,
    error: streamingError,
    sendMessage,
  } = useStreamingAgent({
    streamUrl: `${API_BASE}/api/chat/stream`,
    storageKey,
    conversationId: conversationId ?? undefined,
    initialMessages,
    onConversationId,
    extraBody: {
      provider,
      apiKey,
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput("");
    void sendMessage(userMessage);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              Ask me anything about PMEGP projects!
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-4 rounded-lg ${
                msg.role === "user"
                  ? "bg-blue-100 ml-auto max-w-[80%]"
                  : "bg-white border mr-auto max-w-[80%]"
              }`}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          ))}
          {isConnecting && (
            <div className="bg-white border rounded-lg p-4 mr-auto max-w-[80%]">
              <span className="animate-pulse">Thinking...</span>
            </div>
          )}
          {streamingError && (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg">
              {streamingError}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about PMEGP projects..."
            className="flex-1 p-2 border rounded"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Chat() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"google" | "openai" | "anthropic">(
    "google",
  );
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [loadedMessages, setLoadedMessages] = useState<ChatMessage[]>([]);
  const [panelKey, setPanelKey] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  useLayoutEffect(() => {
    if (window.matchMedia(MD_MIN_WIDTH).matches) {
      setSidebarCollapsed(false);
    }
  }, []);

  const collapseSidebarIfMobile = useCallback(() => {
    if (isMobileViewport()) {
      setSidebarCollapsed(true);
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/usage`, {
        credentials: "include",
      });
      const data = await res.json();
      setUsage(data);
    } catch (e) {
      console.error("Failed to fetch usage:", e);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      const data = (await res.json()) as ConversationListItem[];
      setConversations(data);
      setListError(null);
    } catch (e) {
      console.error(e);
      setListError("Could not load conversations");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem("pmegp_api_key");
    const savedProvider = localStorage.getItem("pmegp_provider") as
      | "google"
      | "openai"
      | "anthropic";
    if (savedKey) setApiKey(savedKey);
    if (savedProvider) setProvider(savedProvider);
    void fetchUsage();
    void loadConversations();
  }, [fetchUsage, loadConversations]);

  const onConversationResolved = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      void loadConversations();
      void fetchUsage();
    },
    [fetchUsage, loadConversations],
  );

  const startNewChat = () => {
    setActiveConversationId(null);
    setLoadedMessages([]);
    setPanelKey((k) => k + 1);
    collapseSidebarIfMobile();
  };

  const openConversation = async (id: string) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = (await res.json()) as {
        messages: { role: string; content: string }[];
      };
      setLoadedMessages(mapApiToMessages(data.messages));
      setActiveConversationId(id);
      setPanelKey((k) => k + 1);
      collapseSidebarIfMobile();
    } catch (e) {
      console.error(e);
      setError("Could not load conversation");
    } finally {
      setLoadingThread(false);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      await loadConversations();
      if (activeConversationId === id) {
        startNewChat();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const clearByokSettings = () => {
    localStorage.removeItem("pmegp_api_key");
    localStorage.removeItem("pmegp_provider");
    setApiKey("");
    setProvider("google");
    setError(null);
    setUsage((prev) => (prev ? { ...prev, hasBYOK: false } : null));
    void fetchUsage();
    setShowSettings(false);
  };

  const saveSettings = async () => {
    if (!apiKey.trim()) {
      clearByokSettings();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/chat/validate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apiKey, provider }),
      });

      const data = await res.json();

      if (data.valid) {
        localStorage.setItem("pmegp_api_key", apiKey);
        localStorage.setItem("pmegp_provider", provider);
        setUsage((prev) => (prev ? { ...prev, hasBYOK: true } : null));
        setShowSettings(false);
      } else {
        setError(data.error || "Invalid API key");
      }
    } catch {
      setError("Failed to validate key");
    }
  };

  const storageKey =
    activeConversationId != null
      ? `pmegp_cv_${activeConversationId}`
      : `pmegp_draft_${panelKey}`;

  return (
    <div className="flex h-[calc(100vh-50px)] bg-gray-50">
      <aside
        className={cn(
          "shrink-0 border-r bg-white flex flex-col overflow-hidden transition-[width] duration-200 ease-out min-w-0",
          sidebarCollapsed ? "w-0 border-transparent" : "w-64",
        )}
        aria-hidden={sidebarCollapsed}
      >
        <div className="p-2 border-b">
          <button
            type="button"
            onClick={startNewChat}
            className="w-full px-2 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1 min-w-0">
          {listError && (
            <div className="text-xs text-red-600 p-2 mb-1">
              {listError}
              <button
                type="button"
                className="block mt-1 underline"
                onClick={() => {
                  setLoadingList(true);
                  void loadConversations();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {loadingList ? (
            <div className="text-xs text-gray-500 p-2">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="text-xs text-gray-500 p-2">No past chats yet</div>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void openConversation(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openConversation(c.id);
                      }
                    }}
                    className={`w-full text-left px-2 py-2 rounded text-sm flex items-start justify-between gap-1 cursor-pointer ${
                      activeConversationId === c.id
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    <span className="line-clamp-2 flex-1 min-w-0">
                      {c.title}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatShortDate(c.updatedAt)}
                    </span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-600 p-0.5 shrink-0"
                      aria-label="Delete conversation"
                      onClick={(e) => void deleteConversation(c.id, e)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-2 border-t shrink-0">
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="w-full flex items-center justify-center p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              aria-label="Collapse sidebar"
              aria-expanded={true}
            >
              <PanelLeftClose className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        {loadingThread ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Loading conversation…
          </div>
        ) : (
          <ChatThread
            key={panelKey}
            conversationId={activeConversationId}
            initialMessages={loadedMessages}
            storageKey={storageKey}
            apiKey={apiKey}
            provider={provider}
            onConversationId={onConversationResolved}
          />
        )}

        <div className="border-t bg-white px-4 py-2 relative shrink-0">
          {showSettings && (
            <div className="absolute bottom-full left-0 w-full bg-white p-4 flex flex-col items-center gap-2 border-y z-10">
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  Select Provider
                  <select
                    value={provider}
                    onChange={(e) =>
                      setProvider(
                        e.target.value as "google" | "openai" | "anthropic",
                      )
                    }
                    className="min-w-48 p-2 border rounded"
                  >
                    <option value="google">Google</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>
                <div className="flex gap-2 items-center">
                  API Key
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="API Key"
                    className="min-w-96 p-2 border rounded"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveSettings}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={clearByokSettings}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                  >
                    Clear key
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center w-full gap-2 py-1">
            <div className="shrink-0 w-10 flex justify-center">
              {sidebarCollapsed ? (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                  aria-label="Expand sidebar"
                  aria-expanded={false}
                >
                  <PanelLeft className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="flex-1 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setShowSettings((curr) => !curr);
                }}
                className="text-sm text-gray-600 underline"
              >
                Settings
              </button>
            </div>
            <div className="shrink-0 w-10" aria-hidden />
          </div>
          {usage && (
            <div className="text-center text-sm text-gray-500">
              {usage.hasBYOK ? (
                <span className="text-green-600">Unlimited queries (BYOK)</span>
              ) : (
                <span>{usage.used}/10 used today</span>
              )}
            </div>
          )}
          {error && (
            <div className="text-center text-sm text-red-600 mt-1">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

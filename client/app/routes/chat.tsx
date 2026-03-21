import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import ReactMarkdown from "react-markdown";
import useStreamingAgent from "~/lib/generic-streaming-agent/hooks/useStreamingAgent";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Usage {
  used: number;
  remaining: number;
  resetAt: string;
  hasBYOK: boolean;
}

export default function Chat() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"google" | "openai" | "anthropic">(
    "google",
  );
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };


  useEffect(() => {
    const savedKey = localStorage.getItem("pmegp_api_key");
    const savedProvider = localStorage.getItem("pmegp_provider") as
      | "google"
      | "openai"
      | "anthropic";
    if (savedKey) setApiKey(savedKey);
    if (savedProvider) setProvider(savedProvider);
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/chat/usage");
      const data = await res.json();
      setUsage(data);
    } catch (e) {
      console.error("Failed to fetch usage:", e);
    }
  };

  const {
    messages,
    isConnecting,
    isConnected,
    error: streamingError,
    sendMessage,
    clearHistory,
    retry,
  } = useStreamingAgent({
    streamUrl: "http://localhost:5000/api/chat/stream",
    storageKey: "pmegp_chat_conversation",
    workspaceId: "pmegp_chat_workspace",
    conversationId: "pmegp_chat_conversation",
    extraBody: {
      provider,
      apiKey,
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    sendMessage(userMessage);
  };

  const saveSettings = async () => {
    if (!apiKey.trim()) {
      localStorage.removeItem("pmegp_api_key");
      localStorage.removeItem("pmegp_provider");
      setUsage((prev) => (prev ? { ...prev, hasBYOK: false } : null));
      setShowSettings(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/chat/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (err) {
      setError("Failed to validate key");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-50px)] bg-gray-50">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              Ask me anything about PMEGP projects!
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
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
          {loading && (
            <div className="bg-white border rounded-lg p-4 mr-auto max-w-[80%]">
              <span className="animate-pulse">Thinking...</span>
            </div>
          )}
          {error && (
            <div className="bg-red-100 text-red-700 p-4 rounded-lg">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t bg-white p-4 relative">
        {showSettings && (
          <div className="absolute bottom-full left-0 w-full bg-white p-4 flex flex-col items-center gap-2 border-y">
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
              <button type="button" onClick={saveSettings}>
                Save
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about PMEGP projects..."
            className="flex-1 p-2 border rounded"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Send
          </button>

          <button
            type="button"
            onClick={() => {
              setShowSettings((curr) => !curr);
            }}
          >
            Settings
          </button>
        </form>
        {usage && (
          <div className="text-center text-sm text-gray-500 mt-2">
            {usage.hasBYOK ? (
              <span className="text-green-600">Unlimited queries (BYOK)</span>
            ) : (
              <span>{usage.used}/10 used today</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

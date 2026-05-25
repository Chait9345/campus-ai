"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AvatarScene from "@/components/AvatarScene";
import ChatBubble from "@/components/ChatBubble";
import InputBar from "@/components/InputBar";
import {
  answerInterview,
  detectIntent,
  fetchChatHistory,
  requestChat,
  startInterview,
  type ChartPayload,
  type ChatRequestPayload,
} from "@/lib/api";
import { generateFollowUpSuggestions } from "@/lib/suggestions";
import {
  cancelSpeech,
  createSpeechRecognizer,
  speakText,
  type SpeechRecognizerControl,
} from "@/lib/voice";

// The rest of this file is exactly the current Home component from app/page.tsx,
// just renamed to HomeClient.

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chart?: ChartPayload;
  createdAt?: number;
};

type ChatThread = {
  id: string;
  title: string;
  messages: Message[];
  sessionId?: string | null;
  createdAt: number;
  updatedAt: number;
  /** First user message preview for sidebar */
  preview?: string;
};

/** Aligns with backend campus routing hints — used only for loading copy. */
const CAMPUS_QUERY_HINT =
  /\b(?:placements?|packages?|salary|salaries|compan(?:y|ies)|interview(?:s|ing|ed)?|mit|manipal)\b/i;

const DEFAULT_TYPING_LABEL = "Campus AI is typing...";

function resolveLoadingLabel(userMessage: string): string {
  const intent = detectIntent(userMessage);
  if (intent === "analytics") return "Looking into campus data...";
  if (intent === "interview") return "Thinking...";
  if (intent === "chat") {
    return CAMPUS_QUERY_HINT.test(userMessage)
      ? "Looking into campus data..."
      : "Thinking...";
  }
  return DEFAULT_TYPING_LABEL;
}

function formatChatTime(ts: number | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const WELCOME_HINT =
  "Hi 👋 I can help you with placements, salaries, and interview preparation.";

const STARTER_CHIPS = ["Average package", "Top companies", "Start interview"] as const;

function TypingDots() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300/90"
          animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
          transition={{
            duration: 0.55,
            repeat: Infinity,
            delay: i * 0.14,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

function buildWelcomeMessage(): Message {
  return {
    id: `welcome-${createId()}`,
    role: "assistant",
    content: WELCOME_HINT,
    createdAt: Date.now(),
  };
}

export default function HomeClient() {
  const welcomeTarget =
    "Welcome to Campus AI Assistant. I help you with placements, companies, and interview prep.";
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");

  const recognizerRef = useRef<SpeechRecognizerControl | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const welcomedRef = useRef(false);
  const pendingSpeechRef = useRef<string | null>(null);
  const streamingTimerRef = useRef<number | null>(null);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [talkModeEnabled, setTalkModeEnabled] = useState(false);
  const isSpeakingRef = useRef(false);
  isSpeakingRef.current = isSpeaking;
  /** Talk mode: live user transcript (STT) */
  const [liveTranscript, setLiveTranscript] = useState("");
  /** Talk mode: AI line while TTS plays */
  const [aiCaption, setAiCaption] = useState("");
  const talkModeRef = useRef(false);
  talkModeRef.current = talkModeEnabled;
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const sessionIdRef = useRef<string | null | undefined>(undefined);
  const [loadingBannerText, setLoadingBannerText] = useState(DEFAULT_TYPING_LABEL);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const lastSuggestionKeyRef = useRef<string | null>(null);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    setChats((prev) => {
      if (prev.length > 0) return prev;
      const now = Date.now();
      const newChat: ChatThread = {
        id: createId(),
        title: "New chat",
        messages: [buildWelcomeMessage()],
        sessionId: createId(),
        createdAt: now,
        updatedAt: now,
        preview: undefined,
      };
      setActiveChatId(newChat.id);
      return [newChat];
    });
  }, [mounted]);

  /** Stable while only message text streams; updates when threads are added/removed/reordered */
  const chatThreadCount = chats.length;
  const chatThreadIdsKey = useMemo(() => chats.map((c) => c.id).join(","), [chats]);

  useEffect(() => {
    if (chatThreadCount === 0) return;
    const firstId = chatThreadIdsKey.split(",")[0];
    if (!firstId) return;
    setActiveChatId((prev) => prev || firstId);
  }, [chatThreadCount, chatThreadIdsKey]);

  useEffect(() => {
    if (!mounted) return;
    recognizerRef.current = createSpeechRecognizer(
      (text) => {
        pendingSpeechRef.current = text;
        setInput(text);
        if (talkModeRef.current) {
          setLiveTranscript(text);
        }
      },
      setIsListening
    );
    return () => {
      recognizerRef.current?.stop();
      cancelSpeech();
    };
  }, [mounted]);

  useEffect(() => {
    return () => {
      if (streamingTimerRef.current) {
        window.clearInterval(streamingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mounted || welcomedRef.current) return;
    welcomedRef.current = true;
    recognizerRef.current?.stop();
    setIsSpeaking(true);
    speakText(welcomeTarget, () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
    });
  }, [mounted, welcomeTarget]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeChatId, chats]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? chats[0],
    [activeChatId, chats]
  );
  sessionIdRef.current = activeChat?.sessionId;
  const messages = useMemo(() => activeChat?.messages ?? [], [activeChat?.messages]);

  const hasUserMessage = useMemo(
    () => messages.some((m) => m.role === "user"),
    [messages]
  );

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [chats]
  );

  const selectChat = useCallback(async (chatId: string, sessionId: string | null | undefined) => {
    setActiveChatId(chatId);
    if (!sessionId) return;
    try {
      const rows = await fetchChatHistory(sessionId);
      if (rows.length === 0) return;
      const mapped: Message[] = rows.map((r, i) => ({
        id: `${chatId}-sync-${i}-${r.role}`,
        role: r.role === "assistant" ? "assistant" : "user",
        content: r.content,
        createdAt: Date.now(),
      }));
      const firstUser = mapped.find((m) => m.role === "user");
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: mapped,
                preview: firstUser ? firstUser.content.slice(0, 72) : c.preview,
                updatedAt: Date.now(),
              }
            : c
        )
      );
    } catch {
      /* keep local messages if history unavailable */
    }
  }, []);

  const avatarState: "idle" | "listening" | "speaking" = useMemo(() => {
    if (isSpeaking) return "speaking";
    if (isListening) return "listening";
    return "idle";
  }, [isListening, isSpeaking]);

  const avatarMode = talkModeEnabled ? "talk" : "normal";

  useEffect(() => {
    if (talkModeEnabled && isListening) {
      setAiCaption("");
    }
  }, [talkModeEnabled, isListening]);

  useEffect(() => {
    if (!isLoading && !isAssistantTyping) {
      setLoadingBannerText(DEFAULT_TYPING_LABEL);
    }
  }, [isLoading, isAssistantTyping]);

  useEffect(() => {
    setFollowUpSuggestions([]);
    lastSuggestionKeyRef.current = null;
  }, [activeChatId]);

  useEffect(() => {
    if (isLoading || isAssistantTyping) return;
    if (!messages.some((m) => m.role === "user")) return;
    const last = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim().length > 0);
    if (!last) return;
    const key = `${last.id}:${last.content.length}`;
    if (lastSuggestionKeyRef.current === key) return;
    lastSuggestionKeyRef.current = key;
    const prevUser = [...messages].reverse().find((m) => m.role === "user");
    setFollowUpSuggestions(generateFollowUpSuggestions(last.content, prevUser?.content));
  }, [messages, isLoading, isAssistantTyping]);

  const appendMessage = useCallback((message: Message) => {
    const ts = Date.now();
    const chatId = activeChatIdRef.current;
    const msg = { ...message, createdAt: message.createdAt ?? ts };
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        const updatedMessages = [...chat.messages, msg];
        const firstUser = updatedMessages.find((m) => m.role === "user");
        const title =
          chat.title === "New chat" && firstUser ? firstUser.content.slice(0, 40) : chat.title;
        const preview = firstUser ? firstUser.content.slice(0, 72) : chat.preview;
        return {
          ...chat,
          title,
          preview,
          updatedAt: ts,
          messages: updatedMessages,
        };
      })
    );
  }, []);

  const setActiveChatSession = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) return;
    const ts = Date.now();
    const chatId = activeChatIdRef.current;
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, sessionId, updatedAt: ts } : chat))
    );
  }, []);

  const handleAssistantReply = useCallback(
    (content: string, chart?: ChartPayload) => {
      const assistantId = createId();
      appendMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        chart,
      });

      if (streamingTimerRef.current) {
        window.clearInterval(streamingTimerRef.current);
      }
      setIsAssistantTyping(true);
      let i = 0;
      streamingTimerRef.current = window.setInterval(() => {
        i += 1;
        const nextText = content.slice(0, i);
        const targetChatId = activeChatIdRef.current;
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.id !== targetChatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((m) =>
                m.id === assistantId ? { ...m, content: nextText } : m
              ),
            };
          })
        );
        if (i >= content.length) {
          if (streamingTimerRef.current) {
            window.clearInterval(streamingTimerRef.current);
            streamingTimerRef.current = null;
          }
          setIsAssistantTyping(false);
        }
      }, 10);

      if (mounted) {
        recognizerRef.current?.stop();
        cancelSpeech();
        setIsSpeaking(true);
        if (talkModeRef.current) {
          setAiCaption(content);
        }
        speakText(content, () => {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          if (talkModeRef.current) {
            setAiCaption("");
          }
          if (talkModeRef.current && recognizerRef.current) {
            const r = recognizerRef.current;
            r.stop();
            window.setTimeout(() => {
              if (!talkModeRef.current) return;
              r.start();
            }, 80);
          }
        });
      }
    },
    [appendMessage, mounted]
  );

  const handleSend = useCallback(
    async (overrideText?: unknown) => {
      const userMessage =
        typeof overrideText === "string" ? overrideText.trim() : input.trim();
      if (!userMessage) return;

      const chatId = activeChatIdRef.current;
      if (isLoading || !chatId) return;

      appendMessage({
        id: createId(),
        role: "user",
        content: userMessage,
      });
      setInput("");
      setLoadingBannerText(resolveLoadingLabel(userMessage));
      setIsLoading(true);

      try {
        const intent = detectIntent(userMessage);
        if (intent === "interview") {
          const result = userMessage.toLowerCase().includes("start")
            ? await startInterview()
            : await answerInterview(userMessage);
          handleAssistantReply(result.message, result.chart);
        } else {
          const res = (await requestChat(
            userMessage,
            sessionIdRef.current
          )) as ChatRequestPayload;
          const aiMessage =
            res?.message || res?.data?.message || "Something went wrong";
          setActiveChatSession(res.session_id);
          handleAssistantReply(aiMessage, res.chart);
        }
      } catch (err) {
        console.error("Chat error:", err);
        handleAssistantReply("Error reaching server");
      } finally {
        setIsLoading(false);
      }
    },
    [appendMessage, handleAssistantReply, input, isLoading, setActiveChatSession]
  );

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    if (!isListening && pendingSpeechRef.current) {
      const spoken = pendingSpeechRef.current;
      pendingSpeechRef.current = null;
      void handleSendRef.current(spoken);
    }
  }, [isListening]);

  const createNewChat = useCallback(() => {
    const now = Date.now();
    const newChat: ChatThread = {
      id: createId(),
      title: "New chat",
      messages: [buildWelcomeMessage()],
      sessionId: createId(),
      createdAt: now,
      updatedAt: now,
      preview: undefined,
    };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput("");
  }, []);

  const applySuggestion = useCallback((text: string) => {
    setInput(text);
  }, []);

  const handleMicClick = useCallback(() => {
    if (!mounted || !recognizerRef.current) return;
    cancelSpeech();
    setIsSpeaking(false);
    const r = recognizerRef.current;
    if (isListening) {
      r.stop();
    } else {
      r.stop();
      window.setTimeout(() => {
        if (!isSpeakingRef.current) r.start();
      }, 0);
    }
  }, [isListening, mounted]);

  const enableTalkMode = useCallback(() => {
    if (!mounted || !recognizerRef.current) return;
    cancelSpeech();
    setIsSpeaking(false);
    setLiveTranscript("");
    setAiCaption("");
    setTalkModeEnabled(true);
    const r = recognizerRef.current;
    r.stop();
    window.setTimeout(() => {
      if (!isSpeakingRef.current) r.start();
    }, 0);
  }, [mounted]);

  const exitTalkMode = useCallback(() => {
    setTalkModeEnabled(false);
    setLiveTranscript("");
    setAiCaption("");
    recognizerRef.current?.stop();
    cancelSpeech();
  }, []);

  useEffect(() => {
    if (!talkModeEnabled || isSpeaking) return;
    if (isListening) return;
    const r = recognizerRef.current;
    if (!r) return;
    r.stop();
    const id = window.setTimeout(() => {
      if (!talkModeRef.current || isSpeakingRef.current) return;
      r.start();
    }, 80);
    return () => window.clearTimeout(id);
  }, [talkModeEnabled, isSpeaking, isListening]);

  useEffect(() => {
    if (!talkModeEnabled) return;

    const timeout = window.setTimeout(() => {
      if (!liveTranscript && !isSpeaking) {
        setAiCaption("You can ask me about placements, salaries, or interviews.");
        speakText("You can ask me about placements, salaries, or interviews.", () =>
          setAiCaption("")
        );
      }
    }, 6000);

    return () => window.clearTimeout(timeout);
  }, [talkModeEnabled, liveTranscript, isSpeaking]);

  if (!mounted) {
    return null;
  }

  return (
    <div className="relative flex h-screen min-h-0 w-full overflow-visible bg-gradient-to-br from-[#020617] via-[#020617] to-[#0f172a] text-zinc-100">
      <div className="relative z-[50] flex h-full min-h-0 w-full flex-row">
        <aside
          className={`flex h-full w-[260px] shrink-0 flex-col overflow-visible border-r border-white/10 bg-gradient-to-b from-[#020617] to-[#0f172a] px-3 py-4 backdrop-blur-md ${talkModeEnabled ? "hidden" : ""}`}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-1.5 shadow-[0_0_20px_rgba(56,189,248,0.28)] ring-1 ring-white/10">
              <Image
                src="/logo.png"
                alt="Campus AI logo"
                width={36}
                height={36}
                className="mix-blend-multiply"
                priority
              />
            </div>
            <h1 className="text-sm font-semibold tracking-wide text-zinc-100">Campus AI</h1>
          </div>
          <motion.button
            onClick={createNewChat}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-zinc-100 transition-all duration-200 hover:bg-white/10"
          >
            + New Chat
          </motion.button>
          <div className="mt-5 min-h-0 overflow-y-auto pr-1">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">
              Recent
            </p>
            <div className="space-y-1.5">
              {sortedChats.length ? (
                sortedChats.map((chat) => (
                  <motion.button
                    key={chat.id}
                    type="button"
                    whileHover={{ scale: 1.05, x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void selectChat(chat.id, chat.sessionId)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition-all duration-200 active:bg-white/10 ${
                      activeChatId === chat.id
                        ? "bg-white/10 text-zinc-100 ring-1 ring-cyan-400/25"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    }`}
                  >
                    <span className="line-clamp-2 text-sm font-medium leading-snug">
                      {chat.preview?.trim() || chat.title}
                    </span>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      {formatChatTime(chat.updatedAt)}
                    </span>
                  </motion.button>
                ))
              ) : (
                <p className="px-2 py-2 text-xs leading-relaxed text-zinc-500">
                  Your conversations will appear here
                </p>
              )}
            </div>
          </div>
        </aside>

        <section
          className={`relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-visible bg-transparent ${talkModeEnabled ? "hidden" : ""}`}
        >
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mb-6 w-full max-w-4xl shrink-0 px-6 pt-10 pr-44 sm:pr-52"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold text-white">Campus AI Assistant</h2>
                <p className="mt-1.5 text-sm text-white/80">
                  I help you with placements, companies, and interview prep.
                </p>
              </div>
              <Link
                href="/documents"
                className="hidden shrink-0 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-wide text-white/90 transition hover:bg-white/10 sm:inline-flex"
              >
                Knowledge base
              </Link>
            </div>
          </motion.header>

          <motion.div
            ref={chatScrollRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.08 }}
            className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-6 pb-6"
          >
            <div className="mt-4 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <ChatBubble
                    key={message.id}
                    role={message.role}
                    content={message.content}
                    chart={message.chart}
                  />
                ))}
                {isLoading || isAssistantTyping ? (
                  <motion.div
                    key="typing-indicator"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="flex justify-start"
                  >
                    <div className="flex max-w-[65%] items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-zinc-300 shadow-[0_0_24px_rgba(0,0,0,0.12)] backdrop-blur-sm">
                      <span>{loadingBannerText}</span>
                      <TypingDots />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {!hasUserMessage && !isLoading && !isAssistantTyping ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.05 }}
                  className="flex flex-wrap gap-2"
                >
                  {STARTER_CHIPS.map((item) => (
                    <motion.button
                      key={item}
                      type="button"
                      onClick={() => applySuggestion(item)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      className="rounded-full bg-white/5 px-4 py-2 text-sm text-zinc-200 transition-all duration-200 hover:scale-105 hover:bg-white/10"
                    >
                      {item}
                    </motion.button>
                  ))}
                </motion.div>
              ) : null}

              {followUpSuggestions.length > 0 &&
              hasUserMessage &&
              !isLoading &&
              !isAssistantTyping ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center justify-center gap-2 border-t border-white/5 pt-4"
                >
                  <span className="w-full text-center text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Suggested follow-ups
                  </span>
                  {followUpSuggestions.map((s) => (
                    <motion.button
                      key={s}
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => applySuggestion(s)}
                      className="rounded-full bg-white/6 px-4 py-2 text-sm text-zinc-200 transition-all duration-200 hover:scale-105 hover:bg-white/10"
                    >
                      {s}
                    </motion.button>
                  ))}
                </motion.div>
              ) : null}
            </div>
          </motion.div>

          <div className="sticky bottom-0 z-20 w-full shrink-0 border-t border-white/10 bg-white/5 backdrop-blur-md">
            <div className="mx-auto w-full max-w-4xl space-y-1.5 px-6 py-3">
              {isListening ? (
                <p className="text-center text-xs text-cyan-300/95 transition-opacity duration-200">
                  Listening...
                </p>
              ) : isSpeaking ? (
                <p className="text-center text-xs text-violet-300/95 transition-opacity duration-200">
                  Campus AI speaking...
                </p>
              ) : null}
              <InputBar
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                onMicClick={handleMicClick}
                isListening={isListening}
                disabled={isLoading}
                talkModeEnabled={talkModeEnabled}
                onTalkToggle={talkModeEnabled ? exitTalkMode : enableTalkMode}
              />
            </div>
          </div>
        </section>

        <div
          className={`hidden lg:flex z-[10] h-full items-center justify-end w-[340px] shrink-0 ${talkModeEnabled ? "hidden" : ""}`}
        >
          <div className="h-[420px] w-[300px] flex items-center justify-center overflow-hidden">
            <AvatarScene mode={avatarMode} state={avatarState} />
          </div>
        </div>
      </div>

      {talkModeEnabled ? (
        <div className="fixed inset-0 z-[30] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 pointer-events-none" />
          <div className="relative flex items-center justify-center">
            <div className="absolute h-[220px] w-[220px] rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="w-[360px] h-[460px] flex items-center justify-center">
              <AvatarScene mode="talk" state={avatarState} />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-10 z-[1] flex w-full max-w-lg -translate-x-1/2 flex-col items-center justify-center px-6 text-center"
          >
            <p className="text-sm text-white/60">Voice conversation</p>
            <div className="mt-6 flex flex-col items-center gap-2">
              {liveTranscript ? (
                <div className="text-white text-sm animate-pulse">
                  {`${String.fromCodePoint(0x1f3a4)} `}
                  {liveTranscript}
                </div>
              ) : null}
              {aiCaption ? (
                <div className="text-blue-300 text-sm">
                  {`${String.fromCodePoint(0x1f916)} `}
                  {aiCaption}
                </div>
              ) : null}
              {!liveTranscript && !aiCaption ? (
                <div className="text-white/50 text-sm animate-pulse">Listening...</div>
              ) : null}
            </div>
            <div className="relative z-[1000]">
              <motion.button
                type="button"
                onClick={exitTalkMode}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="mt-10 rounded-full bg-white/10 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                End Conversation
              </motion.button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}

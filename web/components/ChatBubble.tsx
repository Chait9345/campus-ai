"use client";

import dynamic from "next/dynamic";
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { ChartPayload } from "@/lib/api";
import { parseAssistantTrust } from "@/lib/trust";

const ChartRenderer = dynamic(() => import("./ChartRenderer"), {
  ssr: false,
  loading: () => <div className="mt-3 text-xs text-zinc-400">Loading chart...</div>,
});

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  chart?: ChartPayload;
}

function confidenceClass(c: "high" | "medium" | "low"): string {
  if (c === "high") return "bg-emerald-500/15 text-emerald-300";
  if (c === "medium") return "bg-amber-500/15 text-amber-200";
  return "bg-sky-500/15 text-sky-300";
}

function ChatBubbleComponent({ role, content, chart }: ChatBubbleProps) {
  const isUser = role === "user";

  const trust = useMemo(() => {
    if (isUser || !content || content.trim().length < 16) return null;
    return parseAssistantTrust(content);
  }, [isUser, content]);

  const cleanedContent = trust?.cleanedContent ?? content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`w-full ${isUser ? "flex justify-end" : "flex justify-start"}`}
    >
      <div
        className={`max-w-[65%] rounded-2xl border px-4 py-3 break-words [overflow-wrap:anywhere] whitespace-pre-wrap leading-relaxed backdrop-blur-sm transition-all duration-200 ${
          isUser
            ? "border-transparent bg-blue-500/20 text-zinc-100"
            : "border-white/10 bg-white/5 text-zinc-100 shadow-[0_0_20px_rgba(0,0,0,0.12)]"
        }`}
      >
        {!isUser && trust ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-medium text-zinc-200">
              {trust.sourceLabel}
            </span>
            <span className={`rounded-full px-2 py-0.5 font-medium ${confidenceClass(trust.confidence)}`}>
              {trust.confidence === "high"
                ? "High confidence"
                : trust.confidence === "medium"
                  ? "Medium confidence"
                  : "Low confidence"}
            </span>
          </div>
        ) : null}
        <div className="prose prose-invert prose-p:my-2 prose-li:my-0.5 max-w-none text-[15px] leading-relaxed">
          <ReactMarkdown>{cleanedContent}</ReactMarkdown>
        </div>
        {chart ? <ChartRenderer chart={chart} /> : null}
      </div>
    </motion.div>
  );
}

const ChatBubble = memo(ChatBubbleComponent);
export default ChatBubble;

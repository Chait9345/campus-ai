"use client";

import { motion } from "framer-motion";
import { Headset, Mic, SendHorizontal } from "lucide-react";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onMicClick: () => void;
  isListening: boolean;
  disabled?: boolean;
  talkModeEnabled: boolean;
  onTalkToggle: () => void;
}

export default function InputBar({
  value,
  onChange,
  onSubmit,
  onMicClick,
  isListening,
  disabled = false,
  talkModeEnabled,
  onTalkToggle,
}: InputBarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      <div
        className="group/form flex w-full items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md transition-all duration-300 hover:border-white/[0.16] focus-within:border-blue-400/40 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_2px_rgba(96,165,250,0.25),0_0_36px_rgba(59,130,246,0.12)] focus-within:ring-2 focus-within:ring-blue-400/30"
      >
        <motion.button
          type="button"
          onClick={onTalkToggle}
          disabled={disabled}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          title={talkModeEnabled ? "Exit talk mode" : "Talk mode"}
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors duration-200 ${
            talkModeEnabled
              ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/35"
              : "bg-white/[0.06] text-zinc-300 hover:bg-white/10"
          }`}
        >
          <Headset className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          <span className="hidden sm:inline">{talkModeEnabled ? "Exit" : "Talk"}</span>
        </motion.button>

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Ask Campus AI anything..."
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border-0 bg-transparent py-1 text-[15px] leading-relaxed text-zinc-100 outline-none transition-colors duration-200 placeholder:text-zinc-500 focus:placeholder:text-zinc-600 focus:ring-2 focus:ring-blue-400/30 focus:ring-offset-0"
        />

        <motion.button
          type="button"
          onClick={onMicClick}
          disabled={disabled}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title="Microphone"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors duration-200 ${
            isListening
              ? "bg-cyan-400/20 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
              : "bg-white/[0.06] text-zinc-200 hover:bg-white/10"
          }`}
        >
          <Mic size={18} />
        </motion.button>

        <motion.button
          type="button"
          onClick={() => onSubmit()}
          disabled={disabled || !value.trim()}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          title="Send"
          className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/35 text-cyan-50 transition duration-200 hover:from-cyan-400/55 hover:to-violet-400/45 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.2),transparent_65%)]" />
          <SendHorizontal size={18} className="relative z-[1]" />
        </motion.button>
      </div>
    </motion.div>
  );
}

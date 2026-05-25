"use client";

import { motion } from "framer-motion";
import { Building2, ChartColumnBig, GraduationCap } from "lucide-react";

interface QuickActionsProps {
  onAction: (action: "stats" | "interview" | "companies") => void;
}

const actions = [
  { id: "stats", label: "Placement Stats", Icon: ChartColumnBig },
  { id: "interview", label: "Start Interview", Icon: GraduationCap },
  { id: "companies", label: "Top Companies", Icon: Building2 },
] as const;

export default function QuickActions({ onAction }: QuickActionsProps) {
  return (
    <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
      {actions.map(({ id, label, Icon }) => (
        <motion.button
          key={id}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAction(id)}
          transition={{ type: "spring", stiffness: 320, damping: 20 }}
          className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-sm text-zinc-100 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/[0.11]"
        >
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-300/10 to-violet-300/0 opacity-0 transition group-hover:opacity-100" />
          <Icon size={16} />
          <span>{label}</span>
        </motion.button>
      ))}
    </div>
  );
}

"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  LabelList,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { ChartPayload } from "@/lib/api";

const PIE_COLORS = ["#60a5fa", "#22d3ee", "#34d399", "#f59e0b", "#f472b6"];

function ChartRendererComponent({ chart }: { chart: ChartPayload }) {
  const xKey = chart.xKey ?? "name";
  const yKey = chart.yKey ?? "value";
  const pieDataKey = chart.pieDataKey ?? "value";
  const pieNameKey = chart.pieNameKey ?? "name";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mt-4 rounded-2xl border border-white/15 bg-gradient-to-b from-white/10 to-white/5 p-3.5 shadow-[0_14px_35px_rgba(0,0,0,0.35)]"
    >
      <p className="mb-3 text-xs font-semibold tracking-wide text-zinc-200">
        {chart.title ?? (chart.type === "bar" ? "Branch-wise Average Package" : "Campus Insights")}
      </p>

      <motion.div whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="h-56 w-full rounded-xl bg-black/20 p-2">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "bar" ? (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey={xKey} stroke="#a1a1aa" />
              <YAxis stroke="#a1a1aa" />
              <Tooltip />
              <Bar dataKey={yKey} fill="#60a5fa" radius={[8, 8, 0, 0]}>
                <LabelList dataKey={yKey} position="top" fill="#e4e4e7" fontSize={11} />
              </Bar>
            </BarChart>
          ) : chart.type === "pie" ? (
            <PieChart>
              <Tooltip />
              <Pie
                data={chart.data}
                dataKey={pieDataKey}
                nameKey={pieNameKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#60a5fa"
              >
                {chart.data.map((entry, index) => (
                  <Cell key={`${entry[pieNameKey]}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey={xKey} stroke="#a1a1aa" />
              <YAxis stroke="#a1a1aa" />
              <Tooltip />
              <Line type="monotone" dataKey={yKey} stroke="#22d3ee" strokeWidth={2.5} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
}

const ChartRenderer = memo(ChartRendererComponent);
export default ChartRenderer;

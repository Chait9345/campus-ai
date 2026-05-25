"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { uploadDocument, type UploadDocumentResult } from "@/lib/api";

export default function DocumentsPage() {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadDocumentResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResults([]);
    setSelectedFiles(event.target.files);
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    const nextResults: UploadDocumentResult[] = [];

    try {
      for (const file of Array.from(selectedFiles)) {
        const res = await uploadDocument(file);
        nextResults.push(res);
      }
      setResults(nextResults);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? "Upload failed");
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#020617] via-[#020617] to-[#0f172a] text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Knowledge Base Documents</h1>
            <p className="mt-2 text-sm text-white/70">
              Upload PDFs, spreadsheets, or text files. The Campus AI chatbot will use them as
              context when answering questions.
            </p>
          </div>
          <a
            href="/"
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            ← Back to chat
          </a>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-white/80">Select documents</label>
              <input
                type="file"
                multiple
                onChange={handleFileChange}
                className="mt-2 block w-full cursor-pointer rounded-lg border border-dashed border-white/20 bg-black/10 px-3 py-2 text-sm text-white/80 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-cyan-500/90 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:border-cyan-400/60"
              />
              <p className="mt-2 text-xs text-white/60">
                Supported: .txt, .pdf, .csv, .xlsx, .xls
              </p>
            </div>

            <motion.button
              type="button"
              whileHover={{ scale: uploading ? 1 : 1.03 }}
              whileTap={{ scale: uploading ? 1 : 0.97 }}
              onClick={handleUpload}
              disabled={uploading || !selectedFiles || selectedFiles.length === 0}
              className="inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_25px_rgba(34,211,238,0.45)] transition disabled:cursor-not-allowed disabled:bg-cyan-500/40"
            >
              {uploading ? "Uploading..." : "Upload & index documents"}
            </motion.button>

            {error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : null}

            {results.length > 0 ? (
              <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Indexed documents
                </p>
                <ul className="space-y-1 text-sm text-zinc-100">
                  {results.map((r) => (
                    <li key={`${r.file}-${r.chunks_indexed}`} className="flex items-center justify-between">
                      <span>{r.file}</span>
                      <span className="text-xs text-zinc-400">
                        {r.chunks_indexed} chunk{r.chunks_indexed === 1 ? "" : "s"} indexed
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * WorkshopContextCard.jsx
 *
 * Carte "Contexte de l'atelier" — page de démarrage.
 * Sections :
 *   1. Contexte libre + question de départ
 *   2. Upload documents (PDF, DOCX, XLSX, CSV, TXT)
 *   3. Configuration IA (provider + clé API + test)
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  EyeOff,
  KeyRound,
  Zap,
  Check,
  RotateCcw,
  Search,
  ExternalLink,
} from "lucide-react";
import { parseUploadedFile } from "../lib/documentParser";
import { useAIConfig } from "../lib/useAIConfig";

// ─── constantes ───────────────────────────────────────────────────────────────

const ACCEPTED = ".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt";
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const PROVIDERS = [
  {
    id: "google",
    name: "Gemini",
    sub: "Gemini 1.5 Pro",
    hint: "AIzaSy…",
    keyUrl: "https://aistudio.google.com/app/apikey",
    steps: ["Ouvrez Google AI Studio (aistudio.google.com)", "Cliquez « Obtenir une clé API »", "Créez ou sélectionnez un projet Google Cloud"],
  },
  {
    id: "openai",
    name: "OpenAI",
    sub: "GPT-4o",
    hint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    steps: ["Connectez-vous sur platform.openai.com", "Menu gauche → API keys", "Cliquez « Create new secret key »"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    sub: "Claude Opus",
    hint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    steps: ["Connectez-vous sur console.anthropic.com", "Settings → API Keys", "Cliquez « Create Key »"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    sub: "Multi-modèles",
    hint: "sk-or-v1-…",
    keyUrl: "https://openrouter.ai/keys",
    steps: ["Créez un compte sur openrouter.ai", "Allez dans Keys", "Cliquez « Create Key »"],
  },
  {
    id: "autre",
    name: "Autre",
    sub: "Compatible OpenAI",
    hint: "Votre clé API…",
    keyUrl: null,
    steps: null,
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const fileEmoji = (name = "") => {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf"))                      return "📄";
  if (n.endsWith(".docx") || n.endsWith(".doc")) return "📝";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "📊";
  if (n.endsWith(".csv"))                      return "📋";
  return "📄";
};

const fmtBytes = (b) =>
  b < 1024 ? `${b} o` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} ko` : `${(b / 1024 ** 2).toFixed(1)} Mo`;

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, errorMessage }) {
  if (status === "loading")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-indigo-500">
        <Loader2 className="w-3 h-3 animate-spin" /> Extraction…
      </span>
    );
  if (status === "extracted")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle className="w-3 h-3" /> Extrait
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500 cursor-help" title={errorMessage}>
        <AlertCircle className="w-3 h-3" />
        {errorMessage?.includes("Format") ? "Format non supporté" : "Erreur"}
      </span>
    );
  return null;
}

// ─── AIConfigPanel ────────────────────────────────────────────────────────────

export function AIConfigPanel({ onConfigured }) {
  const { config, save, clear, PROVIDER_DEFAULTS } = useAIConfig();
  const [provider, setProvider]   = useState(config.provider || "");
  const [apiKey, setApiKey]       = useState(config.apiKey   || "");
  const [showKey, setShowKey]     = useState(false);
  const [showHelp, setShowHelp]   = useState(false);
  const [testState, setTestState] = useState("idle"); // idle | testing | ok | error
  const [testMsg, setTestMsg]     = useState("");

  const currentProvider = PROVIDERS.find((p) => p.id === provider);
  const hint = currentProvider?.hint || PROVIDER_DEFAULTS[provider]?.hint || "Votre clé API…";

  const handleProviderChange = (val) => {
    setProvider(val);
    setShowHelp(false);
    setTestState("idle");
    setTestMsg("");
  };

  const handleSave = () => {
    if (!provider || !apiKey.trim()) return;
    const next = save(provider, apiKey);
    onConfigured?.(next);
    setTestState("idle");
    setTestMsg("");
  };

  const handleTest = async () => {
    if (!provider || !apiKey.trim()) return;
    setTestState("testing");
    setTestMsg("");
    await new Promise((r) => setTimeout(r, 1200));
    const formats = { openai: /^sk-/, anthropic: /^sk-ant-/, google: /^AIza/, openrouter: /^sk-or-v1-/ };
    const re = formats[provider];
    if (!re || re.test(apiKey.trim())) {
      setTestState("ok");
      setTestMsg("Format de clé valide ✓");
    } else {
      setTestState("error");
      setTestMsg("Format de clé inattendu — vérifiez la syntaxe.");
    }
  };

  const handleClear = () => {
    clear();
    setProvider("");
    setApiKey("");
    setTestState("idle");
    setTestMsg("");
    setShowHelp(false);
    onConfigured?.(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Sélecteur provider ── */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Fournisseur IA
        </label>
        <div className="flex items-center gap-2">
          {/* Select */}
          <div className="flex-1 relative">
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 focus:bg-white pl-3.5 pr-8 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition cursor-pointer"
            >
              <option value="">Choisir un fournisseur…</option>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.sub}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {/* Bouton aide (loupe) */}
          {provider && currentProvider?.steps && (
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className={[
                "p-2.5 rounded-xl border transition-colors",
                showHelp
                  ? "border-indigo-300 bg-indigo-50 text-indigo-600"
                  : "border-gray-200 text-gray-400 hover:text-indigo-500 hover:border-indigo-200 bg-gray-50",
              ].join(" ")}
              title="Comment obtenir cette clé API"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Popover aide clé API ── */}
      {showHelp && currentProvider?.steps && (
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 space-y-3">
          <p className="text-xs font-bold text-indigo-800 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            Comment obtenir votre clé {currentProvider.name}
          </p>
          <ol className="space-y-1.5">
            {currentProvider.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-indigo-700">
                <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 text-[10px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          {currentProvider.keyUrl && (
            <a
              href={currentProvider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Accéder directement à la console {currentProvider.name}
            </a>
          )}
        </div>
      )}

      {/* ── Clé API ── */}
      {provider && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Clé API
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hint}
              className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 font-mono transition"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title={showKey ? "Masquer" : "Afficher"}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            Stockée localement dans votre navigateur — non transmise à nos serveurs.
          </p>
        </div>
      )}

      {/* ── Message de test ── */}
      {testMsg && (
        <p className={`text-xs flex items-center gap-1.5 ${testState === "ok" ? "text-emerald-600" : "text-red-500"}`}>
          {testState === "ok" ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {testMsg}
        </p>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!provider || !apiKey.trim()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          <Check className="w-4 h-4" /> Enregistrer
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={!provider || !apiKey.trim() || testState === "testing"}
          className="inline-flex items-center gap-1.5 py-2.5 px-3 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {testState === "testing"
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Zap className="w-3.5 h-3.5" />
          }
          Tester
        </button>
        {config.configured && (
          <button
            type="button"
            onClick={handleClear}
            className="p-2.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-400 hover:border-red-200 transition"
            title="Supprimer la configuration"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function WorkshopContextCard({ onChange }) {
  const { config } = useAIConfig();

  const [manualContext, setManualContext] = useState("");
  const [sessionObjective, setSessionObjective] = useState("");
  const [documents, setDocuments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fileInputRef = useRef(null);

  /* Notifier le parent */
  useEffect(() => {
    onChange?.({ manualContext, sessionObjective, uploadedDocuments: documents });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualContext, sessionObjective, documents]);

  /* Traitement des fichiers */
  const processFiles = useCallback(async (fileList) => {
    const valid = Array.from(fileList).filter((f) => {
      if (f.size > MAX_BYTES) {
        alert(`"${f.name}" dépasse ${MAX_MB} Mo.`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    const entries = valid.map((f) => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      size: f.size,
      type: f.type,
      status: "loading",
      extractedText: null,
      errorMessage: null,
    }));

    setDocuments((prev) => [...prev, ...entries]);

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      const { id } = entries[i];
      try {
        const text = await parseUploadedFile(file);
        setDocuments((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: "extracted", extractedText: text } : d))
        );
      } catch (err) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: "error", errorMessage: err.message } : d))
        );
      }
    }
  }, []);

  const onDrop = useCallback(
    (e) => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); },
    [processFiles]
  );
  const onDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); };
  const removeDoc   = (id) => setDocuments((prev) => prev.filter((d) => d.id !== id));

  const loadingCount  = documents.filter((d) => d.status === "loading").length;
  const extractedCount = documents.filter((d) => d.status === "extracted").length;
  const hasContent    = manualContext || sessionObjective || documents.length > 0;

  /* Résumé de contenu pour le badge rétractable */
  const contentSummary = [
    manualContext       && "contexte",
    sessionObjective    && "question",
    documents.length > 0 && `${documents.length} doc${documents.length > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── En-tête ── */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 hover:from-indigo-50 transition-colors text-left"
        aria-expanded={!collapsed}
      >
        <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800">Contexte de l'atelier</span>
          {hasContent && (
            <span className="ml-2 text-xs text-indigo-500 font-medium">{contentSummary}</span>
          )}
        </div>
        <span className="text-xs text-gray-400 italic mr-1">Optionnel</span>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronUp   className="w-4 h-4 text-gray-400 shrink-0" />
        }
      </button>

      {/* ── Corps ── */}
      {!collapsed && (
        <div className="divide-y divide-slate-100">

          {/* ── Bloc 1 : Champs texte ── */}
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Contexte de l'atelier
              </label>
              <textarea
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none bg-slate-50 focus:bg-white transition"
                placeholder="Organisation concernée, enjeux actuels, historique pertinent…"
                value={manualContext}
                onChange={(e) => setManualContext(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Question de départ · Objectif de séance
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-slate-50 focus:bg-white transition"
                placeholder="Ex : Pourquoi la participation des membres diminue-t-elle ?"
                value={sessionObjective}
                onChange={(e) => setSessionObjective(e.target.value)}
              />
            </div>
          </div>

          {/* ── Bloc 2 : Documents ── */}
          <div className="p-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Documents de référence
            </label>

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              className={[
                "relative border-2 border-dashed rounded-2xl px-4 py-6 text-center cursor-pointer transition-all",
                isDragging
                  ? "border-indigo-400 bg-indigo-50 scale-[1.01]"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50",
              ].join(" ")}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDragging ? "bg-indigo-100" : "bg-slate-100"}`}>
                  <Upload className={`w-5 h-5 ${isDragging ? "text-indigo-500" : "text-slate-400"}`} />
                </div>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-indigo-600">Cliquez</span> ou glissez vos documents ici
                </p>
                <p className="text-xs text-gray-400">PDF · DOCX · XLSX · CSV · TXT — max {MAX_MB} Mo</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED}
                className="hidden"
                onChange={(e) => { processFiles(e.target.files); e.target.value = ""; }}
              />
            </div>

            {/* Liste fichiers */}
            {documents.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                    <span className="text-base leading-none shrink-0">{fileEmoji(doc.name)}</span>
                    <span className="flex-1 text-xs text-gray-700 truncate" title={doc.name}>{doc.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0 hidden sm:block">{fmtBytes(doc.size)}</span>
                    <StatusBadge status={doc.status} errorMessage={doc.errorMessage} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeDoc(doc.id); }}
                      className="p-0.5 text-gray-300 hover:text-red-400 transition shrink-0"
                      title={`Retirer "${doc.name}"`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Statut extraction */}
            {loadingCount > 0 && (
              <p className="mt-2 text-xs text-indigo-500 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Extraction en cours ({loadingCount} fichier{loadingCount > 1 ? "s" : ""})…
              </p>
            )}
            {extractedCount > 0 && loadingCount === 0 && (
              <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" />
                {extractedCount} document{extractedCount > 1 ? "s" : ""} extrait{extractedCount > 1 ? "s" : ""} — prêt{extractedCount > 1 ? "s" : ""} pour l'analyse IA
              </p>
            )}
          </div>


        </div>
      )}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Play, X, QrCode, Sparkles, ArrowRight, ExternalLink } from "lucide-react";
import QRCodeGenerator from "./QRCodeGenerator";
import WorkshopContextCard, { AIConfigPanel } from "./WorkshopContextCard";
import { buildWorkshopContext } from "../lib/documentParser";
import { useAIConfig } from "../lib/useAIConfig";

/* ---------- Utilitaire image avec fallbacks ----------- */
function SmartImage({ sources = [], alt = "", className = "" }) {
  const [idx, setIdx] = useState(0);
  if (!sources.length) return null;
  const src = sources[Math.min(idx, sources.length - 1)];
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

const ArbreProblemePresentation = ({
  sessionId,
  onComplete,
  defaultProjectName = "",
  defaultTheme = "",
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [theme, setTheme] = useState(defaultTheme);
  // Données de la section "Contexte de l'atelier"
  const [workshopContextData, setWorkshopContextData] = useState({});
  const { config: aiCfg } = useAIConfig();
  const [aiConfigured, setAiConfigured] = useState(aiCfg.configured);

  const handleComplete = () => {
    onComplete?.({
      projectName: projectName.trim(),
      theme: theme.trim(),
      workshopContext: buildWorkshopContext({
        projectName: projectName.trim(),
        theme: theme.trim(),
        manualContext: workshopContextData.manualContext || "",
        sessionObjective: workshopContextData.sessionObjective || "",
        uploadedDocuments: workshopContextData.uploadedDocuments || [],
      }),
    });
  };

  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId || "PROBLEM-TREE-2025");
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  // Bases vers TON ancien repo
  const RAW_BASE =
    "https://raw.githubusercontent.com/Ba-Jules/new-collaborative-tools/main";
  const MEDIA_BASE =
    "https://media.githubusercontent.com/media/Ba-Jules/new-collaborative-tools/main";

  // La vidéo est suivie par Git LFS → utiliser media.githubusercontent.com en 1er
  const VIDEO_SOURCES = [
    `${MEDIA_BASE}/public/videos/Arbre-Problemes-presentation.mp4`,
    `${RAW_BASE}/public/videos/Arbre-Problemes-presentation.mp4`, // fallback
    `${MEDIA_BASE}/dist/videos/Arbre-Problemes-presentation.mp4`,
    `${RAW_BASE}/dist/videos/Arbre-Problemes-presentation.mp4`,
  ];

  // Images (non-LFS) dans public/videos d’après ta capture
  const IMG_PROBLEME_SOURCES = [
    `${RAW_BASE}/public/videos/arbre_probleme.JPG`,
    `${RAW_BASE}/dist/videos/arbre_probleme.JPG`,
  ];
  const IMG_OBJECTIFS_SOURCES = [
    `${RAW_BASE}/public/videos/arbre_objectifs_exemple.JPG`,
    `${RAW_BASE}/dist/videos/arbre_objectifs_exemple.JPG`,
  ];

  const slides = [
    {
      key: "intro",
      title: "Introduction à l'Arbre à Problèmes",
      content: (
        <div className="space-y-6">
          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold px-3.5 py-1.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              Gestion Axée sur les Résultats · Méthode GAR
            </div>
            <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-snug">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-indigo-700 to-indigo-500">
                Analysez les causes,
              </span>
              <br />
              <span className="text-slate-900">construisez des solutions</span>
            </h3>
          </div>

          {/* Feature cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="group p-5 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white hover:shadow-lg hover:border-indigo-100 hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-3.5 shadow-sm">
                <span className="text-xl leading-none">🌳</span>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1.5">Structure arborescente</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                Le <span className="font-semibold text-red-600">problème central</span> au tronc —{" "}
                <span className="font-semibold text-pink-600">causes</span> (racines) en bas,{" "}
                <span className="font-semibold text-amber-600">conséquences</span> (branches) en haut.
              </p>
            </div>

            <div className="group p-5 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white hover:shadow-lg hover:border-emerald-100 hover:-translate-y-0.5 transition-all duration-200">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-3.5 shadow-sm">
                <span className="text-xl leading-none">🎯</span>
              </div>
              <h4 className="text-base font-bold text-gray-900 mb-1.5">Du problème à l&#39;objectif</h4>
              <p className="text-sm text-gray-600 leading-relaxed">
                On cartographie causes et conséquences, puis on transforme chaque problème en{" "}
                <span className="font-semibold text-emerald-700">objectif positif et mesurable</span>.
              </p>
            </div>
          </div>

          {/* Vidéo CTA */}
          <div className="flex justify-center pt-1">
            <button
              className="group inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
              onClick={() => setShowVideo(true)}
            >
              <div className="w-7 h-7 rounded-full bg-white/15 group-hover:bg-white/25 flex items-center justify-center transition-colors">
                <Play className="w-3.5 h-3.5 fill-white text-white" />
              </div>
              Voir la vidéo explicative
              <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </button>
          </div>
        </div>
      ),
    },
    {
      key: "structure",
      title: "Anatomie de l'Arbre à Problèmes",
      content: (
        <div className="space-y-5">
          <div className="grid lg:grid-cols-5 gap-5 items-start">

            {/* ── Gauche : diagramme anatomique (2/5) ── */}
            <div className="lg:col-span-2 flex flex-col gap-1.5">

              {/* Conséquences */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-200/50">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                    <span className="text-white font-black text-base leading-none">▲</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white/70 uppercase tracking-widest leading-none">Conséquences</p>
                    <p className="text-sm font-bold text-white leading-tight mt-0.5">Effets négatifs</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Impact économique", "Exclusion sociale"].map((t) => (
                    <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/25 text-white border border-white/25">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Connecteur ↓ */}
              <div className="flex justify-center">
                <div className="flex flex-col items-center gap-0">
                  <div className="w-0.5 h-2 bg-gradient-to-b from-orange-400 to-red-500"/>
                  <ChevronDown className="w-4 h-4 text-red-400 -mt-1" />
                </div>
              </div>

              {/* Problème central */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 shadow-xl shadow-red-200/60 ring-2 ring-offset-1 ring-red-400/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 ring-1 ring-white/25">
                    <span className="text-white font-black text-lg leading-none">●</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-red-200 uppercase tracking-widest leading-none">Problème Central</p>
                    <p className="text-sm font-bold text-white leading-tight mt-0.5">Le tronc — nœud focal</p>
                  </div>
                </div>
              </div>

              {/* Connecteur ↓ */}
              <div className="flex justify-center">
                <div className="flex flex-col items-center gap-0">
                  <ChevronDown className="w-4 h-4 text-pink-400 -mb-1" />
                  <div className="w-0.5 h-2 bg-gradient-to-b from-red-500 to-pink-500"/>
                </div>
              </div>

              {/* Causes */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-200/50">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                    <span className="text-white font-black text-base leading-none">▼</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-white/70 uppercase tracking-widest leading-none">Causes</p>
                    <p className="text-sm font-bold text-white leading-tight mt-0.5">Facteurs racines</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Cause directe", "Cause profonde"].map((t) => (
                    <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/25 text-white border border-white/25">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-center text-[10px] text-gray-400 font-medium uppercase tracking-widest pt-1">
                Lecture : racines → tronc → branches
              </p>
            </div>

            {/* ── Droite : image dans chrome navigateur (3/5) ── */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-gray-50">
                <div className="bg-slate-800 px-4 py-2.5 flex items-center gap-2.5">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                  </div>
                  <span className="flex-1 text-xs text-slate-400 font-medium tracking-tight">Exemple réel · Arbre à Problèmes</span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/20">
                    Cas pratique
                  </span>
                </div>
                <SmartImage
                  sources={IMG_PROBLEME_SOURCES}
                  alt="Schéma de structure de l'Arbre à Problèmes"
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>

          {/* ── Insights ── */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/20 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                <span className="text-sm">🔗</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-bold text-gray-800">Liens causaux documentés</span>{" "}
                — chaque connexion traduit une relation cause-effet validée collectivement par le groupe.
              </p>
            </div>
            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-emerald-100 hover:bg-emerald-50/20 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors">
                <span className="text-sm">🔬</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-bold text-gray-800">Profondeur illimitée</span>{" "}
                — chaque cause peut avoir des sous-causes pour atteindre les facteurs racines fondamentaux.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "methodo",
      title: "De l'analyse au plan d'action",
      content: (
        <div className="space-y-5">

          {/* ── Pipeline 4 étapes ── */}
          <div className="relative">
            {/* Ligne de connexion (desktop uniquement) */}
            <div
              className="hidden md:block absolute top-5 h-px z-0"
              style={{ left: "calc(12.5% + 20px)", right: "calc(12.5% + 20px)", background: "linear-gradient(to right, #f9a8d4, #a78bfa, #818cf8, #6ee7b7)" }}
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative z-10">
              {[
                { n: 1, icon: "🔍", bg: "bg-pink-500",    ring: "ring-pink-100",    light: "bg-pink-50 border-pink-100",    text: "text-pink-800",    title: "Identifier",  desc: "Lister causes, problèmes et conséquences avec le groupe" },
                { n: 2, icon: "🔗", bg: "bg-violet-500",  ring: "ring-violet-100",  light: "bg-violet-50 border-violet-100",text: "text-violet-800",  title: "Connecter",   desc: "Tracer les liens causaux de bas en haut" },
                { n: 3, icon: "✦",  bg: "bg-indigo-500",  ring: "ring-indigo-100",  light: "bg-indigo-50 border-indigo-100",text: "text-indigo-800",  title: "Transformer", desc: "Chaque problème devient un objectif positif" },
                { n: 4, icon: "🎯", bg: "bg-emerald-500", ring: "ring-emerald-100", light: "bg-emerald-50 border-emerald-100",text: "text-emerald-800",title: "Planifier",   desc: "Construire les stratégies d'intervention GAR" },
              ].map((s) => (
                <div key={s.n} className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border ${s.light} text-center`}>
                  <div className={`w-10 h-10 rounded-full ${s.bg} text-white text-sm font-black flex items-center justify-center ring-4 ${s.ring} shadow-sm`}>
                    {s.n}
                  </div>
                  <span className="text-base leading-none">{s.icon}</span>
                  <p className={`text-xs font-bold ${s.text}`}>{s.title}</p>
                  <p className="text-[10px] text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Comparaison avant / après ── */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch">

            {/* Arbre à Problèmes */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">P</div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Arbre à Problèmes</p>
                <span className="ml-auto text-[10px] text-gray-400 italic font-medium">Diagnostic</span>
              </div>
              <div className="rounded-xl overflow-hidden border-2 border-red-100 shadow-lg ring-1 ring-red-50">
                <SmartImage
                  sources={IMG_PROBLEME_SOURCES}
                  alt="Arbre à problèmes"
                  className="w-full h-auto"
                />
              </div>
            </div>

            {/* Flèche de transformation */}
            <div className="hidden md:flex flex-col items-center justify-center gap-2 px-2 shrink-0">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <span className="text-white font-black text-base">⇔</span>
              </div>
              <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest text-center leading-tight">
                Trans&shy;former
              </p>
            </div>

            {/* Séparateur mobile */}
            <div className="md:hidden flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold">
                <span>⇔</span> Transformer
              </div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Arbre à Objectifs */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">O</div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Arbre à Objectifs</p>
                <span className="ml-auto text-[10px] text-gray-400 italic font-medium">Projection</span>
              </div>
              <div className="rounded-xl overflow-hidden border-2 border-emerald-100 shadow-lg ring-1 ring-emerald-50">
                <SmartImage
                  sources={IMG_OBJECTIFS_SOURCES}
                  alt="Exemple d'arbre à objectifs"
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>

          {/* ── Principe GAR ── */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 shadow-xl">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/15">
              <span className="text-white font-black text-base leading-none">⇔</span>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Principe de transformation GAR</p>
              <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                Chaque état négatif se réécrit en{" "}
                <span className="font-semibold text-white">objectif positif, réaliste et mesurable</span>
                {" "}— fondement du cadre logique d'intervention.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "session",
      title: "Démarrer la session",
      content: (
        <div className="space-y-5">
          {/* ── Bandeau Assistance IA ── */}
          <div className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-indigo-200">
            {/* Header plein gradient */}
            <div className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-6 py-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                <span className="text-2xl leading-none">🤖</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-extrabold text-white leading-tight tracking-tight">
                  Assistance IA
                </p>
                <p className="text-xs text-indigo-200 mt-0.5 leading-relaxed">
                  Analyse du contexte · Suggestion de problèmes · Reformulation automatique
                </p>
              </div>
              {aiConfigured ? (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-400/30 text-white border border-emerald-300/50 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                  Prête
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 text-indigo-100 border border-white/25">
                  <span className="w-2 h-2 rounded-full bg-amber-300" />
                  Non configurée
                </span>
              )}
            </div>
            {/* Corps formulaire */}
            <div className="bg-white px-6 py-5">
              <AIConfigPanel
                onConfigured={(next) => setAiConfigured(!!next?.configured)}
              />
            </div>
          </div>

          {/* ── Ligne 1 : paramètres + QR ── */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Paramètres de l’atelier */}
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <h4 className="text-base font-bold text-gray-900 mb-3">
                Paramètres de l’atelier
              </h4>
              <div className="space-y-3">
                <label className="block">
                  <span className="block text-sm font-medium text-gray-700">
                    Nom du projet
                  </span>
                  <input
                    type="text"
                    name="projectName"
                    id="projectName"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Ex : Transformation digitale CDS"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-gray-700">
                    Thème
                  </span>
                  <input
                    type="text"
                    name="theme"
                    id="theme"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="Ex : Qualité des données clients"
                  />
                </label>

                <p className="text-xs text-gray-400">
                  Modifiables à tout moment depuis l’en-tête de l’atelier.
                </p>
              </div>
            </div>

            {/* QR code participants */}
            <div className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <QrCode className="w-4 h-4 text-gray-600" />
                <h4 className="text-base font-bold text-gray-900">
                  Connexion des participants
                </h4>
              </div>

              <div className="flex items-start gap-4">
                <div className="shrink-0">
                  <QRCodeGenerator url={participantUrl} />
                </div>
                <div className="text-xs text-gray-600 leading-relaxed space-y-2">
                  <p>
                    Demandez aux participants de{" "}
                    <strong>scanner</strong> ce QR code pour rejoindre
                    l’atelier en mode <em>participant</em>.
                  </p>
                  {/* Avertissement localhost */}
                  {(participantUrl.includes("localhost") || participantUrl.includes("127.0.0.1")) && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-700">
                      <span className="shrink-0 font-bold">&#9888;</span>
                      <span>
                        URL locale détectée ! Les participants ne pourront pas scanner ce QR depuis leurs appareils.
                        Déployez l’application ou utilisez votre IP locale : <strong>http://[votre-ip]:5173</strong>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={participantUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-colors font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Tester le lien participant
                    </a>
                  </div>
                  <p className="break-all font-mono text-gray-400 text-[10px] leading-relaxed">
                    {participantUrl}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Contexte de l’atelier ── */}
          <WorkshopContextCard onChange={setWorkshopContextData} />




        </div>
      ),
    },
  ];

  const total = slides.length;
  const progress = ((currentSlide + 1) / total) * 100;

  const isLastSlide = currentSlide === total - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-indigo-50 flex items-start justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl">

        {/* ── Watermark titre ── */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow">
            <span className="text-lg leading-none">🌳</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Arbre à Problèmes</p>
            <p className="text-xs text-gray-400">Outil d'analyse causale et stratégique · GAR</p>
          </div>
          {/* Indicateurs de slides */}
          <div className="ml-auto flex items-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setCurrentSlide(i)}
                className={[
                  "rounded-full transition-all duration-200",
                  i === currentSlide
                    ? "w-6 h-2 bg-indigo-600"
                    : "w-2 h-2 bg-gray-300 hover:bg-gray-400",
                ].join(" ")}
                title={s.title}
              />
            ))}
          </div>
        </div>

        {/* ── Carte principale ── */}
        <div className="bg-white rounded-3xl shadow-xl ring-1 ring-gray-100 overflow-hidden">

          {/* Bandeau de progression */}
          <div className="h-1.5 bg-gray-100">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
              aria-hidden="true"
            />
          </div>

          <div className="p-6 md:p-10">
            {/* En-tête du slide */}
            <div className="flex items-start justify-between mb-6 md:mb-8 gap-4">
              <div>
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-black flex items-center justify-center">
                    {currentSlide + 1}
                  </span>
                  Étape {currentSlide + 1} sur {total}
                </p>
                <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 leading-tight">
                  {slides[currentSlide].title}
                </h2>
              </div>
            </div>

            {/* Corps du slide */}
            <div className={[
              "min-h-[380px]",
              slides[currentSlide].key === "session"
                ? "max-h-[62vh] overflow-y-auto pr-1 scrollbar-thin"
                : "md:min-h-[480px]",
            ].join(" ")}>
              {slides[currentSlide].content}
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                onClick={() => setCurrentSlide((c) => Math.max(0, c - 1))}
                disabled={currentSlide === 0}
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>

              <span className="text-xs font-medium text-gray-400">
                {currentSlide + 1} / {total}
              </span>

              {isLastSlide ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-700 hover:to-emerald-700 text-sm font-bold text-white transition-all shadow-md hover:shadow-lg"
                  onClick={handleComplete}
                >
                  Démarrer l'atelier
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  onClick={() => setCurrentSlide((c) => Math.min(total - 1, c + 1))}
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

        {/* ── Modale vidéo ── */}
        {showVideo && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl overflow-hidden w-full max-w-4xl relative shadow-2xl">
              <button
                type="button"
                className="absolute top-4 right-4 z-[60] p-2 bg-white/90 rounded-full hover:bg-gray-100 shadow-sm transition"
                onClick={() => setShowVideo(false)}
                aria-label="Fermer la vidéo"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
              <div className="p-5 md:p-7">
                <div className="aspect-video bg-gray-100 rounded-xl overflow-hidden">
                  <video className="w-full h-full" controls playsInline preload="metadata" crossOrigin="anonymous">
                    {VIDEO_SOURCES.map((src) => (
                      <source key={src} src={src} type="video/mp4" />
                    ))}
                  </video>
                </div>
                <div className="mt-3 text-sm text-gray-500 text-center">
                  <a href={VIDEO_SOURCES[0]} target="_blank" rel="noreferrer" className="underline hover:text-gray-700">
                    Ouvrir la vidéo dans un nouvel onglet
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

    </div>
  );
};

export default ArbreProblemePresentation;

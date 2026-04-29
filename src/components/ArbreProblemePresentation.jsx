import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X, QrCode, Sparkles, ArrowRight, ExternalLink } from "lucide-react";
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
      title: "Structure de l'Arbre à Problèmes",
      content: (
        <div className="space-y-5">
          {/* Visual layer labels */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
              ↑ Conséquences
            </span>
            <span className="text-gray-300 font-bold text-lg">·</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
              ● Problème central
            </span>
            <span className="text-gray-300 font-bold text-lg">·</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-pink-100 text-pink-700 border border-pink-200">
              ↓ Causes
            </span>
          </div>

          {/* Image */}
          <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-md ring-1 ring-gray-50">
            <SmartImage
              sources={IMG_PROBLEME_SOURCES}
              alt="Schéma de structure de l'Arbre à Problèmes"
              className="w-full h-auto"
            />
          </div>

          {/* Caption */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-2xl leading-none shrink-0">💡</span>
            <p className="text-sm text-gray-700 leading-relaxed">
              Chaque cause et conséquence peut avoir des{" "}
              <span className="font-semibold text-indigo-700">sous-niveaux</span> pour une analyse progressive et hiérarchisée.
              La profondeur de l&#39;arbre reflète la complexité du problème.
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "methodo",
      title: "Méthodologie d'analyse & projection en objectifs",
      content: (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Colonne gauche : Explorer les causes */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-sm">
                <span className="text-sm leading-none">🔍</span>
              </div>
              <h4 className="text-lg font-bold text-gray-900">Explorer les causes</h4>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3 p-3.5 rounded-xl bg-pink-50 border border-pink-100">
                <span className="w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">Partir du bas</p>
                  <p className="text-xs text-gray-600 mt-0.5">Identifiez les causes racines avec le groupe.</p>
                </div>
              </div>
              <div className="flex gap-3 p-3.5 rounded-xl bg-pink-50 border border-pink-100">
                <span className="w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">Valider collectivement</p>
                  <p className="text-xs text-gray-600 mt-0.5">Confirmez chaque cause par le débat et les évidence.</p>
                </div>
              </div>
              <div className="flex gap-3 p-3.5 rounded-xl bg-pink-50 border border-pink-100">
                <span className="w-6 h-6 rounded-full bg-pink-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">Remonter vers le tronc</p>
                  <p className="text-xs text-gray-600 mt-0.5">Connectez les éléments pour révéler la logique causale.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite : Transformer en objectifs */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                <span className="text-sm leading-none">🎯</span>
              </div>
              <h4 className="text-lg font-bold text-gray-900">Transformer en objectifs</h4>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
              <SmartImage
                sources={IMG_OBJECTIFS_SOURCES}
                alt="Exemple d'arbre à objectifs"
                className="w-full h-auto"
              />
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-lg leading-none shrink-0">⇔</span>
              <p className="text-sm text-gray-700 leading-relaxed">
                Chaque problème se reformule en{" "}
                <span className="font-semibold text-emerald-700">objectif positif, réaliste et mesurable</span> :
                la base de l&#39;arbre à objectifs.
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

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X, QrCode } from "lucide-react";
import QRCodeGenerator from "./QRCodeGenerator";

/* ---------- Utilitaire image avec fallbacks ----------- */
function SmartImage({ sources = [], alt = "", className = "" }) {
  const [idx, setIdx] = useState(0);
  if (!sources.length) return null;
  const src = sources[Math.min(idx, sources.length - 1)];
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
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

  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId || "PROBLEM-TREE-2025");
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  // Base vers TON ancien repo
  const RAW_BASE =
    "https://raw.githubusercontent.com/Ba-Jules/new-collaborative-tools/main";

  // Fallbacks probables vus dans tes captures (public/ ET dist/)
  const VIDEO_SOURCES = [
    `${RAW_BASE}/public/videos/Arbre-Problemes-presentation.mp4`,
    `${RAW_BASE}/dist/videos/Arbre-Problemes-presentation.mp4`,
  ];
  const IMG_PROBLEME_SOURCES = [
    `${RAW_BASE}/public/arbre_probleme.JPG`,
    `${RAW_BASE}/dist/arbre_probleme.JPG`,
    `${RAW_BASE}/public/images/arbre_probleme.JPG`,
  ];
  const IMG_OBJECTIFS_SOURCES = [
    `${RAW_BASE}/public/arbre_objectifs_exemple.JPG`,
    `${RAW_BASE}/dist/arbre_objectifs_exemple.JPG`,
    `${RAW_BASE}/public/images/arbre_objectifs_exemple.JPG`,
  ];

  const slides = [
    {
      key: "intro",
      title: "Introduction à l'Arbre à Problèmes",
      content: (
        <div className="space-y-8">
          <h3 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 text-center">
            Un outil d’analyse causale et stratégique
          </h3>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-gray-200 bg-white shadow-sm">
              <h4 className="text-lg font-bold text-gray-900 mb-2">
                Structure arborescente
              </h4>
              <p className="text-gray-700 leading-relaxed">
                Le <strong>problème central</strong> est au tronc ; les
                <strong> causes</strong> (racines) en bas, et les
                <strong> conséquences</strong> (branches) en haut.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-gray-200 bg-white shadow-sm">
              <h4 className="text-lg font-bold text-gray-900 mb-2">
                Du problème à l’objectif
              </h4>
              <p className="text-gray-700 leading-relaxed">
                On part du problème central pour cartographier causes et
                conséquences. Ensuite, on transforme l’arbre à problèmes en{" "}
                <strong>arbre à objectifs</strong>.
              </p>
            </div>
          </div>

          {/* Unique bouton vidéo */}
          <div className="flex justify-center">
            <button
              className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50"
              onClick={() => setShowVideo(true)}
            >
              <Play className="w-5 h-5 mr-2" />
              Voir la vidéo explicative
            </button>
          </div>
        </div>
      ),
    },
    {
      key: "structure",
      title: "Structure de l'Arbre à Problèmes",
      content: (
        <div className="space-y-6">
          <p className="text-center text-gray-800 font-medium">
            Logique racines (causes) → tronc (problème) → branches
            (conséquences)
          </p>

          <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
            <SmartImage
              sources={IMG_PROBLEME_SOURCES}
              alt="Schéma de structure de l'Arbre à Problèmes"
              className="w-full h-auto"
            />
          </div>

          <p className="text-gray-700 leading-relaxed">
            Chaque cause et conséquence peut avoir des sous-niveaux pour une
            analyse progressive et hiérarchisée.
          </p>
        </div>
      ),
    },
    {
      key: "methodo",
      title: "Méthodologie d'analyse & projection en objectifs",
      content: (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4 p-6 rounded-xl border border-gray-200 bg-white shadow-sm">
            <h4 className="text-xl font-bold text-gray-900">
              Explorer les causes
            </h4>
            <p className="text-gray-700 leading-relaxed">
              Partez du bas : identifiez les causes racines, validez-les avec
              le groupe puis remontez vers le problème central.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Connectez les éléments de proche en proche pour garder une
              logique causale simple et visuelle.
            </p>
          </div>

          <div className="space-y-4 p-6 rounded-xl border border-gray-200 bg-white shadow-sm">
            <h4 className="text-xl font-bold text-gray-900">
              Transformer en objectifs
            </h4>
            <p className="text-gray-700 leading-relaxed">
              Chaque problème se reformule en objectif positif, réaliste et
              mesurable : c’est la base de l’<em>arbre à objectifs</em>.
            </p>
            <div className="rounded-lg overflow-hidden border border-gray-200">
              <SmartImage
                sources={IMG_OBJECTIFS_SOURCES}
                alt="Exemple d'arbre à objectifs"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "session",
      title: "Démarrer la session",
      content: (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Formulaire Projet / Thème */}
          <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
            <h4 className="text-xl font-bold text-gray-900 mb-4">
              Paramètres de l'atelier
            </h4>
            <div className="space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700">
                  Nom du projet
                </span>
                <input
                  type="text"
                  name="projectName"
                  id="projectName"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
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
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Ex : Qualité des données clients"
                />
              </label>

              <button
                className="mt-3 inline-flex items-center justify-center w-full rounded-lg bg-gray-900 hover:bg-black text-white font-semibold px-4 py-2"
                onClick={() =>
                  onComplete?.({
                    projectName: projectName.trim(),
                    theme: theme.trim(),
                  })
                }
              >
                Démarrer l’atelier
              </button>

              <p className="text-xs text-gray-500">
                Vous pourrez toujours modifier Projet/Thème dans l’entête
                ensuite.
              </p>
            </div>
          </div>

          {/* QR persistant */}
          <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-gray-700" />
              <h4 className="text-xl font-bold text-gray-900">
                Connexion des participants
              </h4>
            </div>

            <div className="flex items-start gap-6">
              <div className="shrink-0">
                <QRCodeGenerator url={participantUrl} />
              </div>
              <div className="text-sm text-gray-700 leading-relaxed">
                <p className="mb-2">
                  Demandez aux participants de <strong>scanner</strong> ce QR
                  code pour rejoindre l’atelier en mode <em>participant</em>.
                </p>
                <p className="break-all">
                  Lien direct :{" "}
                  <span className="font-mono">{participantUrl}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const total = slides.length;
  const progress = ((currentSlide + 1) / total) * 100;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-gray-100 overflow-hidden">
        <div className="p-5 md:p-8">
          {/* En-tête : on ne garde PAS le bouton vidéo ici */}
          <div className="flex justify-between items-center mb-6 md:mb-8">
            <h2 className="text-2xl md:text-4xl font-black tracking-tight text-gray-900">
              {slides[currentSlide].title}
            </h2>
            <div />
          </div>

          {/* Barre de progression */}
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-gray-900 transition-all"
              style={{ width: `${progress}%` }}
              aria-hidden="true"
            />
          </div>

          {/* Corps de slide */}
          <div className="min-h-[420px] md:min-h-[560px]">
            {slides[currentSlide].content}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8">
            <button
              className="inline-flex items-center px-4 md:px-6 py-2 md:py-3 border border-gray-300 rounded-lg text-sm font-semibold bg-white disabled:text-gray-400 disabled:cursor-not-allowed enabled:text-gray-800 enabled:hover:bg-gray-50"
              onClick={() => setCurrentSlide((c) => Math.max(0, c - 1))}
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="w-5 h-5 mr-2" />
              Précédent
            </button>

            <span className="text-sm font-medium text-gray-500">
              {currentSlide + 1} / {total}
            </span>

            <button
              className="inline-flex items-center px-4 md:px-6 py-2 md:py-3 border border-gray-300 rounded-lg text-sm font-semibold bg-white disabled:text-gray-400 disabled:cursor-not-allowed enabled:text-gray-800 enabled:hover:bg-gray-50"
              onClick={() =>
                setCurrentSlide((c) => Math.min(total - 1, c + 1))
              }
              disabled={currentSlide === total - 1}
            >
              Suivant
              <ChevronRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        </div>
      </div>

      {/* Modale vidéo */}
      {showVideo && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl overflow-hidden w-full max-w-4xl relative shadow-2xl">
            <button
              className="absolute top-4 right-4 z-[60] p-2 bg-white rounded-full hover:bg-gray-100 shadow"
              onClick={() => setShowVideo(false)}
              aria-label="Fermer la vidéo"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
            <div className="p-4 md:p-6">
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <video
                  className="w-full h-full"
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  crossOrigin="anonymous"
                >
                  {/* Le navigateur essaiera chaque source dans l'ordre */}
                  {VIDEO_SOURCES.map((src) => (
                    <source key={src} src={src} type="video/mp4" />
                  ))}
                </video>
              </div>

              {/* Lien direct (secours) */}
              <div className="mt-3 text-sm text-gray-600 text-center">
                <a
                  href={VIDEO_SOURCES[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
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

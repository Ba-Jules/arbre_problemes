import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X, QrCode } from "lucide-react";
import QRCodeGenerator from "../QRCodeGenerator";

/**
 * Présentation + onboarding de l'Arbre à Problèmes
 * - Slides pédagogiques
 * - Saisie Projet / Thème
 * - QR code persistant pour que les participants rejoignent
 *
 * Props:
 *  - sessionId: string (obligatoire)
 *  - onComplete: ({projectName, theme}) => void  // appelé quand on clique "Démarrer l'atelier"
 *  - defaultProjectName?: string
 *  - defaultTheme?: string
 */
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

  // URL participant (mode=participant) sur le même origin que la page
  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId || "PROBLEM-TREE-2025");
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  const slides = [
    {
      key: "intro",
      title: "Introduction à l'Arbre à Problèmes",
      content: (
        <div className="space-y-8">
          <h3 className="text-2xl md:text-3xl font-bold text-blue-800 text-center mb-4">
            Un outil d'analyse causale et stratégique
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-5 bg-gradient-to-br from-blue-50 to-white rounded-lg shadow">
              <h4 className="text-lg font-bold text-blue-800 mb-2">Structure arborescente</h4>
              <p className="text-gray-700 leading-relaxed">
                Le <span className="font-semibold">problème central</span> est au tronc ; les
                <span className="font-semibold"> causes</span> (racines) en bas, et les
                <span className="font-semibold"> conséquences</span> (branches) en haut.
              </p>
            </div>
            <div className="p-5 bg-gradient-to-br from-blue-50 to-white rounded-lg shadow">
              <h4 className="text-lg font-bold text-blue-800 mb-2">Du problème à l’objectif</h4>
              <p className="text-gray-700 leading-relaxed">
                On part du problème central pour cartographier causes et conséquences. Ensuite, on peut transformer
                l’arbre à problèmes en <span className="font-semibold">arbre à objectifs</span>.
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <button
              className="inline-flex items-center px-4 py-2 rounded-lg border border-blue-300 text-sm font-medium text-blue-700 bg-white hover:bg-blue-50"
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
          <div className="text-center text-blue-800 font-semibold">
            Comprendre la logique racines (causes) → tronc (problème) → branches (conséquences)
          </div>
          <div className="rounded-lg overflow-hidden shadow bg-white">
            <img
              src="/videos/arbre_probleme.JPG"
              alt="Structure de l'Arbre à Problèmes"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
          <p className="text-gray-700 leading-relaxed">
            Chaque cause et conséquence peut avoir des sous-niveaux, pour une analyse progressive et hiérarchisée.
          </p>
        </div>
      ),
    },
    {
      key: "methodo",
      title: "Méthodologie d'Analyse",
      content: (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-gradient-to-r from-blue-50 to-white rounded-lg shadow">
            <h4 className="text-xl font-bold text-blue-800 mb-3">Explorer les causes</h4>
            <p className="text-gray-700 leading-relaxed">
              Partez du bas : quelles sont les causes racines ? Validez-les avec le groupe, puis remontez.
            </p>
          </div>
          <div className="p-6 bg-gradient-to-r from-blue-50 to-white rounded-lg shadow">
            <h4 className="text-xl font-bold text-blue-800 mb-3">Transformer en objectifs</h4>
            <p className="text-gray-700 leading-relaxed">
              Chaque problème peut devenir un objectif formulé positivement, réaliste et mesurable.
            </p>
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
          <div className="p-6 bg-white rounded-xl shadow">
            <h4 className="text-xl font-bold text-gray-900 mb-4">Paramètres de l'atelier</h4>
            <div className="space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-gray-700">Nom du projet</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ex : Transformation digitale CDS"
                />
              </label>
              <label className="block">
                <span className="block text-sm font-medium text-gray-700">Thème</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Ex : Qualité des données clients"
                />
              </label>

              <button
                className="mt-3 inline-flex items-center justify-center w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2"
                onClick={() => onComplete?.({ projectName: projectName.trim(), theme: theme.trim() })}
              >
                Démarrer l’atelier
              </button>

              <p className="text-xs text-gray-500">
                Vous pourrez toujours modifier Projet/Thème dans l’entête par la suite.
              </p>
            </div>
          </div>

          {/* QR persistant */}
          <div className="p-6 bg-white rounded-xl shadow">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-gray-700" />
              <h4 className="text-xl font-bold text-gray-900">Connexion des participants</h4>
            </div>
            <div className="flex items-start gap-6">
              <div className="shrink-0">
                <QRCodeGenerator url={participantUrl} />
              </div>
              <div className="text-sm text-gray-700 leading-relaxed">
                <p className="mb-2">
                  Demandez aux participants de **scanner** ce QR code pour rejoindre l’atelier en mode *participant*.
                </p>
                <p className="break-all">
                  Lien direct : <span className="font-mono">{participantUrl}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 md:p-8">
          <div className="flex justify-between items-center mb-6 md:mb-10">
            <h2 className="text-2xl md:text-4xl font-bold text-gray-900">
              {slides[currentSlide].title}
            </h2>
            <button
              className="inline-flex items-center px-3 md:px-6 py-2 md:py-3 border border-blue-300 rounded-lg text-sm font-medium text-blue-700 bg-white hover:bg-blue-50"
              onClick={() => setShowVideo(true)}
            >
              <Play className="w-5 h-5 mr-2" />
              Vidéo
            </button>
          </div>

          <div className="min-h-[420px] md:min-h-[560px] relative">
            {slides[currentSlide].content}
          </div>

          <div className="flex justify-between items-center mt-8">
            <button
              className="inline-flex items-center px-4 md:px-6 py-2 md:py-3 border border-gray-300 rounded-lg text-sm font-medium bg-white disabled:text-gray-400 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-gray-50"
              onClick={() => setCurrentSlide((c) => Math.max(0, c - 1))}
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="w-5 h-5 mr-2" />
              Précédent
            </button>

            <span className="text-sm font-medium text-gray-500">{currentSlide + 1} / {slides.length}</span>

            <button
              className="inline-flex items-center px-4 md:px-6 py-2 md:py-3 border border-gray-300 rounded-lg text-sm font-medium bg-white disabled:text-gray-400 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-gray-50"
              onClick={() => setCurrentSlide((c) => Math.min(slides.length - 1, c + 1))}
              disabled={currentSlide === slides.length - 1}
            >
              Suivant
              <ChevronRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        </div>
      </div>

      {showVideo && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl overflow-hidden w-full max-w-4xl relative">
            <button
              className="absolute top-4 right-4 z-[60] p-2 bg-white rounded-full hover:bg-gray-100 shadow"
              onClick={() => setShowVideo(false)}
              aria-label="Fermer la vidéo"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
            <div className="p-4 md:p-6">
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <video className="w-full h-full" controls autoPlay>
                  <source src="/videos/Arbre-Problemes-presentation.mp4" type="video/mp4" />
                  Votre navigateur ne supporte pas la lecture de vidéos.
                </video>
              </div>
              <div className="mt-3 text-sm text-gray-500 text-center">
                Présentation détaillée de l'Arbre à Problèmes
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArbreProblemePresentation;

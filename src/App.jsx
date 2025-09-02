// src/App.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase-config";

import QRCodeGenerator from "./components/QRCodeGenerator.jsx";
import AnalysisPanel from "./components/AnalysisPanel.jsx";
import ArbreProblemePresentation from "./components/ArbreProblemePresentation.jsx";

/* ========================= Constantes UI ========================= */

const POSTIT_W = 220;
const POSTIT_H = 90;
const MAX_CHARS = 50;

const COLOR_PALETTE = {
  red: { bg: "#ef4444", text: "#ffffff", border: "#dc2626" },
  pink: { bg: "#fb7185", text: "#ffffff", border: "#f43f5e" },
  green: { bg: "#22c55e", text: "#ffffff", border: "#16a34a" },
  teal: { bg: "#14b8a6", text: "#ffffff", border: "#0d9488" },
  blue: { bg: "#3b82f6", text: "#ffffff", border: "#2563eb" },
  amber: { bg: "#f59e0b", text: "#111827", border: "#d97706" },
};

const CATEGORY_DEFAULT_COLOR = {
  problem: "red",
  causes: "pink",
  consequences: "green",
};

const CATEGORY_LABELS = {
  problem: "Problèmes",
  causes: "Causes",
  consequences: "Conséquences",
};

const defaultPanelStates = {
  causes: "normal",
  tree: "normal",
  consequences: "normal",
  problems: "normal",
};

/* ========================= App ========================= */

export default function App() {
  /* -------- Mode & session -------- */
  const [mode, setMode] = useState("moderator"); // "moderator" | "participant"
  const [sessionId, setSessionId] = useState("PROBLEM-TREE-2025");

  /* -------- Données Firestore -------- */
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]);

  /* -------- UI state -------- */
  const [panelStates, setPanelStates] = useState(defaultPanelStates);
  const [zoom, setZoom] = useState(1);
  const treeScrollRef = useRef(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState(null);

  const [paintMode, setPaintMode] = useState(false);

  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const [activeColor, setActiveColor] = useState("red");

  const [projectName, setProjectName] = useState("");
  const [theme, setTheme] = useState("");

  const [showQR, setShowQR] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const [showPresentation, setShowPresentation] = useState(false);

  /* -------- Participant -------- */
  const [participantName, setParticipantName] = useState(
    () => localStorage.getItem("participantName") || ""
  );
  const [isAnonymous, setIsAnonymous] = useState(
    () => (localStorage.getItem("participantName") || "") === "Anonyme"
  );
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");

  /* -------- Layout “Focus” -------- */
  const [layoutMode, setLayoutMode] = useState("classic"); // 'classic' | 'focus'
  const [dockPosition, setDockPosition] = useState("right"); // 'right' | 'bottom'

  /* -------- Analyse autonome (via URL) -------- */
  const [standaloneAnalysis, setStandaloneAnalysis] = useState(false);

  /* -------- Refs -------- */
  const treeAreaRef = useRef(null);

  /* ===== Helpers URL/Vue ===== */
  const computeFlagsFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const a = params.get("analysis");
    return {
      mode: m === "participant" ? "participant" : "moderator",
      isAnalysis: a === "1" || m === "analysis",
      session: params.get("session"),
    };
  };

  const syncViewFromUrl = useCallback(() => {
    const { mode: m, isAnalysis, session } = computeFlagsFromUrl();
    setMode(m);
    setStandaloneAnalysis(!!isAnalysis);
    if (session) setSessionId(session);
  }, []);

  useEffect(() => {
    // 1) Charge les flags au démarrage
    syncViewFromUrl();

    // 2) Se resynchronise sur navigation arrière/avant
    const onPop = () => syncViewFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncViewFromUrl]);

  const generateSessionId = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `PROBLEM-TREE-${d.getFullYear()}${p(d.getMonth() + 1)}${p(
      d.getDate()
    )}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  const navigateToSession = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    // purge explicitement les flags d'analyse/mode
    url.searchParams.delete("analysis");
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.toString());
    setSessionId(id);
    // re-synchroniser la vue
    syncViewFromUrl();
  };

  const newSession = async () => {
    const id = generateSessionId();
    navigateToSession(id);
    setPostIts([]);
    setConnections([]);
    setProjectName("");
    setTheme("");
    setShowAnalysis(false);
    setShowQR(false);
    setIsConnecting(false);
    setConnectSourceId(null);
    setPaintMode(false);
    setShowPresentation(true);

    try {
      await setDoc(
        doc(db, "sessions", id),
        { sessionId: id, createdAt: serverTimestamp(), status: "active" },
        { merge: true }
      );
    } catch {
      /* no-op */
    }
  };

  /* -------- URL participant (toujours sans analysis) -------- */
  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    url.searchParams.set("mode", "participant");
    url.searchParams.delete("analysis");
    return url.toString();
  }, [sessionId]);

  /* ========================= Charger métadonnées session ========================= */

  useEffect(() => {
    if (!sessionId) return;
    const ref = doc(db, "sessions", sessionId);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProjectName(data.projectName || "");
          setTheme(data.theme || "");
          if (mode !== "participant" && !(data.projectName || data.theme)) {
            setShowPresentation(true);
          }
        } else {
          if (mode !== "participant") setShowPresentation(true);
        }
      })
      .catch(() => {});
  }, [sessionId, mode]);

  /* ========================= Firestore listeners ========================= */

  useEffect(() => {
    if (!sessionId) return;

    const qP = query(
      collection(db, "postits"),
      where("sessionId", "==", sessionId)
    );
    const unsubP = onSnapshot(qP, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      arr.sort(
        (a, b) =>
          (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0)
      );
      setPostIts(arr);
    });

    const qC = query(
      collection(db, "connections"),
      where("sessionId", "==", sessionId)
    );
    const unsubC = onSnapshot(qC, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setConnections(arr);
    });

    return () => {
      unsubP();
      unsubC();
    };
  }, [sessionId]);

  /* ========================= CRUD Post-its ========================= */

  const addPostItToFirebase = async (
    content,
    category,
    author,
    x = null,
    y = null,
    isInTree = false,
    colorName = null
  ) => {
    const clean = (content || "").trim();
    if (!clean) return;

    const defaults = {
      causes: { x: 40, y: Math.random() * 120 + 50 },
      consequences: { x: 860, y: Math.random() * 120 + 50 },
      problem: { x: 420, y: Math.random() * 120 + 50 },
    };
    const pos =
      x !== null && y !== null ? { x, y } : defaults[category] || defaults.problem;

    const applyColor =
      colorName ||
      CATEGORY_DEFAULT_COLOR[category] ||
      activeColor ||
      "red";

    const ref = await addDoc(collection(db, "postits"), {
      sessionId,
      content: clean.slice(0, MAX_CHARS),
      author,
      category,
      x: pos.x,
      y: pos.y,
      isInTree,
      isCentral: false,
      color: applyColor,
      childIds: [],
      timestamp: serverTimestamp(),
    });

    return ref.id;
  };

  const updatePostItInFirebase = async (id, fields) => {
    try {
      await updateDoc(doc(db, "postits", id), fields);
    } catch (e) {
      console.error(e);
    }
  };

  const deletePostItFromFirebase = async (id) => {
    try {
      await deleteDoc(doc(db, "postits", id));
      const rel = connections.filter(
        (c) => c.fromId === id || c.toId === id
      );
      await Promise.all(
        rel.map((c) => deleteDoc(doc(db, "connections", c.id)))
      );
    } catch (e) {
      console.error(e);
    }
  };

  /* ====== Création via “+ haut / + bas” ====== */
  const createLinkedPostIt = async (p, direction /* 'up' | 'down' */) => {
    try {
      const gap = 30;

      let newCat = p.category;
      if (p.category === "problem") {
        newCat = direction === "up" ? "causes" : "consequences";
      }

      const newColor =
        CATEGORY_DEFAULT_COLOR[newCat] || p.color || activeColor || "red";

      let newX = p.x;
      let newY =
        direction === "up"
          ? Math.max(10, p.y - POSTIT_H - gap)
          : p.y + POSTIT_H + gap;

      const newId = await addPostItToFirebase(
        "Nouvelle étiquette",
        newCat,
        "Modérateur",
        newX,
        newY,
        true,
        newColor
      );

      if (!newId) return;

      const fromId = direction === "up" ? newId : p.id;
      const toId = direction === "up" ? p.id : newId;

      await addDoc(collection(db, "connections"), {
        sessionId,
        fromId,
        toId,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("Impossible de créer l’étiquette liée.");
    }
  };

  /* ========================= Drag & Drop / Click handlers ========================= */

  const handleMouseDown = (e, postItId) => {
    if (mode !== "moderator") return;
    e.preventDefault();

    if (paintMode) {
      updatePostItInFirebase(postItId, {
        color: activeColor,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (isConnecting) {
      if (!connectSourceId) {
        setConnectSourceId(postItId);
      } else if (connectSourceId !== postItId) {
        addDoc(collection(db, "connections"), {
          sessionId,
          fromId: connectSourceId,
          toId: postItId,
          createdAt: serverTimestamp(),
        }).catch(console.error);
        setConnectSourceId(null);
      } else {
        setConnectSourceId(null);
      }
      return;
    }

    setSelectedPostIt(postItId);
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !selectedPostIt) return;
      const area = treeAreaRef.current;
      if (!area) return;

      const rect = area.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / zoom;
      const relY = (e.clientY - rect.top) / zoom;

      const newX = Math.max(
        0,
        Math.min(rect.width / zoom - POSTIT_W, relX - dragOffset.x)
      );
      const newY = Math.max(
        0,
        Math.min(rect.height / zoom - POSTIT_H, relY - dragOffset.y)
      );

      setPostIts((prev) =>
        prev.map((p) =>
          p.id === selectedPostIt ? { ...p, x: newX, y: newY, isInTree: true } : p
        )
      );
      updatePostItInFirebase(selectedPostIt, {
        x: newX,
        y: newY,
        isInTree: true,
      });
    },
    [isDragging, selectedPostIt, dragOffset.x, dragOffset.y, zoom]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
    setSelectedPostIt(null);
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove]);

  /* ========================= Édition ========================= */

  const startEditing = (p) => {
    if (mode !== "moderator") return;
    setEditingId(p.id);
    setEditingText(p.content || "");
  };
  const cancelEditing = () => {
    setEditingId(null);
    setEditingText("");
  };
  const saveEditing = async () => {
    if (!editingId) return;
    await updatePostItInFirebase(editingId, {
      content: (editingText || "").slice(0, MAX_CHARS),
    });
    cancelEditing();
  };

  /* ========================= Connexions (SVG) ========================= */

  const renderConnections = () => {
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    const lines = [];

    connections.forEach((c) => {
      const a = byId[c.fromId];
      const b = byId[c.toId];
      if (!a || !b) return;
      lines.push({ from: a, to: b });
    });

    return lines.map((ln, i) => {
      const x1 = (ln.from.x || 0) + POSTIT_W / 2;
      const y1 = (ln.from.y || 0) + POSTIT_H / 2;
      const x2 = (ln.to.x || 0) + POSTIT_W / 2;
      const y2 = (ln.to.y || 0) + POSTIT_H / 2;

      const midY = y1 + (y2 - y1) / 2;
      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

      return (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#0f172a"
          strokeWidth="3"
          markerEnd="url(#arrowhead)"
          opacity="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });
  };

  /* ========================= Panneaux ========================= */

  const setPanelState = (panel, state) => {
    setPanelStates((prev) => ({ ...prev, [panel]: state }));
  };
  const minimizePanel = (panel) => setPanelState(panel, "minimized");
  const maximizePanel = (panel) =>
    setPanelStates({
      causes: panel === "causes" ? "maximized" : "minimized",
      tree: panel === "tree" ? "maximized" : "minimized",
      consequences: panel === "consequences" ? "maximized" : "minimized",
      problems: panel === "problems" ? "maximized" : "minimized",
    });
  const restorePanels = () => setPanelStates(defaultPanelStates);

  const getPanelClasses = (panel, base) => {
    const st = panelStates[panel];
    if (st === "maximized") return "col-span-12 row-span-12 z-40";
    if (st === "minimized") return "col-span-2 row-span-2 min-h-[40px]";
    return base;
  };

  const PanelHeader = ({ title, panel, onAdd }) => {
    const st = panelStates[panel];
    return (
      <div className="flex items-center justify-between p-2 border-b bg-white/70 backdrop-blur-sm">
        <div className="font-semibold text-sm text-slate-700">
          {st === "minimized" ? title.split(" ")[0] : title}
        </div>
        <div className="flex items-center gap-2">
          {st !== "minimized" && onAdd && (
            <button
              onClick={onAdd}
              className="w-6 h-6 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
              title="Ajouter un post-it"
            >
              +
            </button>
          )}
          <button
            onClick={() => minimizePanel(panel)}
            className="w-6 h-6 rounded bg-slate-200 text-slate-600 text-xs"
            title="Réduire"
          >
            –
          </button>
          <button
            onClick={() =>
              panelStates[panel] === "maximized"
                ? restorePanels()
                : maximizePanel(panel)
            }
            className="w-6 h-6 rounded bg-slate-200 text-slate-600 text-xs"
            title={
              panelStates[panel] === "maximized" ? "Restaurer" : "Agrandir"
            }
          >
            □
          </button>
        </div>
      </div>
    );
  };

  /* ========================= Rendu Post-it ========================= */

  const renderPostIt = (p) => {
    const color = COLOR_PALETTE[p.color] || COLOR_PALETTE.red;
    const isSource = isConnecting && connectSourceId === p.id;

    return (
      <div
        key={p.id}
        className={`absolute select-none transition-transform ${
          isConnecting ? "cursor-pointer" : paintMode ? "cursor-crosshair" : "cursor-move"
        } ${isSource ? "ring-4 ring-blue-400" : ""}`}
        style={{
          left: p.x,
          top: p.y,
          width: POSTIT_W,
          height: POSTIT_H,
          transform: `translateZ(0)`,
          zIndex: 3,
        }}
        onMouseDown={(e) => handleMouseDown(e, p.id)}
        title={
          paintMode
            ? "Cliquez pour appliquer la couleur"
            : isConnecting
            ? connectSourceId
              ? "Cliquez la CIBLE"
              : "Cliquez la SOURCE"
            : "Glissez pour déplacer"
        }
      >
        {/* Boutons + haut/bas */}
        {mode === "moderator" && !isConnecting && (
          <>
            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 -top-3 w-6 h-6 rounded-full bg-emerald-600 text-white text-[14px] leading-[22px] shadow"
              title="Ajouter & relier (au-dessus)"
              onClick={(ev) => {
                ev.stopPropagation();
                createLinkedPostIt(p, "up");
              }}
            >
              +
            </button>
            <button
              type="button"
              className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-6 h-6 rounded-full bg-emerald-600 text-white text-[14px] leading-[22px] shadow"
              title="Ajouter & relier (au-dessous)"
              onClick={(ev) => {
                ev.stopPropagation();
                createLinkedPostIt(p, "down");
              }}
            >
              +
            </button>
          </>
        )}

        <div
          className="rounded-lg p-3 shadow-lg border-2 relative overflow-hidden"
          style={{
            backgroundColor: color.bg,
            color: color.text,
            borderColor: color.border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.15,
          }}
        >
          {mode === "moderator" && !isConnecting && !paintMode && (
            <div className="absolute -top-1 -right-1 flex gap-1">
              <button
                type="button"
                className="w-5 h-5 bg-black/70 text-white rounded-full text-[11px] flex items-center justify-center"
                title="Modifier"
                onClick={(ev) => {
                  ev.stopPropagation();
                  startEditing(p);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="w-5 h-5 bg-black/70 text-white rounded-full text-[13px] flex items-center justify-center"
                title="Couleur"
                onClick={(ev) => {
                  ev.stopPropagation();
                  const keys = Object.keys(COLOR_PALETTE);
                  const idx = Math.max(0, keys.indexOf(p.color));
                  const next = keys[(idx + 1) % keys.length];
                  updatePostItInFirebase(p.id, { color: next });
                }}
              >
                🎨
              </button>
              <button
                type="button"
                className="w-5 h-5 bg-black/70 text-white rounded-full text-[13px] flex items-center justify-center"
                title="Supprimer"
                onClick={(ev) => {
                  ev.stopPropagation();
                  deletePostItFromFirebase(p.id);
                }}
              >
                ×
              </button>
            </div>
          )}

          <div className="font-extrabold text-[14px] break-words whitespace-normal max-h-[50px] overflow-hidden pr-6">
            {p.content}
          </div>
          <div className="text-[11px] opacity-90 mt-1">{p.author}</div>
        </div>
      </div>
    );
  };

  /* ========================= Participant (vue unifiée) ========================= */

  if (mode === "participant" && !standaloneAnalysis) {
    const canSend =
      participantContent.trim().length > 0 &&
      (isAnonymous || (participantName.trim().length >= 2));

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-4">
            <h1 className="text-xl font-black text-gray-900">
              🌳 Arbre à Problèmes
            </h1>
            <p className="text-gray-600 text-sm">Session&nbsp;: {sessionId}</p>
            {(projectName || theme) && (
              <p className="text-gray-700 font-bold mt-1">
                {projectName}
                {theme ? " — " + theme : ""}
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl p-5 shadow space-y-4">
            <div>
              <label className="block text-sm font-bold mb-1">
                Nom / Prénom
              </label>
              <input
                type="text"
                value={isAnonymous ? "" : participantName}
                onChange={(e) => {
                  setParticipantName(e.target.value);
                  if (isAnonymous) setIsAnonymous(false);
                }}
                disabled={isAnonymous}
                className="w-full p-3 border-2 border-gray-300 rounded-lg text-base disabled:opacity-60"
                placeholder="Entrez votre nom… (ou cochez Anonyme)"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setIsAnonymous(v);
                    if (v) {
                      setParticipantName("Anonyme");
                    } else if (participantName === "Anonyme") {
                      setParticipantName("");
                    }
                  }}
                />
                Participer en <strong>Anonyme</strong>
              </label>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Catégorie</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg"
              >
                <option value="problem">Problèmes</option>
                <option value="causes">Causes</option>
                <option value="consequences">Conséquences</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Votre post-it</label>
              <textarea
                rows={4}
                value={participantContent}
                onChange={(e) =>
                  setParticipantContent(e.target.value.slice(0, MAX_CHARS))
                }
                className="w-full p-3 border-2 border-gray-300 rounded-lg"
                placeholder="Écrivez votre contribution…"
              />
              <div className="text-xs text-gray-500 mt-1 text-right">
                {MAX_CHARS - (participantContent?.length || 0)} car. restants
              </div>
            </div>

            <button
              type="button"
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold disabled:opacity-40"
              disabled={!canSend}
              onClick={async () => {
                const author = isAnonymous ? "Anonyme" : participantName.trim();
                await addPostItToFirebase(
                  participantContent,
                  selectedCategory,
                  author,
                  null,
                  null,
                  false,
                  CATEGORY_DEFAULT_COLOR[selectedCategory] || "red"
                );
                localStorage.setItem("participantName", author);
                setParticipantContent("");
              }}
            >
              Envoyer
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ========================= Page d'analyse autonome (nouvel onglet) ========================= */

  if (standaloneAnalysis) {
    const goBackToWorkshop = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("analysis");
      url.searchParams.delete("mode");
      window.location.replace(url.toString()); // retour propre
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
        <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
          <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-3">
            <span className="text-lg">📊</span>
            <span className="font-bold text-slate-800">Analyse — Arbre à Problèmes</span>
            <span className="text-xs text-slate-500">Session: {sessionId}</span>
            {(projectName || theme) && (
              <span className="text-xs text-slate-700 font-bold">
                • {projectName}{theme ? " — " + theme : ""}
              </span>
            )}
            <button
              className="ml-auto px-3 py-1 rounded text-sm font-semibold bg-slate-200 text-slate-700"
              onClick={goBackToWorkshop}
              title="Retour à l’atelier"
            >
              ← Retour à l’atelier
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto p-4">
          <AnalysisPanel
            sessionId={sessionId}
            postIts={postIts}
            connections={connections}
            projectName={projectName}
            theme={theme}
          />
        </div>
      </div>
    );
  }

  /* ========================= Modérateur ========================= */

  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));
  const zoomIn = () => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)));
  const zoomFit = () => {
    const wrap = treeScrollRef.current;
    const area = treeAreaRef.current;
    if (!wrap || !area) return;
    const contentW = area.scrollWidth;
    const contentH = area.scrollHeight;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    const factor = Math.max(
      0.5,
      Math.min(2, +(Math.min(availW / contentW, availH / contentH)).toFixed(2))
    );
    setZoom(factor || 1);
  };

  const visiblePostIts = {
    inTree: postIts.filter((p) => p.isInTree),
    causes: postIts.filter((p) => p.category === "causes" && !p.isInTree),
    consequences: postIts.filter((p) => p.category === "consequences" && !p.isInTree),
    problems: postIts.filter((p) => p.category === "problem" && !p.isInTree),
  };

  const handlePresentationComplete = async ({ projectName: p, theme: t }) => {
    await setDoc(
      doc(db, "sessions", sessionId),
      { projectName: p, theme: t, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setProjectName(p || "");
    setTheme(t || "");
    setShowPresentation(false);
  };

  if (showPresentation && mode !== "participant") {
    return (
      <ArbreProblemePresentation
        sessionId={sessionId}
        onComplete={handlePresentationComplete}
        defaultProjectName={projectName}
        defaultTheme={theme}
      />
    );
  }

  /* ========= Rendus réutilisables ========= */

  const setPanelStateWrapper = (panel, base) =>
    `bg-white rounded shadow border ${getPanelClasses(panel, base)}`;

  const ColumnList = ({ items, fallbackColor, title }) => (
    <div className="space-y-2">
      {items.map((p) => {
        const color = COLOR_PALETTE[p.color] || COLOR_PALETTE[fallbackColor];
        return (
          <div
            key={p.id}
            className="p-3 rounded border-2 shadow-sm group relative select-none"
            style={{
              backgroundColor: color.bg,
              color: color.text,
              borderColor: color.border,
              fontFamily: "'Arial Black', Arial, sans-serif",
            }}
            onMouseDown={(e) => handleMouseDown(e, p.id)}
            title={paintMode ? "Cliquez pour appliquer la couleur" : `Glissez vers l'arbre (${title})`}
          >
            <div className="font-extrabold text-sm break-words">
              {p.content}
            </div>
            <div className="text-[11px] opacity-90">{p.author}</div>
            {!isConnecting && !paintMode && (
              <button
                className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-[12px] opacity-0 group-hover:opacity-100"
                onClick={(ev) => {
                  ev.stopPropagation();
                  deletePostItFromFirebase(p.id);
                }}
                title="Supprimer"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const ClassicLayout = () => (
    <div className="max-w-7xl mx-auto p-3 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-56px)]">
      <div className={setPanelStateWrapper("causes", "col-span-3 row-span-9")}>
        <PanelHeader
          title="Causes"
          panel="causes"
          onAdd={() =>
            addPostItToFirebase(
              "Nouvelle cause",
              "causes",
              "Modérateur",
              null,
              null,
              false,
              CATEGORY_DEFAULT_COLOR.causes
            )
          }
        />
        <div className="p-2 h-full overflow-y-auto">
          <ColumnList items={visiblePostIts.causes} fallbackColor="pink" title="Causes" />
        </div>
      </div>

      <div className={setPanelStateWrapper("tree", "col-span-6 row-span-9")}>
        <PanelHeader title="Arbre à Problèmes" panel="tree" />
        <div className="px-2 py-1 border-b flex items-center gap-2 text-sm">
          <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomOut} title="Dézoomer">–</button>
          <span className="min-w-[44px] text-center font-semibold">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomIn} title="Zoomer">+</button>
          <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomFit} title="Ajuster">Ajuster</button>
          <span className="ml-auto text-xs text-slate-500">Astuce&nbsp;: Ctrl/⌘ + molette</span>
        </div>

        <div
          ref={treeScrollRef}
          className="relative w-full h-[calc(100%-56px)] overflow-auto"
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              setZoom((z) => Math.max(0.5, Math.min(2, +(z + delta).toFixed(2))));
            }
          }}
        >
          <div
            ref={treeAreaRef}
            className="relative"
            style={{
              width: 2000,
              height: 1200,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg className="absolute inset-0 w-[2000px] h-[1200px] pointer-events-none" style={{ zIndex: 2 }}>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#0f172a" />
                </marker>
              </defs>
              {renderConnections()}
            </svg>
            {visiblePostIts.inTree.map(renderPostIt)}
          </div>
        </div>
      </div>

      <div className={setPanelStateWrapper("consequences", "col-span-3 row-span-9")}>
        <PanelHeader
          title="Conséquences"
          panel="consequences"
          onAdd={() =>
            addPostItToFirebase(
              "Nouvelle conséquence",
              "consequences",
              "Modérateur",
              null,
              null,
              false,
              CATEGORY_DEFAULT_COLOR.consequences
            )
          }
        />
        <div className="p-2 h-full overflow-y-auto">
          <ColumnList items={visiblePostIts.consequences} fallbackColor="green" title="Conséquences" />
        </div>
      </div>

      <div className={setPanelStateWrapper("problems", "col-span-12 row-span-3")}>
        <PanelHeader
          title="Problèmes Suggérés"
          panel="problems"
          onAdd={() =>
            addPostItToFirebase(
              "Nouveau problème",
              "problem",
              "Modérateur",
              null,
              null,
              false,
              CATEGORY_DEFAULT_COLOR.problem
            )
          }
        />
        <div className="p-2 h-full overflow-x-auto">
          <div className="flex gap-2">
            <ColumnList items={visiblePostIts.problems} fallbackColor="red" title="Problèmes" />
          </div>
        </div>
      </div>
    </div>
  );

  const FocusLayout = () => (
    <div className="relative h-[calc(100vh-56px)]">
      <div
        ref={treeScrollRef}
        className="absolute inset-0 overflow-auto bg-white border-t"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            setZoom((z) => Math.max(0.2, Math.min(3, +(z + delta).toFixed(2))));
          }
        }}
      >
        <div
          ref={treeAreaRef}
          className="relative"
          style={{
            width: 2000,
            height: 1400,
            transform: `scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <svg className="absolute inset-0 w-[2000px] h-[1400px] pointer-events-none" style={{ zIndex: 2 }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#0f172a" />
              </marker>
            </defs>
            {renderConnections()}
          </svg>
          {visiblePostIts.inTree.map(renderPostIt)}
        </div>
      </div>

      <div className="absolute top-3 left-3 z-40 flex items-center gap-2 bg-white/90 backdrop-blur rounded shadow p-2">
        <button className="px-2 py-1 rounded bg-slate-200" onClick={zoomOut} title="Dézoomer">–</button>
        <span className="min-w-[44px] text-center font-semibold">{Math.round(zoom * 100)}%</span>
        <button className="px-2 py-1 rounded bg-slate-200" onClick={zoomIn} title="Zoomer">+</button>
        <button className="px-2 py-1 rounded bg-slate-200" onClick={zoomFit} title="Ajuster">Ajuster</button>
      </div>

      {dockPosition === "right" ? (
        <div className="absolute right-2 top-16 bottom-2 w-72 bg-white/95 backdrop-blur border rounded-lg shadow p-2 overflow-y-auto z-30">
          <div className="text-sm font-bold mb-2">📥 Zones de collecte</div>
          <div className="space-y-4">
            <DockSection title="Causes" add={() =>
              addPostItToFirebase("Nouvelle cause","causes","Modérateur",null,null,false,CATEGORY_DEFAULT_COLOR.causes)
            }>
              <ColumnList items={visiblePostIts.causes} fallbackColor="pink" title="Causes" />
            </DockSection>
            <DockSection title="Conséquences" add={() =>
              addPostItToFirebase("Nouvelle conséquence","consequences","Modérateur",null,null,false,CATEGORY_DEFAULT_COLOR.consequences)
            }>
              <ColumnList items={visiblePostIts.consequences} fallbackColor="green" title="Conséquences" />
            </DockSection>
            <DockSection title="Problèmes" add={() =>
              addPostItToFirebase("Nouveau problème","problem","Modérateur",null,null,false,CATEGORY_DEFAULT_COLOR.problem)
            }>
              <ColumnList items={visiblePostIts.problems} fallbackColor="red" title="Problèmes" />
            </DockSection>
          </div>
        </div>
      ) : (
        <div className="absolute left-2 right-2 bottom-2 bg-white/95 backdrop-blur border rounded-lg shadow p-2 z-30">
          <div className="text-sm font-bold mb-2">📥 Zones de collecte</div>
          <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto">
            <DockSection title="Causes" add={() =>
              addPostItToFirebase("Nouvelle cause","causes","Modérateur",null,null,false,CATEGORY_DEFAULT_COLOR.causes)
            }>
              <ColumnList items={visiblePostIts.causes} fallbackColor="pink" title="Causes" />
            </DockSection>
            <DockSection title="Conséquences" add={() =>
              addPostItToFirebase("Nouvelle conséquence","consequences","Modérateur",null,null,false,CATEGORY_DEFAULT_COLOR.consequences)
            }>
              <ColumnList items={visiblePostIts.consequences} fallbackColor="green" title="Conséquences" />
            </DockSection>
            <DockSection title="Problèmes" add={() =>
              addPostItToFirebase("Nouveau problème","problem","Modérateur",null,null,false,CATEGORY_DEFAULT_COLOR.problem)
            }>
              <ColumnList items={visiblePostIts.problems} fallbackColor="red" title="Problèmes" />
            </DockSection>
          </div>
        </div>
      )}
    </div>
  );

  function DockSection({ title, add, children }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold">{title}</div>
          <button className="px-2 py-0.5 rounded bg-indigo-600 text-white text-xs" onClick={add}>+</button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌳</span>
            <span className="font-bold text-slate-800">Arbre à Problèmes</span>
            <span className="text-xs text-slate-500">Session: {sessionId}</span>
          </div>

          <div className="ml-3 flex items-center gap-2 flex-1">
            <input
              className="px-3 py-1 border rounded text-sm font-bold"
              placeholder="Nom du projet"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={async () => {
                await setDoc(doc(db, "sessions", sessionId), { projectName }, { merge: true });
              }}
            />
            <input
              className="px-3 py-1 border rounded text-sm font-bold"
              placeholder="Thème"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onBlur={async () => {
                await setDoc(doc(db, "sessions", sessionId), { theme }, { merge: true });
              }}
            />
          </div>

          <div className="hidden md:flex items-center gap-1">
            {Object.keys(COLOR_PALETTE).map((k) => (
              <button
                key={k}
                className={`w-4 h-4 rounded ${activeColor === k ? "ring-2 ring-slate-700" : ""}`}
                style={{ backgroundColor: COLOR_PALETTE[k].bg }}
                title={`Couleur par défaut: ${k}`}
                onClick={() => setActiveColor(k)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded text-sm font-semibold ${
                paintMode ? "bg-yellow-400 text-black" : "bg-slate-200 text-slate-700"
              }`}
              onClick={() => {
                setPaintMode((v) => !v);
                if (!paintMode) {
                  setIsConnecting(false);
                  setConnectSourceId(null);
                }
              }}
              title="Appliquer la couleur active sur clic de post-it"
            >
              Peindre
            </button>

            <button
              className={`px-3 py-1 rounded text-sm font-semibold ${
                isConnecting ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-700"
              }`}
              onClick={() => {
                setIsConnecting((v) => !v);
                setConnectSourceId(null);
                if (!isConnecting) setPaintMode(false);
              }}
              title="Relier des post-its"
            >
              Connecter
            </button>

            <button
              className="px-3 py-1 rounded text-sm font-semibold bg-slate-200 text-slate-700"
              onClick={() => setLayoutMode((m) => (m === "classic" ? "focus" : "classic"))}
              title="Basculer la vue"
            >
              {layoutMode === "classic" ? "Plein écran Arbre" : "Vue classique"}
            </button>

            {layoutMode === "focus" && (
              <button
                className="px-3 py-1 rounded text-sm font-semibold bg-slate-200 text-slate-700"
                onClick={() => setDockPosition((d) => (d === "right" ? "bottom" : "right"))}
                title="Position du dock (côté/bas)"
              >
                Dock: {dockPosition === "right" ? "côté" : "bas"}
              </button>
            )}

            <button
              className="px-3 py-1 rounded text-sm font-semibold bg-slate-200 text-slate-700"
              onClick={newSession}
              title="Nouvelle session"
            >
              Nouvelle session
            </button>

            <button
              className="px-3 py-1 rounded text-sm font-semibold bg-emerald-600 text-white"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("analysis", "1");
                url.searchParams.delete("mode");
                window.open(url.toString(), "_blank", "noopener");
              }}
              title="Analyse (ouvre un nouvel onglet)"
            >
              Analyse
            </button>

            <button
              className="px-3 py-1 rounded text-sm font-semibold bg-slate-200 text-slate-700"
              onClick={() => setShowQR((v) => !v)}
              title="QR participants"
            >
              QR
            </button>
          </div>
        </div>
      </div>

      {layoutMode === "classic" ? <ClassicLayout /> : <FocusLayout />}

      {showQR && (
        <div className="fixed top-[56px] right-3 z-50 w-[320px] bg-white rounded shadow-lg border">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="font-semibold">QR participants</div>
            <button className="w-6 h-6 rounded bg-slate-200" onClick={() => setShowQR(false)} title="Fermer">×</button>
          </div>
          <div className="p-3">
            <div className="w-full flex justify-center">
              <QRCodeGenerator url={participantUrl} />
            </div>
            <div className="text-center text-xs mt-2">Participants</div>
            <div className="mt-3 text-[11px] break-all text-slate-600">{participantUrl}</div>
            <button
              className="mt-2 w-full px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm font-semibold"
              onClick={() => navigator.clipboard.writeText(participantUrl)}
            >
              Copier le lien
            </button>
          </div>
        </div>
      )}

      {showAnalysis && (
        <div className="fixed top-[56px] right-3 z-50 w-[380px] max-h-[calc(100vh-64px)] overflow-auto bg-white rounded shadow-lg border">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="font-semibold">Analyse</div>
            <button className="w-6 h-6 rounded bg-slate-200" onClick={() => setShowAnalysis(false)} title="Fermer">×</button>
          </div>
          <div className="p-3">
            <AnalysisPanel
              sessionId={sessionId}
              postIts={postIts}
              connections={connections}
              projectName={projectName}
              theme={theme}
            />
          </div>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[420px] p-4">
            <div className="font-bold mb-2">Modifier le post-it</div>
            <textarea
              rows={4}
              value={editingText}
              onChange={(e) => setEditingText(e.target.value.slice(0, MAX_CHARS))}
              className="w-full p-3 border-2 border-gray-300 rounded-lg font-extrabold"
              placeholder="Contenu…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveEditing();
                }
              }}
            />
            <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
              <span>{MAX_CHARS - (editingText?.length || 0)} car. restants</span>
              <span>Ctrl/⌘ + Entrée pour enregistrer</span>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3">
              <button className="px-3 py-1 rounded bg-slate-200 text-slate-800" onClick={cancelEditing}>Annuler</button>
              <button className="px-3 py-1 rounded bg-indigo-600 text-white font-semibold" onClick={saveEditing}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

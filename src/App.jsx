// src/App.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* ==================== UI & Constantes ==================== */
const COLORS = {
  problem: { bg: "#ef4444", text: "#ffffff", border: "#dc2626" },
  causes: { bg: "#fb7185", text: "#ffffff", border: "#f43f5e" },
  consequences: { bg: "#22c55e", text: "#ffffff", border: "#16a34a" },
};
const CATEGORY_LABELS = {
  problem: "Problème central",
  causes: "Causes",
  consequences: "Conséquences",
};
const POSTIT_W = 240;
const POSTIT_H = 96;
const MAX_CHARS = 50;

/* ==================== App ==================== */
export default function App() {
  /* Mode & session */
  const [mode, setMode] = useState("moderator"); // 'moderator' | 'participant'
  const [sessionId, setSessionId] = useState("PROBLEM-TREE-2025");

  /* Données Firestore */
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]);

  /* États UI */
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState(null);

  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Zoom local à l’arbre (0.5–2)
  const [zoom, setZoom] = useState(1);

  // Panneaux utilitaires
  const [showQR, setShowQR] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  /* Édition */
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  /* Métadonnées session */
  const [projectName, setProjectName] = useState("");
  const [theme, setTheme] = useState("");

  /* Participant */
  const [participantName, setParticipantName] = useState(
    () => localStorage.getItem("participantName") || ""
  );
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");

  /* Refs */
  const treeWrapRef = useRef(null); // wrapper scrollable
  const treeCanvasRef = useRef(null); // canvas zoomable
  const svgRef = useRef(null);

  /* URL participant (QR) */
  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  /* --------- Helpers --------- */
  const generateSessionId = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `PROBLEM-TREE-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
      d.getHours()
    )}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  const navigateToSession = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    window.history.replaceState({}, "", url.toString());
    setSessionId(id);
  };

  const newSession = async () => {
    const id = generateSessionId();
    navigateToSession(id);
    setPostIts([]);
    setConnections([]);
    setProjectName("");
    setTheme("");
    setShowAnalysis(false);
    try {
      await setDoc(
        doc(db, "sessions", id),
        { sessionId: id, createdAt: serverTimestamp(), status: "active" },
        { merge: true }
      );
    } catch {
      /* noop */
    }
  };

  /* --------- URL params (mode / session) --------- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const s = params.get("session");
    if (m === "participant") setMode("participant");
    if (s) setSessionId(s);
  }, []);

  /* --------- Charger métadonnées session --------- */
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const ref = doc(db, "sessions", sessionId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setProjectName(data.projectName || "");
          setTheme(data.theme || "");
        }
      } catch {
        /* noop */
      }
    })();
  }, [sessionId]);

  /* --------- Listeners Firestore --------- */
  useEffect(() => {
    if (!sessionId) return;

    const qP = query(collection(db, "postits"), where("sessionId", "==", sessionId));
    const unsubP = onSnapshot(qP, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      // tri léger par timestamp si présent
      arr.sort(
        (a, b) =>
          ((a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0)) ||
          (a.content || "").localeCompare(b.content || "")
      );
      setPostIts(arr);
    });

    const qC = query(collection(db, "connections"), where("sessionId", "==", sessionId));
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

  /* ==================== CRUD Post-its ==================== */
  const hardTrim = (s) => (s || "").slice(0, MAX_CHARS);

  const addPostItToFirebase = async (
    content,
    category,
    author,
    x = null,
    y = null,
    isInTree = false
  ) => {
    const safe = hardTrim(content || "");
    if (!safe.trim()) return;

    // positions par défaut (bords)
    const defaults = {
      causes: { x: 24, y: Math.random() * 140 + 40 },
      consequences: { x: 1000, y: Math.random() * 140 + 40 },
      problem: { x: 520, y: Math.random() * 140 + 40 },
    };
    const pos = x !== null ? { x, y } : defaults[category] || defaults.problem;

    try {
      await addDoc(collection(db, "postits"), {
        sessionId,
        content: safe,
        author,
        category,
        x: pos.x,
        y: pos.y,
        isInTree,
        isCentral: false,
        childIds: [],
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      alert("Impossible d’ajouter le post-it.");
    }
  };

  const updatePostItInFirebase = async (id, fields) => {
    try {
      if (fields.content != null) fields.content = hardTrim(fields.content);
      await updateDoc(doc(db, "postits", id), fields);
    } catch (e) {
      console.error(e);
    }
  };

  const deletePostItFromFirebase = async (id) => {
    try {
      await deleteDoc(doc(db, "postits", id));
      const rel = connections.filter((c) => c.fromId === id || c.toId === id);
      await Promise.all(rel.map((c) => deleteDoc(doc(db, "connections", c.id))));
    } catch (e) {
      console.error(e);
    }
  };

  /* ==================== Drag & Drop & Connexions ==================== */
  const handleMouseDown = (e, postItId) => {
    if (mode !== "moderator") return;
    e.preventDefault();

    // mode connexion → clic source/cible
    if (isConnecting) {
      if (!connectSourceId) {
        setConnectSourceId(postItId);
      } else if (connectSourceId && connectSourceId !== postItId) {
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

    // coord. dans le canvas zoomé
    const node = e.currentTarget;
    const rect = node.getBoundingClientRect();
    setDragOffset({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !selectedPostIt) return;
      const wrap = treeWrapRef.current;
      const canvas = treeCanvasRef.current;
      if (!wrap || !canvas) return;

      const wrapRect = wrap.getBoundingClientRect();
      const newX = Math.max(
        0,
        Math.min(
          canvas.offsetWidth - POSTIT_W,
          (e.clientX - wrapRect.left) / zoom - dragOffset.x + wrap.scrollLeft / zoom
        )
      );
      const newY = Math.max(
        0,
        Math.min(
          canvas.offsetHeight - POSTIT_H,
          (e.clientY - wrapRect.top) / zoom - dragOffset.y + wrap.scrollTop / zoom
        )
      );

      setPostIts((prev) =>
        prev.map((p) => (p.id === selectedPostIt ? { ...p, x: newX, y: newY, isInTree: true } : p))
      );
      updatePostItInFirebase(selectedPostIt, { x: newX, y: newY, isInTree: true });
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

  /* ==================== Connexions (SVG en angle droit) ==================== */
  const renderConnections = () => {
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    return connections.map((c) => {
      const a = byId[c.fromId];
      const b = byId[c.toId];
      if (!a || !b) return null;
      const x1 = (a.x || 0) + POSTIT_W / 2;
      const y1 = (a.y || 0) + POSTIT_H / 2;
      const x2 = (b.x || 0) + POSTIT_W / 2;
      const y2 = (b.y || 0) + POSTIT_H / 2;
      const midY = y1 + (y2 - y1) / 2;
      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      return (
        <path
          key={c.id}
          d={d}
          fill="none"
          stroke="#334155"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#arrowhead)"
          opacity="0.95"
        />
      );
    });
  };

  /* ==================== Rendu Post-it ==================== */
  const startEditing = (p) => {
    if (mode !== "moderator") return;
    setEditingId(p.id);
    setEditingText(p.content || "");
  };
  const saveEditing = async () => {
    if (!editingId) return;
    await updatePostItInFirebase(editingId, { content: editingText.trim() });
    setEditingId(null);
    setEditingText("");
  };

  const CharCounter = ({ value }) => {
    const left = Math.max(0, MAX_CHARS - (value?.length || 0));
    return (
      <span
        className={`ml-2 text-[10px] font-semibold ${
          left <= 5 ? "text-red-600" : "text-slate-500"
        }`}
        title="Caractères restants"
      >
        {left}
      </span>
    );
  };

  const renderPostIt = (p) => {
    const colors = COLORS[p.category] || COLORS.problem;
    const connectHalo =
      isConnecting && (connectSourceId === p.id ? "ring-4 ring-sky-400" : "ring-2 ring-emerald-300");
    const isEditing = editingId === p.id;

    return (
      <div
        key={p.id}
        className={`absolute select-none transition-all ${
          isConnecting ? "cursor-pointer" : "cursor-move"
        } ${isConnecting ? connectHalo : ""}`}
        style={{
          left: p.x,
          top: p.y,
          width: POSTIT_W,
          height: POSTIT_H,
          transform: `scale(${1})`, // taille fixe, c’est le canvas qui zoome
          zIndex: 2,
        }}
        onMouseDown={(e) => handleMouseDown(e, p.id)}
        title={isConnecting ? (connectSourceId ? "Cliquez la CIBLE" : "Cliquez la SOURCE") : ""}
      >
        <div
          className="rounded-lg p-3 shadow-lg border-2 relative overflow-hidden"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.15,
          }}
        >
          {/* actions */}
          {mode === "moderator" && !isConnecting && (
            <div className="absolute -top-1 -right-1 flex gap-1">
              <button
                type="button"
                className="w-5 h-5 bg-black/70 text-white rounded-full text-[10px] flex items-center justify-center"
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
                className="w-5 h-5 bg-black/70 text-white rounded-full text-[11px] flex items-center justify-center"
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

          {/* contenu */}
          {!isEditing ? (
            <>
              <div className="font-extrabold text-[13px] leading-tight break-words pr-6">
                {p.content}
              </div>
              <div className="text-[11px] opacity-85 mt-1">{p.author}</div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <input
                autoFocus
                className="w-full text-[13px] font-extrabold px-2 py-1 rounded bg-white/85 text-black"
                value={editingText}
                onChange={(e) => setEditingText(hardTrim(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditing();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setEditingText("");
                  }
                }}
                maxLength={MAX_CHARS}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] opacity-85">Modérateur</span>
                <CharCounter value={editingText} />
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  className="px-2 py-1 text-[11px] rounded bg-white/80 text-black font-bold"
                  onClick={saveEditing}
                >
                  OK
                </button>
                <button
                  className="px-2 py-1 text-[11px] rounded bg-black/60 text-white"
                  onClick={() => {
                    setEditingId(null);
                    setEditingText("");
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* + parent haut */}
          {mode === "moderator" && !isConnecting && !isEditing && (
            <button
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-white text-black rounded-full text-sm font-bold shadow-md hover:bg-gray-100 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                const cat = p.category === "causes" ? "causes" : "consequences";
                addPostItToFirebase(
                  "Nouveau",
                  cat,
                  "Modérateur",
                  p.x,
                  Math.max(0, p.y - POSTIT_H - 16),
                  true
                );
              }}
              title="Ajouter un parent"
            >
              +
            </button>
          )}

          {/* + enfant bas */}
          {mode === "moderator" && !isConnecting && !isEditing && (
            <button
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-white text-black rounded-full text-sm font-bold shadow-md hover:bg-gray-100 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                const cat = p.category === "consequences" ? "consequences" : "causes";
                addPostItToFirebase("Nouveau", cat, "Modérateur", p.x, p.y + POSTIT_H + 16, true);
              }}
              title="Ajouter un enfant"
            >
              +
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ==================== Header compact (1 ligne) ==================== */
  const Header = () => {
    return (
      <div className="w-full bg-white border-b sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-3 py-2 flex items-center gap-3 overflow-x-auto">
          <div className="flex items-baseline gap-2 min-w-fit">
            <span className="text-[18px] font-extrabold text-slate-800">🌳 Arbre à Problèmes</span>
            <span className="text-[12px] text-slate-500">Session: {sessionId}</span>
          </div>

          {/* Projet & Thème — bien visibles */}
          <div className="flex items-center gap-2 min-w-[380px]">
            <input
              className="px-3 py-2 text-[14px] font-bold border rounded w-[220px]"
              placeholder="Nom du projet"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={async () => {
                await setDoc(doc(db, "sessions", sessionId), { projectName }, { merge: true });
              }}
            />
            <input
              className="px-3 py-2 text-[14px] font-bold border rounded w-[200px]"
              placeholder="Thème"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onBlur={async () => {
                await setDoc(doc(db, "sessions", sessionId), { theme }, { merge: true });
              }}
            />
          </div>

          {/* Outils */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              className={`px-3 py-2 rounded font-bold text-[12px] ${
                isConnecting ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-900"
              }`}
              onClick={() => {
                setIsConnecting((v) => !v);
                setConnectSourceId(null);
              }}
              title="Relier des post-its (source → cible)"
            >
              🔗 {isConnecting ? "Mode Connexion ON" : "Connecter Post-its"}
            </button>

            <button
              className="px-3 py-2 rounded font-bold text-[12px] bg-slate-200 text-slate-900"
              onClick={newSession}
              title="Démarrer une session vide"
            >
              Nouvelle session
            </button>

            <button
              className={`px-3 py-2 rounded font-bold text-[12px] ${
                showAnalysis ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-900"
              }`}
              onClick={() => setShowAnalysis((v) => !v)}
              title="Ouvrir l’analyse"
            >
              Analyse
            </button>

            <button
              className={`px-3 py-2 rounded font-bold text-[12px] ${
                showQR ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-900"
              }`}
              onClick={() => setShowQR((v) => !v)}
              title="Afficher le QR participants"
            >
              QR
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ==================== Vues ==================== */

  // Participant
  if (mode === "participant") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-800 mb-1">🌳 Arbre à Problèmes</h1>
            <p className="text-gray-600 text-sm">Session: {sessionId}</p>
            {(projectName || theme) && (
              <p className="text-gray-800 font-extrabold mt-2">
                {projectName} {theme ? " — " + theme : ""}
              </p>
            )}
          </div>

          {!participantName && (
            <div className="bg-white rounded-xl p-5 shadow-lg mb-6">
              <h2 className="text-lg font-bold mb-3">Votre nom</h2>
              <input
                type="text"
                placeholder="Entrez votre nom…"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg"
                onInput={(e) => {
                  // si on tape la 1re lettre on reste, mais on ne bascule pas d’écran (demandé)
                }}
              />
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!participantName.trim()) return;
                    localStorage.setItem("participantName", participantName.trim());
                    setParticipantName(participantName.trim());
                  }}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold disabled:opacity-50"
                  disabled={!participantName.trim()}
                >
                  Continuer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParticipantName("Anonyme");
                    localStorage.setItem("participantName", "Anonyme");
                  }}
                  className="px-4 bg-gray-200 text-gray-800 rounded-lg font-bold"
                >
                  Anonyme
                </button>
              </div>
            </div>
          )}

          {participantName && (
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="mb-4">
                <label className="block text-sm font-bold mb-2">Catégorie :</label>
                <div className="grid grid-cols-1 gap-2">
                  {Object.keys(CATEGORY_LABELS).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`p-3 rounded-lg font-bold text-left ${
                        selectedCategory === cat ? "ring-2 ring-offset-2 ring-indigo-500" : "hover:bg-gray-50"
                      }`}
                      style={{
                        backgroundColor: selectedCategory === cat ? COLORS[cat].bg : "#f9fafb",
                        color: selectedCategory === cat ? COLORS[cat].text : "#374151",
                        fontFamily: "'Arial Black', Arial, sans-serif",
                      }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-bold">Votre idée (50 caractères max)</label>
                <CharCounter value={participantContent} />
              </div>
              <textarea
                rows={4}
                value={participantContent}
                onChange={(e) => setParticipantContent(hardTrim(e.target.value))}
                className="w-full p-3 border-2 border-gray-300 rounded-lg"
                placeholder="Écrivez votre contribution…"
                maxLength={MAX_CHARS}
              />

              <button
                type="button"
                className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-bold disabled:opacity-40"
                disabled={!participantContent.trim()}
                onClick={async () => {
                  await addPostItToFirebase(
                    participantContent,
                    selectedCategory,
                    participantName || "Anonyme",
                    null,
                    null,
                    false
                  );
                  setParticipantContent("");
                }}
              >
                Envoyer
              </button>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                Connecté en tant que : <strong>{participantName}</strong>
                <button
                  onClick={() => {
                    setParticipantName("");
                    localStorage.removeItem("participantName");
                  }}
                  className="text-xs text-indigo-600 ml-2 hover:underline"
                >
                  Changer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ==================== Interface Modérateur ==================== */
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <div className="max-w-[1400px] mx-auto w-full px-3 py-2 grid grid-cols-12 gap-2">
        {/* Dock de gauche (Causes) */}
        <div className="col-span-12 md:col-span-2 bg-white border rounded-lg shadow-sm p-2 h-[20vh] md:h-[calc(100vh-110px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-700 text-sm">📝 Causes</h3>
            <button
              className="px-2 py-1 text-xs rounded bg-indigo-600 text-white font-bold"
              onClick={() => addPostItToFirebase("Nouvelle cause", "causes", "Modérateur", 24, 40, false)}
            >
              + Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {postIts
              .filter((p) => p.category === "causes" && !p.isInTree)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-2 rounded border-2 shadow-sm text-white text-[12px] font-extrabold cursor-move"
                  style={{
                    backgroundColor: COLORS.causes.bg,
                    borderColor: COLORS.causes.border,
                    fontFamily: "'Arial Black', Arial, sans-serif",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, p.id)}
                  title="Glissez vers l’arbre"
                >
                  {p.content}
                </div>
              ))}
          </div>
        </div>

        {/* Arbre — occupe le max */}
        <div className="col-span-12 md:col-span-8 bg-white border rounded-lg shadow-sm p-0 flex flex-col">
          {/* barre outils arbre */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50">
            <div className="font-bold text-slate-700 text-sm">🌳 Arbre à Problèmes</div>
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-1 text-xs rounded bg-slate-200"
                onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                title="Zoom -"
              >
                –
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-slate-200"
                onClick={() => setZoom(1)}
                title="Zoom 100%"
              >
                100%
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-slate-200"
                onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
                title="Zoom +"
              >
                +
              </button>
            </div>
          </div>

          {/* zone scrollable + canvas zoomé */}
          <div
            ref={treeWrapRef}
            className="relative flex-1 overflow-auto"
            style={{ backgroundImage: "linear-gradient(transparent 98%, #e2e8f0 99%), linear-gradient(90deg, transparent 98%, #e2e8f0 99%)", backgroundSize: "24px 24px" }}
          >
            <div
              ref={treeCanvasRef}
              className="relative"
              style={{
                width: 1600,
                height: 1200,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              {/* SVG connexions */}
              <svg
                ref={svgRef}
                className="absolute inset-0 w-[1600px] h-[1200px] pointer-events-none"
                style={{ zIndex: 1 }}
              >
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#334155" />
                  </marker>
                </defs>
                {renderConnections()}
              </svg>

              {/* Post-its dans l’arbre */}
              {postIts.filter((p) => p.isInTree).map(renderPostIt)}
            </div>
          </div>
        </div>

        {/* Dock de droite (Conséquences + QR + Analyse) */}
        <div className="col-span-12 md:col-span-2 flex flex-col gap-2">
          <div className="bg-white border rounded-lg shadow-sm p-2 h-[14vh] md:h-[calc(60vh-12px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-700 text-sm">📈 Conséquences</h3>
              <button
                className="px-2 py-1 text-xs rounded bg-indigo-600 text-white font-bold"
                onClick={() =>
                  addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur", 1000, 40, false)
                }
              >
                + Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {postIts
                .filter((p) => p.category === "consequences" && !p.isInTree)
                .map((p) => (
                  <div
                    key={p.id}
                    className="p-2 rounded border-2 shadow-sm text-white text-[12px] font-extrabold cursor-move"
                    style={{
                      backgroundColor: COLORS.consequences.bg,
                      borderColor: COLORS.consequences.border,
                      fontFamily: "'Arial Black', Arial, sans-serif",
                    }}
                    onMouseDown={(e) => handleMouseDown(e, p.id)}
                    title="Glissez vers l’arbre"
                  >
                    {p.content}
                  </div>
                ))}
            </div>
          </div>

          {/* Panneau QR compact */}
          {showQR && (
            <div className="bg-white border rounded-lg shadow-sm p-2">
              <div className="font-bold text-slate-700 text-sm mb-2">QR participants</div>
              <QRCodeGenerator url={participantUrl} />
            </div>
          )}

          {/* Panneau Analyse */}
          {showAnalysis && (
            <div className="bg-white border rounded-lg shadow-sm p-2">
              <AnalysisPanel
                sessionId={sessionId}
                postIts={postIts}
                connections={connections}
                projectName={projectName}
                theme={theme}
              />
            </div>
          )}
        </div>

        {/* Dock bas : Problèmes suggérés */}
        <div className="col-span-12 bg-white border rounded-lg shadow-sm p-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-700 text-sm">🎯 Problèmes suggérés</h3>
            <button
              className="px-2 py-1 text-xs rounded bg-indigo-600 text-white font-bold"
              onClick={() => addPostItToFirebase("Nouveau problème", "problem", "Modérateur", 520, 40, false)}
            >
              + Ajouter
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {postIts
              .filter((p) => p.category === "problem" && !p.isInTree)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-2 rounded border-2 shadow-sm text-white text-[12px] font-extrabold cursor-move min-w-[220px]"
                  style={{
                    backgroundColor: COLORS.problem.bg,
                    borderColor: COLORS.problem.border,
                    fontFamily: "'Arial Black', Arial, sans-serif",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, p.id)}
                  title="Glissez vers l’arbre"
                >
                  {p.content}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

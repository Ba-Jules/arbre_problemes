import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
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
  getDoc
} from "firebase/firestore";
import { db } from "./firebase-config";

import QRCodeGenerator from "./components/QRCodeGenerator.jsx";
import ArbreProblemePresentation from "./components/ArbreProblemePresentation.jsx";
import AnalysisPanel from "./components/AnalysisPanel.jsx";

/* ======= UI & Constantes ======= */
const COLORS = {
  problem: { bg: "#ef4444", text: "#ffffff", border: "#dc2626" },
  causes: { bg: "#fb7185", text: "#ffffff", border: "#f43f5e" },
  consequences: { bg: "#22c55e", text: "#ffffff", border: "#16a34a" }
};

const POSTIT_W = 240;
const POSTIT_H = 96;
const MAX_CHARS = 50;

const defaultPanelStates = {
  causes: "normal",
  tree: "normal",
  consequences: "normal",
  problems: "normal"
};

/* ======= Utils ======= */
const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

const nowSessionId = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `PROBLEM-TREE-${d.getFullYear()}${p(d.getMonth() + 1)}${p(
    d.getDate()
  )}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/* ======= App ======= */
export default function App() {
  /* Mode via URL: moderator | participant | analysis */
  const [mode, setMode] = useState("moderator");
  const [sessionId, setSessionId] = useState("PROBLEM-TREE-2025");

  /* Données */
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]);

  /* UI / état */
  const [panelStates, setPanelStates] = useState(defaultPanelStates);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState(null);

  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  /* Edition post-it */
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  /* Métadonnées session */
  const [projectName, setProjectName] = useState("");
  const [theme, setTheme] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  /* Participant */
  const [participantName, setParticipantName] = useState(
    () => localStorage.getItem("participantName") || ""
  );
  const [hasIdentified, setHasIdentified] = useState(
    () => !!localStorage.getItem("participantName")
  );
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");

  /* Zoom & scroll de l’arbre */
  const [zoom, setZoom] = useState(1); // 1 = 100%
  const treeScrollRef = useRef(null);
  const treeCanvasRef = useRef(null);

  /* QR repliable */
  const [qrOpen, setQrOpen] = useState(false);

  /* Refs */
  const treeAreaRef = useRef(null);

  /* URL participant (stable, absolute) */
  const participantUrl = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = new URL(base);
    url.searchParams.set("session", sessionId);
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  /* ======= URL params: appliquer mode + session ======= */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const s = params.get("session");
    if (m && ["moderator", "participant", "analysis"].includes(m)) {
      setMode(m);
    }
    if (s) setSessionId(s);
  }, []);

  /* ======= Charger métadonnées session (une fois par session) ======= */
  useEffect(() => {
    if (!sessionId) return;
    const ref = doc(db, "sessions", sessionId);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // On ne refait pas de set à chaque frappe : valeurs initiales seulement
          setProjectName(data.projectName || "");
          setTheme(data.theme || "");
          setShowOnboarding(false);
        } else {
          // Première fois → slides
          setShowOnboarding(true);
        }
      })
      .catch(() => setShowOnboarding(true));
  }, [sessionId]);

  /* ======= Listeners Firestore ======= */
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

  /* ======= Nouvelle session (vide, sans post-it central auto) ======= */
  const startNewSession = async () => {
    const id = nowSessionId();
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.toString());
    setSessionId(id);

    setPostIts([]);
    setConnections([]);
    setProjectName("");
    setTheme("");
    setShowOnboarding(true);

    try {
      await setDoc(
        doc(db, "sessions", id),
        { sessionId: id, createdAt: serverTimestamp(), status: "active" },
        { merge: true }
      );
    } catch {}
  };

  /* ======= Enregistrement projet / thème (debounced) ======= */
  const saveSessionMeta = useMemo(
    () =>
      debounce(async (fields) => {
        try {
          await setDoc(doc(db, "sessions", sessionId), fields, { merge: true });
        } catch {}
      }, 500),
    [sessionId]
  );

  /* ======= CRUD Post-its ======= */
  const addPostItToFirebase = async (
    content,
    category,
    author,
    x = null,
    y = null,
    isInTree = false
  ) => {
    if (!content?.trim()) return;
    const trimmed = content.trim().slice(0, MAX_CHARS);

    const defaults = {
      causes: { x: 24, y: Math.random() * 160 + 48 },
      consequences: { x: 1100, y: Math.random() * 160 + 48 },
      problem: { x: 520, y: Math.random() * 160 + 48 }
    };
    const pos = x !== null ? { x, y } : defaults[category] || defaults.problem;

    try {
      await addDoc(collection(db, "postits"), {
        sessionId,
        content: trimmed,
        author,
        category,
        x: pos.x,
        y: pos.y,
        isInTree,
        isCentral: false,
        childIds: [],
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
      alert("Impossible d’ajouter le post-it.");
    }
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
      const rel = connections.filter((c) => c.fromId === id || c.toId === id);
      await Promise.all(
        rel.map((c) => deleteDoc(doc(db, "connections", c.id)))
      );
    } catch (e) {
      console.error(e);
    }
  };

  /* ======= Drag & drop ======= */
  const handleMouseDown = (e, postItId) => {
    if (mode !== "moderator") return;
    e.preventDefault();

    if (isConnecting) {
      if (!connectSourceId) {
        setConnectSourceId(postItId);
      } else if (connectSourceId && connectSourceId !== postItId) {
        addDoc(collection(db, "connections"), {
          sessionId,
          fromId: connectSourceId,
          toId: postItId,
          createdAt: serverTimestamp()
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

  const onMove = useCallback(
    (e) => {
      if (!isDragging || !selectedPostIt) return;
      const area = treeAreaRef.current;
      if (!area) return;

      const rect = area.getBoundingClientRect();
      // Compense le zoom
      const dx = (e.clientX - rect.left - dragOffset.x) / zoom;
      const dy = (e.clientY - rect.top - dragOffset.y) / zoom;

      const newX = Math.max(0, Math.min(4000 - POSTIT_W, dx));
      const newY = Math.max(0, Math.min(2500 - POSTIT_H, dy));

      setPostIts((prev) =>
        prev.map((p) =>
          p.id === selectedPostIt ? { ...p, x: newX, y: newY, isInTree: true } : p
        )
      );
      updatePostItInFirebase(selectedPostIt, {
        x: newX,
        y: newY,
        isInTree: true
      });
    },
    [isDragging, selectedPostIt, dragOffset.x, dragOffset.y, zoom]
  );

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setSelectedPostIt(null);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", endDrag);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", endDrag);
    };
  }, [onMove, endDrag]);

  /* ======= Edition ======= */
  const startEditing = (p) => {
    if (mode !== "moderator") return;
    setEditingId(p.id);
    setEditingText((p.content || "").slice(0, MAX_CHARS));
  };
  const cancelEditing = () => {
    setEditingId(null);
    setEditingText("");
  };
  const saveEditing = async () => {
    if (!editingId) return;
    await updatePostItInFirebase(editingId, {
      content: editingText.trim().slice(0, MAX_CHARS)
    });
    cancelEditing();
  };

  /* ======= Connexions (orthogonales) ======= */
  const renderConnections = () => {
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    return connections.map((c) => {
      const a = byId[c.fromId];
      const b = byId[c.toId];
      if (!a || !b) return null;

      const x1 = a.x + POSTIT_W / 2;
      const y1 = a.y + POSTIT_H / 2;
      const x2 = b.x + POSTIT_W / 2;
      const y2 = b.y + POSTIT_H / 2;

      const midY = y1 + (y2 - y1) / 2;
      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

      return (
        <path
          key={`${c.fromId}-${c.toId}`}
          d={d}
          fill="none"
          stroke="#374151"
          strokeWidth={3}
          markerEnd="url(#arrowhead)"
          opacity="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });
  };

  /* ======= Zoom handlers ======= */
  const clampZoom = (z) => Math.max(0.25, Math.min(3, z));
  const zoomIn = () => setZoom((z) => clampZoom(z + 0.25));
  const zoomOut = () => setZoom((z) => clampZoom(z - 0.25));
  const zoomReset = () => setZoom(1);
  const zoomFit = () => {
    // Fit horizontal dans le viewport actuel
    const container = treeScrollRef.current;
    if (!container) return;
    const padding = 40;
    const available = container.clientWidth - padding;
    const needed = 1400; // largeur logique utile initiale du canvas
    const z = clampZoom(available / needed);
    setZoom(z);
  };

  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => clampZoom(z + delta));
  };

  /* ======= Panels helpers ======= */
  const setPanelState = (panel, state) => {
    setPanelStates((prev) => ({ ...prev, [panel]: state }));
  };
  const minimizePanel = (panel) => setPanelState(panel, "minimized");
  const maximizePanel = (panel) =>
    setPanelStates({
      causes: panel === "causes" ? "maximized" : "minimized",
      tree: panel === "tree" ? "maximized" : "minimized",
      consequences: panel === "consequences" ? "maximized" : "minimized",
      problems: panel === "problems" ? "maximized" : "minimized"
    });
  const restorePanels = () => setPanelStates(defaultPanelStates);

  const getPanelClasses = (panel, base) => {
    const st = panelStates[panel];
    if (st === "maximized") return "col-span-12 row-span-12 z-40";
    if (st === "minimized") return "col-span-1 row-span-1 min-h-[36px]";
    return base;
  };

  const PanelHeader = ({ title, color, panel, onAdd }) => {
    const st = panelStates[panel];
    return (
      <div className="flex items-center justify-between px-2 py-1 border-b bg-gradient-to-r from-blue-50 to-blue-100 border-gray-300">
        <h3 className="font-extrabold text-[13px] leading-none" style={{ color }}>
          {st === "minimized" ? title.split(" ")[0] : title}
        </h3>
        <div className="flex items-center gap-2">
          {st !== "minimized" && onAdd && (
            <button
              onClick={onAdd}
              className="w-6 h-6 bg-indigo-500 text-white rounded text-xs font-bold hover:bg-indigo-600 flex items-center justify-center"
              title="Ajouter post-it"
            >
              +
            </button>
          )}
          <button
            onClick={() => minimizePanel(panel)}
            className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-sm flex items-center justify-center text-gray-600 text-xs"
            title="Minimiser"
          >
            −
          </button>
          <button
            onClick={() =>
              st === "maximized" ? restorePanels() : maximizePanel(panel)
            }
            className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-sm flex items-center justify-center text-gray-600 text-xs"
            title={st === "maximized" ? "Restaurer" : "Maximiser"}
          >
            {st === "maximized" ? "⧉" : "□"}
          </button>
        </div>
      </div>
    );
  };

  /* ======= Rendu d’un post-it dans l’arbre ======= */
  const renderPostIt = (p) => {
    const colors = COLORS[p.category] || COLORS.problem;
    const isEditing = editingId === p.id;
    const highlight =
      isConnecting && (connectSourceId === p.id ? "ring-4 ring-blue-400" : "ring-2 ring-green-300");

    return (
      <div
        key={p.id}
        className={`absolute select-none transition-all duration-150 ${
          isConnecting ? "cursor-pointer" : "cursor-move"
        } ${isConnecting ? highlight : ""}`}
        style={{
          left: p.x,
          top: p.y,
          width: POSTIT_W,
          height: POSTIT_H,
          zIndex: 2
        }}
        onMouseDown={(e) => handleMouseDown(e, p.id)}
        title={
          isConnecting
            ? connectSourceId
              ? "Cliquez la CIBLE"
              : "Cliquez la SOURCE"
            : "Glissez pour déplacer"
        }
      >
        <div
          className="rounded-lg p-3 shadow-lg border-2 relative overflow-hidden"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.2
          }}
        >
          {/* actions (crayon + supprimer) */}
          {mode === "moderator" && !isConnecting && (
            <div className="absolute -top-1 -right-1 flex gap-1">
              <button
                type="button"
                className="w-5 h-5 bg-black/70 text-white rounded-full text-xs flex items-center justify-center"
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
                className="w-5 h-5 bg-black/70 text-white rounded-full text-xs flex items-center justify-center"
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
              <div className="font-extrabold text-[14px] break-words whitespace-normal max-h-[54px] overflow-hidden pr-6">
                {p.content}
              </div>
              <div className="text-[11px] opacity-85 mt-1">{p.author}</div>
            </>
          ) : (
            <div className="space-y-1">
              <textarea
                className="w-full h-16 text-[14px] font-extrabold text-black rounded p-1"
                maxLength={MAX_CHARS}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEditing();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditing();
                  }
                }}
                autoFocus
              />
              <div className="text-[11px] text-white/90">
                {editingText.length}/{MAX_CHARS}
              </div>
              <div className="flex gap-2">
                <button
                  className="px-2 py-1 bg-white text-black rounded text-xs font-bold"
                  onClick={saveEditing}
                >
                  Enregistrer
                </button>
                <button
                  className="px-2 py-1 bg-black/50 text-white rounded text-xs"
                  onClick={cancelEditing}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* + parent / enfant */}
          {mode === "moderator" && !isConnecting && !isEditing && (
            <>
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
              <button
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-white text-black rounded-full text-sm font-bold shadow-md hover:bg-gray-100 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  const cat =
                    p.category === "consequences" ? "consequences" : "causes";
                  addPostItToFirebase(
                    "Nouveau",
                    cat,
                    "Modérateur",
                    p.x,
                    p.y + POSTIT_H + 16,
                    true
                  );
                }}
                title="Ajouter un enfant"
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ======= VUES ======= */

  /* ANALYSE (si ouverte directement via l’URL) */
  if (mode === "analysis") {
    return (
      <div className="min-h-screen bg-white p-2">
        <AnalysisPanel sessionId={sessionId} />
      </div>
    );
  }

  /* PARTICIPANT */
  if (mode === "participant") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-xl font-black text-gray-800 mb-1">
              🌳 Arbre à Problèmes
            </h1>
            <p className="text-gray-600 text-sm">Session: {sessionId}</p>
            {(projectName || theme) && (
              <p className="text-gray-800 font-bold mt-2">
                {projectName} {theme ? " — " + theme : ""}
              </p>
            )}
          </div>

          {!hasIdentified && (
            <div className="bg-white rounded-xl p-5 shadow-lg mb-6">
              <h2 className="text-lg font-bold mb-3">Votre nom</h2>
              <input
                type="text"
                placeholder="Entrez votre nom…"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && participantName.trim()) {
                    localStorage.setItem(
                      "participantName",
                      participantName.trim()
                    );
                    setHasIdentified(true);
                  }
                }}
                className="w-full p-3 border-2 border-gray-300 rounded-lg text-base"
                style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}
              />
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!participantName.trim()) return;
                    localStorage.setItem(
                      "participantName",
                      participantName.trim()
                    );
                    setHasIdentified(true);
                  }}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold disabled:opacity-50"
                  disabled={!participantName.trim()}
                >
                  Continuer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("participantName", "Anonyme");
                    setParticipantName("Anonyme");
                    setHasIdentified(true);
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-bold"
                >
                  Anonyme
                </button>
              </div>
            </div>
          )}

          {hasIdentified && (
            <div className="bg-white rounded-xl p-5 shadow-lg">
              <div className="mb-3">
                <label className="block text-sm font-bold mb-2">
                  Catégorie :
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {Object.keys(COLORS).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`p-3 rounded-lg font-bold text-left ${
                        selectedCategory === cat
                          ? "ring-2 ring-offset-2 ring-indigo-500"
                          : "hover:bg-gray-50"
                      }`}
                      style={{
                        backgroundColor:
                          selectedCategory === cat ? COLORS[cat].bg : "#f9fafb",
                        color:
                          selectedCategory === cat
                            ? COLORS[cat].text
                            : "#374151",
                        fontFamily: "'Arial Black', Arial, sans-serif"
                      }}
                    >
                      {cat === "problem"
                        ? "Problème central"
                        : cat === "causes"
                        ? "Causes"
                        : "Conséquences"}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={4}
                value={participantContent}
                onChange={(e) =>
                  setParticipantContent(e.target.value.slice(0, MAX_CHARS))
                }
                className="w-full p-3 border-2 border-gray-300 rounded-lg font-extrabold text-black"
                placeholder="Écrivez votre contribution…"
              />
              <div className="text-xs text-gray-500 mt-1">
                {participantContent.length}/{MAX_CHARS}
              </div>

              <button
                type="button"
                className="mt-3 w-full bg-indigo-600 text-white py-3 rounded-lg font-bold disabled:opacity-40"
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

              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                Connecté en tant que : <strong>{participantName}</strong>
                <button
                  onClick={() => {
                    setHasIdentified(false);
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

  /* SLIDES D’INTRO */
  if (showOnboarding) {
    return (
      <ArbreProblemePresentation
        sessionId={sessionId}
        onComplete={async ({ projectName: p, theme: t }) => {
          await setDoc(
            doc(db, "sessions", sessionId),
            {
              sessionId,
              projectName: p || "",
              theme: t || "",
              createdAt: serverTimestamp(),
              status: "active"
            },
            { merge: true }
          );
          setProjectName(p || "");
          setTheme(t || "");
          setShowOnboarding(false);
        }}
        defaultProjectName={projectName}
        defaultTheme={theme}
      />
    );
  }

  /* MODÉRATEUR */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header compact sur 1 ligne */}
      <div className="bg-white shadow-sm px-3 py-2 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <h1 className="text-[15px] font-black text-gray-900 whitespace-nowrap">
            🌳 Arbre à Problèmes
          </h1>

          <div className="text-[12px] text-gray-600 whitespace-nowrap">
            Session: <span className="font-semibold">{sessionId}</span>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <input
              className="px-2 py-[3px] border rounded text-[12px] font-bold"
              placeholder="Nom du projet"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                saveSessionMeta({ projectName: e.target.value });
              }}
            />
            <input
              className="px-2 py-[3px] border rounded text-[12px] font-bold"
              placeholder="Thème"
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                saveSessionMeta({ theme: e.target.value });
              }}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                setIsConnecting((v) => !v);
                setConnectSourceId(null);
              }}
              className={`px-3 py-[6px] rounded font-bold text-[12px] ${
                isConnecting
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300"
              }`}
            >
              {isConnecting ? "Mode Connexion ON" : "Connecter Post-its"}
            </button>

            <button
              onClick={startNewSession}
              className="px-3 py-[6px] bg-gray-200 text-gray-800 rounded font-bold text-[12px] hover:bg-gray-300"
            >
              Nouvelle session
            </button>

            <button
              onClick={() => {
                const url = new URL(
                  `${window.location.origin}${window.location.pathname}`
                );
                url.searchParams.set("session", sessionId);
                url.searchParams.set("mode", "analysis");
                window.open(url.toString(), "_blank");
              }}
              className="px-3 py-[6px] bg-emerald-600 text-white rounded font-bold text-[12px] hover:bg-emerald-700"
              title="Ouvrir l'analyse dans un nouvel onglet"
            >
              Analyse
            </button>

            <div className="relative">
              <button
                onClick={() => setQrOpen((v) => !v)}
                className="px-3 py-[6px] bg-gray-200 text-gray-800 rounded font-bold text-[12px] hover:bg-gray-300"
                title="Afficher/Masquer le QR participants"
              >
                QR
              </button>
              {qrOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border rounded shadow-lg p-2">
                  <div className="text-[12px] font-semibold mb-1">
                    QR participants
                  </div>
                  <QRCodeGenerator value={participantUrl} />
                  <div className="text-[10px] break-all mt-1 text-gray-500">
                    {participantUrl}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Corps : grille + panneau arbre maximum */}
      <div className="max-w-7xl mx-auto p-2 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-56px)]">
        {/* Causes */}
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "causes",
            "col-span-3 row-span-10"
          )}`}
        >
          <PanelHeader
            title="📝 Causes"
            color={COLORS.causes.bg}
            panel="causes"
            onAdd={() =>
              addPostItToFirebase("Nouvelle cause", "causes", "Modérateur")
            }
          />
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {postIts
              .filter((p) => p.category === "causes" && !p.isInTree)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-2 rounded-lg shadow-sm border-2 group relative cursor-default select-none"
                  style={{
                    backgroundColor: COLORS.causes.bg,
                    color: COLORS.causes.text,
                    borderColor: COLORS.causes.border,
                    fontFamily: "'Arial Black', Arial, sans-serif"
                  }}
                >
                  <div className="font-extrabold text-[13px] break-words">
                    {p.content}
                  </div>
                  <div className="text-[11px] opacity-85">{p.author}</div>
                </div>
              ))}
          </div>
        </div>

        {/* Arbre */}
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "tree",
            "col-span-6 row-span-12"
          )}`}
        >
          <PanelHeader title="🌳 Arbre à Problèmes" color="#374151" panel="tree" />
          {/* Outils de zoom */}
          <div className="px-2 py-1 border-b flex items-center gap-2 text-[12px]">
            <button
              className="px-2 py-[4px] bg-gray-200 rounded hover:bg-gray-300"
              onClick={zoomOut}
            >
              −
            </button>
            <button
              className="px-2 py-[4px] bg-gray-200 rounded hover:bg-gray-300"
              onClick={zoomIn}
            >
              +
            </button>
            <button
              className="px-2 py-[4px] bg-gray-200 rounded hover:bg-gray-300"
              onClick={zoomReset}
            >
              100%
            </button>
            <button
              className="px-2 py-[4px] bg-gray-200 rounded hover:bg-gray-300"
              onClick={zoomFit}
            >
              Ajuster
            </button>
            <span className="text-gray-500 ml-2">{Math.round(zoom * 100)}%</span>
            <span className="ml-auto text-gray-400">
              Astuce: Ctrl/⌘ + molette pour zoomer
            </span>
          </div>

          <div
            ref={treeScrollRef}
            className="flex-1 overflow-auto relative"
            onWheel={onWheel}
          >
            {/* Zone scrollable (grande) */}
            <div
              ref={treeAreaRef}
              className="relative"
              style={{
                width: 4000,
                height: 2500
              }}
            >
              {/* Canvas zoomé */}
              <div
                ref={treeCanvasRef}
                className="absolute top-0 left-0 origin-top-left"
                style={{
                  width: 4000,
                  height: 2500,
                  transform: `scale(${zoom})`
                }}
              >
                {/* SVG connections */}
                <svg
                  className="absolute inset-0 w-[4000px] h-[2500px] pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                    </marker>
                  </defs>
                  {renderConnections()}
                </svg>

                {/* Post-its */}
                {postIts.filter((p) => p.isInTree).map(renderPostIt)}
              </div>
            </div>
          </div>
        </div>

        {/* Conséquences */}
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "consequences",
            "col-span-3 row-span-10"
          )}`}
        >
          <PanelHeader
            title="📈 Conséquences"
            color={COLORS.consequences.bg}
            panel="consequences"
            onAdd={() =>
              addPostItToFirebase(
                "Nouvelle conséquence",
                "consequences",
                "Modérateur"
              )
            }
          />
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {postIts
              .filter((p) => p.category === "consequences" && !p.isInTree)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-2 rounded-lg shadow-sm border-2 group relative cursor-default select-none"
                  style={{
                    backgroundColor: COLORS.consequences.bg,
                    color: COLORS.consequences.text,
                    borderColor: COLORS.consequences.border,
                    fontFamily: "'Arial Black', Arial, sans-serif"
                  }}
                >
                  <div className="font-extrabold text-[13px] break-words">
                    {p.content}
                  </div>
                  <div className="text-[11px] opacity-85">{p.author}</div>
                </div>
              ))}
          </div>
        </div>

        {/* Problèmes suggérés */}
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "problems",
            "col-span-12 row-span-2"
          )}`}
        >
          <PanelHeader
            title="🎯 Problèmes Suggérés"
            color={COLORS.problem.bg}
            panel="problems"
            onAdd={() =>
              addPostItToFirebase("Nouveau problème", "problem", "Modérateur")
            }
          />
          <div className="flex-1 overflow-x-auto p-2 flex gap-2">
            {postIts
              .filter((p) => p.category === "problem" && !p.isInTree)
              .map((p) => (
                <div
                  key={p.id}
                  className="p-2 rounded-lg shadow-sm border-2 group relative min-w-[240px] select-none"
                  style={{
                    backgroundColor: COLORS.problem.bg,
                    color: COLORS.problem.text,
                    borderColor: COLORS.problem.border,
                    fontFamily: "'Arial Black', Arial, sans-serif"
                  }}
                >
                  <div className="font-extrabold text-[13px] break-words">
                    {p.content}
                  </div>
                  <div className="text-[11px] opacity-85">{p.author}</div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

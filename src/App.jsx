// App.jsx  —  UTF-8

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
import ArbreProblemePresentation from "./components/ArbreProblemePresentation.jsx";

// PDF export
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* ==================== Constantes UI ==================== */
const COLORS = {
  problem: { bg: "#ef4444", text: "#ffffff", border: "#dc2626" },
  causes: { bg: "#fb7185", text: "#ffffff", border: "#f43f5e" },
  consequences: { bg: "#22c55e", text: "#ffffff", border: "#16a34a" },
};

const POSTIT_W = 220;
const POSTIT_H = 90;

const CATEGORY_LABELS = {
  problem: "Problème Central",
  causes: "Causes",
  consequences: "Conséquences",
};

/* États des panneaux: minimized | normal | maximized */
const defaultPanelStates = {
  causes: "normal",
  tree: "normal",
  consequences: "normal",
  problems: "normal",
};

/* ==================== App ==================== */
export default function App() {
  /* Mode & session */
  const [mode, setMode] = useState("moderator"); // "moderator" | "participant"
  const [sessionId, setSessionId] = useState("PROBLEM-TREE-2025");

  /* Données Firestore */
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]);

  /* États UI */
  const [panelStates, setPanelStates] = useState(defaultPanelStates);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState(null);

  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  /* Édition */
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
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");

  /* Brainstorm / palette couleurs */
  const [currentBrushColor, setCurrentBrushColor] = useState(null); // couleur appliquée aux nouveaux post-its
  const palette = ["#ef4444", "#fb923c", "#f59e0b", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#111827"];

  /* Zoom/pan sur l’arbre uniquement */
  const [zoom, setZoom] = useState(1); // 0.5 - 2
  const minZoom = 0.5;
  const maxZoom = 2;

  /* Refs */
  const treeScrollRef = useRef(null); // conteneur scrollable
  const treeInnerRef = useRef(null);  // contenu zoomé
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
    setShowOnboarding(false); // on reste côté modérateur
    setZoom(1);

    try {
      await setDoc(
        doc(db, "sessions", id),
        { sessionId: id, createdAt: serverTimestamp(), status: "active" },
        { merge: true }
      );
    } catch {}
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
    const ref = doc(db, "sessions", sessionId);
    getDoc(ref)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProjectName(data.projectName || "");
          setTheme(data.theme || "");
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true); // première fois, affiche slides
        }
      })
      .catch(() => setShowOnboarding(true));
  }, [sessionId]);

  /* --------- Listeners Firestore --------- */
  useEffect(() => {
    if (!sessionId) return;

    // Post-its (sans orderBy pour éviter index — tri côté client)
    const qP = query(collection(db, "postits"), where("sessionId", "==", sessionId));
    const unsubP = onSnapshot(qP, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
      setPostIts(arr);
    });

    // Connexions
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

  /* --------- Créer le central automatique --------- */
  useEffect(() => {
    if (!sessionId) return;
    const centralId = `${sessionId}-central`;
    const ref = doc(db, "postits", centralId);
    getDoc(ref).then((snap) => {
      if (!snap.exists()) {
        setDoc(ref, {
          sessionId,
          content: "Problème central non connu",
          author: "Modérateur",
          category: "problem",
          x: 420,
          y: 260,
          isInTree: true,
          isCentral: true,
          childIds: [],
          timestamp: serverTimestamp(),
          customColor: null,
        }).catch(() => {});
      }
    });
  }, [sessionId]);

  /* --------- Slides -> onComplete --------- */
  const handleOnboardingComplete = async ({ projectName: p, theme: t }) => {
    try {
      await setDoc(
        doc(db, "sessions", sessionId),
        { sessionId, projectName: p || "", theme: t || "", createdAt: serverTimestamp(), status: "active" },
        { merge: true }
      );
    } catch {}
    setProjectName(p || "");
    setTheme(t || "");
    setShowOnboarding(false);
  };

  /* ==================== CRUD Post-its ==================== */

  const clamp50 = (txt) => {
    if (!txt) return "";
    const clean = txt.replace(/\s+/g, " ").trim();
    return clean.length > 50 ? clean.slice(0, 50) + "…" : clean;
  };

  const addPostItToFirebase = async (
    content,
    category,
    author,
    x = null,
    y = null,
    isInTree = false
  ) => {
    const text = clamp50(content);
    if (!text) return;

    // positions par défaut (bords)
    const defaults = {
      causes: { x: 40, y: Math.random() * 140 + 60 },
      consequences: { x: 860, y: Math.random() * 140 + 60 },
      problem: { x: 420, y: Math.random() * 140 + 60 },
    };
    const pos = x !== null ? { x, y } : defaults[category] || defaults.problem;

    try {
      await addDoc(collection(db, "postits"), {
        sessionId,
        content: text,
        author,
        category,
        x: pos.x,
        y: pos.y,
        isInTree,
        isCentral: false,
        childIds: [],
        timestamp: serverTimestamp(),
        customColor: currentBrushColor || null,
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
    if (id === `${sessionId}-central`) return; // protège le central
    try {
      await deleteDoc(doc(db, "postits", id));
      // supprimer connexions liées
      const rel = connections.filter((c) => c.fromId === id || c.toId === id);
      await Promise.all(rel.map((c) => deleteDoc(doc(db, "connections", c.id))));
    } catch (e) {
      console.error(e);
    }
  };

  /* ==================== Drag & Drop ==================== */
  const handleMouseDown = (e, postItId) => {
    if (mode !== "moderator") return;
    e.preventDefault();

    // En mode connexion, on traite en clic (source/cible)
    if (isConnecting) {
      if (!connectSourceId) {
        setConnectSourceId(postItId);
      } else if (connectSourceId && connectSourceId !== postItId) {
        // créer la connexion
        addDoc(collection(db, "connections"), {
          sessionId,
          fromId: connectSourceId,
          toId: postItId,
          createdAt: serverTimestamp(),
        }).catch(console.error);
        setConnectSourceId(null);
        // on garde le mode connexion ON pour enchaîner si besoin
      } else {
        // même id -> annule source
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
      // calcul dans le système de coordonnées non-zoomées :
      const scrollEl = treeScrollRef.current;
      const innerEl = treeInnerRef.current;
      if (!scrollEl || !innerEl) return;

      const rect = innerEl.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();

      // position relative au conteneur scrollable + compensation zoom
      const relX = (e.clientX - scrollRect.left + scrollEl.scrollLeft) / zoom;
      const relY = (e.clientY - scrollRect.top + scrollEl.scrollTop) / zoom;

      const newX = Math.max(0, Math.min(innerEl.offsetWidth - POSTIT_W, relX - dragOffset.x));
      const newY = Math.max(0, Math.min(innerEl.offsetHeight - POSTIT_H, relY - dragOffset.y));

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

  /* ==================== Edition ==================== */
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
    await updatePostItInFirebase(editingId, { content: clamp50(editingText) });
    cancelEditing();
  };

  /* ==================== Connexions (SVG) ==================== */
  const renderConnections = () => {
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    const lines = [];

    connections.forEach((c) => {
      const a = byId[c.fromId];
      const b = byId[c.toId];
      if (!a || !b) return;
      lines.push({ from: a, to: b, id: c.id });
    });

    return lines.map((ln) => {
      const x1 = (ln.from.x || 0) + POSTIT_W / 2;
      const y1 = (ln.from.y || 0) + POSTIT_H / 2;
      const x2 = (ln.to.x || 0) + POSTIT_W / 2;
      const y2 = (ln.to.y || 0) + POSTIT_H / 2;

      // angle droit « harmonieux »
      const midY = y1 + (y2 - y1) / 2;

      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

      return (
        <path
          key={ln.id}
          d={d}
          fill="none"
          stroke="#374151"
          strokeWidth="3"
          markerEnd="url(#arrowhead)"
          opacity="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });
  };

  /* ==================== Panneaux Windows-style ==================== */
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
    if (st === "minimized") return "col-span-1 row-span-1 min-h-[40px]";
    return base;
  };

  const PanelHeader = ({ title, color, panel, onAdd }) => {
    const st = panelStates[panel];
    return (
      <div className="flex items-center justify-between p-2 border-b bg-gradient-to-r from-blue-50 to-blue-100 border-gray-300">
        <h3 className="font-black text-sm flex-1" style={{ color }}>
          {st === "minimized" ? title.split(" ")[0] : title}
        </h3>
        <div className="flex items-center gap-2">
          {st !== "minimized" && (
            <button
              onClick={onAdd}
              className="w-7 h-7 bg-indigo-600 text-white rounded text-sm font-extrabold hover:bg-indigo-700 flex items-center justify-center"
              title="Ajouter post-it"
            >
              +
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => minimizePanel(panel)}
              className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-sm flex items-center justify-center text-gray-700 text-sm font-bold"
              title="Minimiser"
            >
              –
            </button>
            <button
              onClick={() => (st === "maximized" ? restorePanels() : maximizePanel(panel))}
              className="w-7 h-7 bg-gray-200 hover:bg-gray-300 rounded-sm flex items-center justify-center text-gray-700 text-sm font-bold"
              title={st === "maximized" ? "Restaurer" : "Maximiser"}
            >
              {st === "maximized" ? "⧉" : "□"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ==================== Rendu Post-it (arbre) ==================== */
  const renderPostIt = (p) => {
    const baseColors = COLORS[p.category] || COLORS.problem;
    const bg = p.customColor || baseColors.bg;
    const text = "#ffffff";
    const border = p.customColor ? p.customColor : baseColors.border;
    const highlight =
      isConnecting && (connectSourceId === p.id ? "ring-4 ring-blue-400" : "ring-2 ring-green-300");

    return (
      <div
        key={p.id}
        className={`absolute select-none transition-all duration-150 ${
          isConnecting ? "cursor-pointer" : "cursor-move"
        } ${isConnecting ? highlight : ""}`}
        style={{ left: p.x, top: p.y, width: POSTIT_W, height: POSTIT_H, zIndex: 2 }}
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
            backgroundColor: bg,
            color: text,
            borderColor: border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.2,
          }}
        >
          {/* actions (crayon + supprimer + couleur) */}
          {mode === "moderator" && !isConnecting && (
            <div className="absolute -top-1 -right-1 flex gap-1">
              <button
                type="button"
                className="w-6 h-6 bg-black/70 text-white rounded-full text-[10px] flex items-center justify-center"
                title="Modifier"
                onClick={(ev) => {
                  ev.stopPropagation();
                  startEditing(p);
                }}
              >
                ✎
              </button>
              {p.isCentral !== true && (
                <button
                  type="button"
                  className="w-6 h-6 bg-black/70 text-white rounded-full text-[12px] flex items-center justify-center"
                  title="Supprimer"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    deletePostItFromFirebase(p.id);
                  }}
                >
                  ×
                </button>
              )}
              {/* pastille couleur */}
              <button
                type="button"
                className="w-6 h-6 rounded-full border-2 border-white"
                style={{ background: p.customColor || "#00000033" }}
                title="Appliquer couleur de la palette"
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (!currentBrushColor) return;
                  updatePostItInFirebase(p.id, { customColor: currentBrushColor });
                }}
              />
            </div>
          )}

          {/* contenu */}
          <div
            className="font-black text-[14px] leading-tight break-words whitespace-normal max-h-[54px] overflow-hidden pr-7"
            style={{ textShadow: "0 1px 0 rgba(0,0,0,0.15)" }}
          >
            {p.content}
          </div>
          <div className="text-[11px] opacity-90 mt-1">Modérateur</div>

          {/* + parent haut */}
          {mode === "moderator" && !isConnecting && (
            <button
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-white text-black rounded-full text-sm font-bold shadow-md hover:bg-gray-100 flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                const cat = p.category === "causes" ? "causes" : "consequences";
                addPostItToFirebase("Nouveau", cat, "Modérateur", p.x, Math.max(0, p.y - POSTIT_H - 16), true);
              }}
              title="Ajouter un parent"
            >
              +
            </button>
          )}

          {/* + enfant bas */}
          {mode === "moderator" && !isConnecting && (
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

  /* ==================== Export PDF (arbre) ==================== */
  const exportPdf = async () => {
    // capture uniquement la zone arbre (contenu zoomé normalisé à 1)
    const scrollEl = treeScrollRef.current;
    const innerEl = treeInnerRef.current;
    if (!scrollEl || !innerEl) return;

    // pour l’export on force le scale à 1 visuellement
    const prev = innerEl.style.transform;
    innerEl.style.transform = "scale(1)";

    const canvas = await html2canvas(innerEl, { backgroundColor: "#ffffff", scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // fit to page
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const imgW = canvas.width * ratio;
    const imgH = canvas.height * ratio;
    const dx = (pageW - imgW) / 2;
    const dy = (pageH - imgH) / 2;

    pdf.addImage(imgData, "PNG", dx, dy, imgW, imgH);
    pdf.save(`arbre-${sessionId}.pdf`);

    innerEl.style.transform = prev; // restore
  };

  /* ==================== Vues ==================== */

  /* Participant */
  if (mode === "participant") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-gray-800 mb-1">🌳 Arbre à Problèmes</h1>
            <p className="text-gray-600 text-sm">Session: {sessionId}</p>
            {(projectName || theme) && (
              <p className="text-gray-800 font-black mt-2 text-lg">
                {projectName} {theme ? " — " + theme : ""}
              </p>
            )}
          </div>

          {!participantName && (
            <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
              <h2 className="text-lg font-bold mb-4">Votre nom</h2>
              <input
                type="text"
                placeholder="Entrez votre nom…"
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg"
                style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}
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
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-bold"
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

              <textarea
                rows={5}
                value={participantContent}
                onChange={(e) => setParticipantContent(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg"
                placeholder="Écrivez votre contribution… (50 caractères max)"
                maxLength={50}
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

  /* Slides d’intro */
  if (showOnboarding) {
    return (
      <ArbreProblemePresentation
        sessionId={sessionId}
        onComplete={handleOnboardingComplete}
        defaultProjectName={projectName}
        defaultTheme={theme}
      />
    );
  }

  /* Modérateur */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Bandeau top — titres plus visibles */}
      <div className="bg-white shadow-sm px-4 pt-3 pb-2 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          <div className="flex justify-between items-start gap-6">
            <div className="flex-1">
              <h1 className="text-2xl font-black text-gray-900">🌳 Arbre à Problèmes Collaboratif</h1>
              <p className="text-gray-600">Session: {sessionId}</p>

              {/* Projet / Thème en très visible */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Nom du projet</label>
                  <input
                    className="px-3 py-2 border rounded w-full text-lg font-black"
                    placeholder="Nom du projet"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onBlur={async () => {
                      await setDoc(doc(db, "sessions", sessionId), { projectName }, { merge: true });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Thème</label>
                  <input
                    className="px-3 py-2 border rounded w-full text-lg font-black"
                    placeholder="Thème"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    onBlur={async () => {
                      await setDoc(doc(db, "sessions", sessionId), { theme }, { merge: true });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Outils à droite */}
            <div className="flex items-start gap-3">
              {/* Palette couleurs (brainstorm simple) */}
              <div className="bg-white border rounded-lg p-2 shadow-sm">
                <div className="text-xs font-bold mb-1 text-gray-700">Palette</div>
                <div className="flex flex-wrap gap-1 w-[132px]">
                  {palette.map((c) => (
                    <button
                      key={c}
                      className={`w-6 h-6 rounded ${currentBrushColor === c ? "ring-2 ring-black" : ""}`}
                      style={{ background: c }}
                      onClick={() => setCurrentBrushColor((prev) => (prev === c ? null : c))}
                      title="Sélectionner la couleur"
                    />
                  ))}
                </div>
                <div className="text-[10px] mt-1 text-gray-600">Appliquée aux nouveaux post-its et via la pastille d’un post-it.</div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConnecting((v) => !v);
                    setConnectSourceId(null);
                  }}
                  className={`px-3 py-2 rounded font-bold transition ${
                    isConnecting ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                  }`}
                >
                  🔗 {isConnecting ? "Mode Connexion ON" : "Connecter Post-its"}
                </button>

                <button
                  type="button"
                  onClick={newSession}
                  className="px-3 py-2 rounded font-bold bg-gray-200 text-gray-800 hover:bg-gray-300"
                >
                  Nouvelle session
                </button>

                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3 py-2 rounded font-bold bg-gray-200 text-gray-800 hover:bg-gray-300"
                >
                  Purger session
                </button>

                <button
                  type="button"
                  onClick={exportPdf}
                  className="px-3 py-2 rounded font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  ⤓ Export PDF
                </button>

                {/* QR compact — clic pour ouvrir la vraie carte QR */}
                <details className="bg-white border rounded p-2 shadow-sm">
                  <summary className="text-xs font-bold cursor-pointer">QR participants</summary>
                  <div className="pt-2">
                    <QRCodeGenerator url={participantUrl} />
                    <div className="text-[10px] break-all mt-1">{participantUrl}</div>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* Barre de zoom dédiée à l’arbre */}
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => setZoom((z) => Math.max(minZoom, +(z - 0.1).toFixed(2)))}
            >
              −
            </button>
            <div className="px-3 py-1 bg-white border rounded text-sm font-bold">{Math.round(zoom * 100)}%</div>
            <button
              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => setZoom((z) => Math.min(maxZoom, +(z + 0.1).toFixed(2)))}
            >
              +
            </button>
            <button
              className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
              onClick={() => setZoom(1)}
            >
              100%
            </button>
            <span className="text-xs text-gray-600 ml-2">Astuce : utilisez l’ascenseur pour parcourir l’arbre.</span>
          </div>
        </div>
      </div>

      {/* Grille principale */}
      <div className="max-w-7xl mx-auto p-4 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-190px)]">
        {/* Causes */}
        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses("causes", "col-span-3 row-span-9")}`}>
          <PanelHeader
            title="📝 Causes"
            color={COLORS.causes.bg}
            panel="causes"
            onAdd={() => addPostItToFirebase("Nouvelle cause", "causes", "Modérateur")}
          />
          {panelStates.causes !== "minimized" && (
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="space-y-3">
                {postIts.filter((p) => p.category === "causes" && !p.isInTree).map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg cursor-move shadow-sm border-2 group relative"
                    style={{
                      backgroundColor: p.customColor || COLORS.causes.bg,
                      color: "#fff",
                      borderColor: p.customColor || COLORS.causes.border,
                      fontFamily: "'Arial Black', Arial, sans-serif",
                    }}
                    onMouseDown={(e) => handleMouseDown(e, p.id)}
                  >
                    <div className="font-black text-[14px]">{p.content}</div>
                    <div className="text-[11px] mt-1 opacity-90">{p.author}</div>
                    {!isConnecting && (
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePostItFromFirebase(p.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Arbre central (zoom/pan applicqués ici seulement) */}
        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses("tree", "col-span-6 row-span-9")}`}>
          <PanelHeader title="🌳 Arbre à Problèmes" color="#374151" panel="tree" onAdd={() => {}} />
          {panelStates.tree !== "minimized" && (
            <div
              ref={treeScrollRef}
              className="flex-1 relative overflow-auto bg-[linear-gradient(90deg,#f3f4f6_1px,transparent_1px),linear-gradient(#f3f4f6_1px,transparent_1px)] bg-[size:20px_20px]"
            >
              {/* Contenu zoomé */}
              <div
                ref={treeInnerRef}
                className="relative w-[1600px] h-[1200px] origin-top-left"
                style={{ transform: `scale(${zoom})` }}
              >
                {/* SVG connexions */}
                <svg
                  ref={svgRef}
                  className="absolute inset-0 w-[1600px] h-[1200px] pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                    </marker>
                  </defs>
                  {renderConnections()}
                </svg>

                {/* Post-its */}
                {postIts.filter((p) => p.isInTree).map(renderPostIt)}
              </div>
            </div>
          )}
        </div>

        {/* Conséquences */}
        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses("consequences", "col-span-3 row-span-9")}`}>
          <PanelHeader
            title="📈 Conséquences"
            color={COLORS.consequences.bg}
            panel="consequences"
            onAdd={() => addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur")}
          />
          {panelStates.consequences !== "minimized" && (
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="space-y-3">
                {postIts.filter((p) => p.category === "consequences" && !p.isInTree).map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg cursor-move shadow-sm border-2 group relative"
                    style={{
                      backgroundColor: p.customColor || COLORS.consequences.bg,
                      color: "#fff",
                      borderColor: p.customColor || COLORS.consequences.border,
                      fontFamily: "'Arial Black', Arial, sans-serif",
                    }}
                    onMouseDown={(e) => handleMouseDown(e, p.id)}
                  >
                    <div className="font-black text-[14px]">{p.content}</div>
                    <div className="text-[11px] mt-1 opacity-90">{p.author}</div>
                    {!isConnecting && (
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePostItFromFirebase(p.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Problèmes suggérés */}
        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses("problems", "col-span-12 row-span-3")}`}>
          <PanelHeader
            title="🎯 Problèmes Suggérés"
            color={COLORS.problem.bg}
            panel="problems"
            onAdd={() => addPostItToFirebase("Nouveau problème", "problem", "Modérateur")}
          />
          {panelStates.problems !== "minimized" && (
            <div className="flex-1 p-3 overflow-x-auto">
              <div className="flex gap-3">
                {postIts.filter((p) => p.category === "problem" && !p.isInTree).map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg cursor-move shadow-sm border-2 flex-shrink-0 min-w-[220px] group relative"
                    style={{
                      backgroundColor: p.customColor || COLORS.problem.bg,
                      color: "#fff",
                      borderColor: p.customColor || COLORS.problem.border,
                      fontFamily: "'Arial Black', Arial, sans-serif",
                    }}
                    onMouseDown={(e) => handleMouseDown(e, p.id)}
                  >
                    <div className="font-black text-[14px]">{p.content}</div>
                    <div className="text-[11px] mt-1 opacity-90">{p.author}</div>
                    {!isConnecting && (
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePostItFromFirebase(p.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modale édition simple */}
      {editingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 w-[480px] shadow-2xl">
            <h3 className="font-black text-lg mb-2">Modifier le post-it</h3>
            <textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              className="w-full h-28 border rounded p-2"
              maxLength={50}
              placeholder="50 caractères max"
            />
            <div className="text-xs text-gray-500 mt-1 text-right">{editingText.length}/50</div>
            <div className="flex justify-end gap-2 mt-3">
              <button className="px-3 py-2 bg-gray-200 rounded" onClick={cancelEditing}>
                Annuler
              </button>
              <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={saveEditing}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

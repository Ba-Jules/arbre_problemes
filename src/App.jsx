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
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase-config";

import QRCodeGenerator from "./components/QRCodeGenerator.jsx";
import ArbreProblemePresentation from "./components/ArbreProblemePresentation.jsx";

/* ---------- Styles & Constantes ---------- */
const COLORS = {
  problem: { bg: "#FF6B6B", text: "#FFFFFF", border: "#CC5252" },       // Rouge
  causes: { bg: "#FFB6A6", text: "#1F2937", border: "#E08C7A" },        // Saumon
  consequences: { bg: "#A7F3D0", text: "#065F46", border: "#6EE7B7" },  // Vert
};

const POSTIT_W = 220;
const POSTIT_H = 82;

export default function App() {
  /* ---------- Mode / Session ---------- */
  const [mode, setMode] = useState("moderator");
  const [sessionId, setSessionId] = useState("PROBLEM-TREE-2025");

  /* ---------- Données ---------- */
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]);

  /* ---------- UI ---------- */
  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [panelStates, setPanelStates] = useState({
    causes: "normal",
    problems: "normal",
    consequences: "normal",
  });

  const [isConnecting, setIsConnecting] = useState(false);

  // Édition
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  /* ---------- Métadonnées session ---------- */
  const [projectName, setProjectName] = useState("");
  const [theme, setTheme] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  /* ---------- Participant ---------- */
  const [participantName, setParticipantName] = useState(
    () => localStorage.getItem("participantName") || ""
  );
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");

  /* ---------- Refs ---------- */
  const treeAreaRef = useRef(null);
  const svgRef = useRef(null);

  /* ---------- URL participant ---------- */
  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  /* ---------- Helpers ---------- */
  const generateSessionId = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `PROBLEM-TREE-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate()
    )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const navigateToSession = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    window.history.replaceState({}, "", url.toString());
    setSessionId(id);
  };

  const newSession = async () => {
    const id = generateSessionId();
    setPostIts([]);
    setConnections([]);
    setProjectName("");
    setTheme("");
    setShowOnboarding(true);
    navigateToSession(id);
  };

  const purgeCurrentSession = async () => {
    if (!sessionId) return;
    if (!confirm(`Supprimer toutes les données de la session "${sessionId}" ?`))
      return;
    try {
      // /postits
      const q1 = query(collection(db, "postits"), where("sessionId", "==", sessionId));
      const snap1 = await getDocs(q1);
      await Promise.allSettled(snap1.docs.map((d) => deleteDoc(doc(db, "postits", d.id))));

      // /connections
      const q2 = query(collection(db, "connections"), where("sessionId", "==", sessionId));
      const snap2 = await getDocs(q2);
      await Promise.allSettled(snap2.docs.map((d) => deleteDoc(doc(db, "connections", d.id))));

      // /sessions
      await deleteDoc(doc(db, "sessions", sessionId)).catch(() => {});

      // /postits/{central}
      await deleteDoc(doc(db, "postits", `${sessionId}-central`)).catch(() => {});

      setPostIts([]);
      setConnections([]);
      setProjectName("");
      setTheme("");
      setShowOnboarding(true);
    } catch (e) {
      console.error("Purge error:", e);
      alert("Impossible de purger la session.");
    }
  };

  const showIntro = () => setShowOnboarding(true);
  const toggleConnectionMode = () => setIsConnecting((v) => !v);

  /* ---------- URL params ---------- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const s = params.get("session");
    if (m === "participant") setMode("participant");
    if (s) setSessionId(s);
  }, []);

  /* ---------- Charger métadonnées de session ---------- */
  useEffect(() => {
    if (!sessionId) return;
    const sessionDoc = doc(db, "sessions", sessionId);
    getDoc(sessionDoc)
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProjectName(data.projectName || "");
          setTheme(data.theme || "");
          setShowOnboarding(false);
        } else {
          setShowOnboarding(true);
        }
      })
      .catch(() => setShowOnboarding(true));
  }, [sessionId]);

  /* ---------- Listeners Firestore (sans orderBy => plus d’index requis) ---------- */
  useEffect(() => {
    if (!sessionId) return;

    const q1 = query(collection(db, "postits"), where("sessionId", "==", sessionId));
    const unsub1 = onSnapshot(q1, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      // tri local par timestamp (si présent)
      items.sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() ?? 0;
        const tb = b.timestamp?.toMillis?.() ?? 0;
        return ta - tb;
      });
      setPostIts(items);
    });

    const q2 = query(collection(db, "connections"), where("sessionId", "==", sessionId));
    const unsub2 = onSnapshot(q2, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      setConnections(items);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [sessionId]);

  /* ---------- Central unique ---------- */
  useEffect(() => {
    if (!sessionId) return;
    const centralId = `${sessionId}-central`;
    const ref = doc(db, "postits", centralId);
    getDoc(ref).then((snap) => {
      if (!snap.exists()) {
        setDoc(ref, {
          sessionId,
          content: "Cliquez pour définir le problème central",
          author: "Modérateur",
          category: "problem",
          x: 380,
          y: 280,
          isInTree: true,
          isCentral: true,
          childIds: [],
          timestamp: serverTimestamp(),
        }).catch(() => {});
      }
    });
  }, [sessionId]);

  /* ---------- Onboarding complete ---------- */
  const handleOnboardingComplete = async ({ projectName: p, theme: t }) => {
    const sessionDoc = doc(db, "sessions", sessionId);
    try {
      await setDoc(
        sessionDoc,
        {
          sessionId,
          projectName: p || "",
          theme: t || "",
          createdAt: serverTimestamp(),
          status: "active",
        },
        { merge: true }
      );
      setProjectName(p || "");
      setTheme(t || "");
      setShowOnboarding(false);
    } catch (e) {
      console.error("Erreur enregistrement session:", e);
      setShowOnboarding(false);
    }
  };

  /* ---------- CRUD Post-its ---------- */
  const addPostItToFirebase = async (
    content,
    category,
    author,
    x = null,
    y = null,
    isInTree = false
  ) => {
    if (!content?.trim()) return;

    const defaults = {
      causes: { x: 40, y: Math.random() * 140 + 60 },
      consequences: { x: 760, y: Math.random() * 140 + 60 },
      problem: { x: 380, y: Math.random() * 140 + 60 },
    };
    const pos = x !== null ? { x, y } : defaults[category] || defaults.problem;

    try {
      await addDoc(collection(db, "postits"), {
        sessionId,
        content: content.trim(),
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
      console.error("Erreur ajout post-it:", e);
      alert("⚠️ Impossible d’ajouter le post-it.");
    }
  };

  const updatePostItInFirebase = async (id, fields) => {
    try {
      await updateDoc(doc(db, "postits", id), fields);
    } catch (e) {
      console.error("Erreur update post-it:", e);
    }
  };

  const deletePostItFromFirebase = async (id) => {
    if (id === `${sessionId}-central`) return; // Protège le central
    try {
      await deleteDoc(doc(db, "postits", id));
      const related = connections.filter((c) => c.fromId === id || c.toId === id);
      for (const conn of related) {
        await deleteDoc(doc(db, "connections", conn.id));
      }
    } catch (e) {
      console.error("Erreur suppression post-it:", e);
    }
  };

  /* ---------- Drag & Drop ---------- */
  const handleMouseDown = (e, postItId) => {
    if (mode !== "moderator") return;
    e.preventDefault();
    setSelectedPostIt(postItId);
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !selectedPostIt) return;
      const treeArea = treeAreaRef.current;
      if (!treeArea) return;

      const rect = treeArea.getBoundingClientRect();
      const newX = Math.max(0, Math.min(rect.width - POSTIT_W, e.clientX - rect.left - dragOffset.x));
      const newY = Math.max(0, Math.min(rect.height - POSTIT_H, e.clientY - rect.top - dragOffset.y));

      setPostIts((prev) =>
        prev.map((p) =>
          p.id === selectedPostIt ? { ...p, x: newX, y: newY, isInTree: true } : p
        )
      );
      updatePostItInFirebase(selectedPostIt, { x: newX, y: newY, isInTree: true });
    },
    [isDragging, selectedPostIt, dragOffset.x, dragOffset.y]
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

  /* ---------- Édition (double-clic) ---------- */
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
    await updatePostItInFirebase(editingId, { content: editingText.trim() });
    cancelEditing();
  };

  /* ---------- Rendus ---------- */
  const renderPostIt = (postIt) => {
    const colors = COLORS[postIt.category] || COLORS.problem;
    return (
      <div
        key={postIt.id}
        className="absolute cursor-move select-none"
        style={{
          left: postIt.x,
          top: postIt.y,
          width: POSTIT_W,
          height: POSTIT_H,
          zIndex: 2,
        }}
        onMouseDown={(e) => handleMouseDown(e, postIt.id)}
        onDoubleClick={() => startEditing(postIt)}
        title={mode === "moderator" ? "Double-clic pour éditer" : ""}
      >
        <div
          className="rounded-lg p-2.5 shadow-lg border-2 relative overflow-hidden"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.1,
          }}
        >
          {isConnecting && (
            <div className="absolute -top-1 -left-1 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">
              🔗
            </div>
          )}

          <div className="font-bold text-[13px] break-words whitespace-normal">
            {postIt.content}
          </div>

          <div className="text-[10px] opacity-80 mt-1">{postIt.author}</div>

          {mode === "moderator" && (
            <button
              type="button"
              className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs"
              onClick={(ev) => {
                ev.stopPropagation();
                deletePostItFromFirebase(postIt.id);
              }}
              title="Supprimer"
            >
              ×
            </button>
          )}

          {mode === "moderator" &&
            (postIt.category === "causes" || postIt.category === "consequences") && (
              <button
                type="button"
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  addPostItToFirebase(
                    "Nouveau",
                    postIt.category,
                    "Modérateur",
                    postIt.x,
                    postIt.y + POSTIT_H + 16,
                    true
                  );
                }}
              >
                + Ajouter
              </button>
            )}
        </div>
      </div>
    );
  };

  const renderConnections = () => {
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    const lines = [];

    postIts.forEach((p) => {
      (p.childIds || []).forEach((childId) => {
        const a = p;
        const b = byId[childId];
        if (!a || !b) return;
        lines.push({ from: a, to: b });
      });
    });

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
      const midX = (x1 + x2) / 2;
      const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      return (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#374151"
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
          opacity="0.95"
        />
      );
    });
  };

  /* ---------- UI Participant ---------- */
  if (mode === "participant") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-gray-800 mb-1">🌳 Arbre à Problèmes</h1>
            <p className="text-gray-600 text-sm">Session: {sessionId}</p>
            {(projectName || theme) && (
              <p className="text-gray-700 font-bold mt-2">
                {projectName} {theme ? "— " + theme : ""}
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
                    localStorage.setItem("participantName", participantName);
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
                <label className="block text-sm font-bold mb-2">Catégorie</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg font-bold"
                >
                  <option value="problem">Problème central</option>
                  <option value="causes">Cause</option>
                  <option value="consequences">Conséquence</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">Votre post-it</label>
                <textarea
                  rows={4}
                  value={participantContent}
                  onChange={(e) => setParticipantContent(e.target.value)}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg"
                  placeholder="Saisissez votre idée…"
                />
              </div>

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
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- Onboarding ---------- */
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

  /* ---------- Modérateur ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Entête */}
      <div className="bg-white shadow-sm p-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          <div className="flex justify-between items-start gap-6">
            <div>
              <h1 className="text-2xl font-black text-gray-900">🌳 Arbre à Problèmes Collaboratif</h1>
              <p className="text-gray-600">Session: {sessionId}</p>
              {(projectName || theme) && (
                <p className="text-sm text-gray-700 mt-1 font-bold">
                  {projectName} {theme ? "— " + theme : ""}
                </p>
              )}
              {/* Edition rapide Projet/Thème */}
              <div className="flex gap-2 mt-2">
                <input
                  className="px-3 py-1 border rounded text-sm"
                  placeholder="Nom du projet"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={async () => {
                    await setDoc(doc(db, "sessions", sessionId), { projectName }, { merge: true });
                  }}
                />
                <input
                  className="px-3 py-1 border rounded text-sm"
                  placeholder="Thème"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  onBlur={async () => {
                    await setDoc(doc(db, "sessions", sessionId), { theme }, { merge: true });
                  }}
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={toggleConnectionMode}
                className={`px-4 py-2 rounded-lg font-bold transition ${
                  isConnecting ? "bg-blue-600 text-white shadow-lg" : "bg-gray-200 text-gray-800"
                }`}
              >
                🔗 {isConnecting ? "Mode Connexion ON" : "Connecter Post-its"}
              </button>

              <button
                type="button"
                onClick={newSession}
                className="px-3 py-2 rounded-lg font-bold bg-emerald-600 text-white"
                title="Créer une nouvelle session vide"
              >
                Nouvelle session
              </button>

              <button
                type="button"
                onClick={purgeCurrentSession}
                className="px-3 py-2 rounded-lg font-bold bg-rose-600 text-white"
                title="Supprimer toutes les données de la session courante"
              >
                Purger session
              </button>

              <button
                type="button"
                onClick={showIntro}
                className="px-3 py-2 rounded-lg font-bold bg-gray-200 text-gray-800"
                title="Revoir les slides d'introduction"
              >
                Revoir l’intro
              </button>

              {/* QR persistant */}
              <QRCodeGenerator value={participantUrl} size={92} />
            </div>
          </div>
        </div>
      </div>

      {/* Corps */}
      <div className="max-w-7xl mx-auto p-4 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-120px)]">
        {/* CAUSES */}
        <Panel
          title="📝 Causes"
          color={COLORS.causes.bg}
          panelState={panelStates.causes}
          onToggle={() =>
            setPanelStates((s) => ({
              ...s,
              causes: s.causes === "minimized" ? "normal" : "minimized",
            }))
          }
          onAdd={() => addPostItToFirebase("Nouvelle cause", "causes", "Modérateur")}
          className="col-span-3 row-span-9"
        >
          {postIts
            .filter((p) => p.category === "causes" && !p.isInTree)
            .map((p) => (
              <SidePostIt
                key={p.id}
                postIt={p}
                colors={COLORS.causes}
                onMouseDown={handleMouseDown}
                onDelete={deletePostItFromFirebase}
                isConnecting={isConnecting}
              />
            ))}
        </Panel>

        {/* ARBRE */}
        <div className="col-span-6 row-span-12 bg-white rounded-lg shadow-lg border border-gray-300 flex flex-col">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="font-black">Arbre</div>
            <div className="text-xs text-gray-500">Glissez les post-its depuis les panneaux</div>
          </div>
          <div ref={treeAreaRef} className="relative flex-1">
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 1 }}
            >
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                </marker>
              </defs>
              {renderConnections()}
            </svg>
            {postIts.filter((p) => p.isInTree).map(renderPostIt)}
          </div>
        </div>

        {/* CONSÉQUENCES */}
        <Panel
          title="📈 Conséquences"
          color={COLORS.consequences.bg}
          panelState={panelStates.consequences}
          onToggle={() =>
            setPanelStates((s) => ({
              ...s,
              consequences: s.consequences === "minimized" ? "normal" : "minimized",
            }))
          }
          onAdd={() =>
            addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur")
          }
          className="col-span-3 row-span-9"
        >
          {postIts
            .filter((p) => p.category === "consequences" && !p.isInTree)
            .map((p) => (
              <SidePostIt
                key={p.id}
                postIt={p}
                colors={COLORS.consequences}
                onMouseDown={handleMouseDown}
                onDelete={deletePostItFromFirebase}
                isConnecting={isConnecting}
              />
            ))}
        </Panel>

        {/* PROBLÈMES (zone de préparation) */}
        <Panel
          title="🧩 Problèmes (zone de préparation)"
          color={COLORS.problem.bg}
          panelState={panelStates.problems}
          onToggle={() =>
            setPanelStates((s) => ({
              ...s,
              problems: s.problems === "minimized" ? "normal" : "minimized",
            }))
          }
          onAdd={() => addPostItToFirebase("Nouveau problème", "problem", "Modérateur")}
          className="col-span-12 row-span-3"
        >
          {postIts
            .filter((p) => p.category === "problem" && !p.isInTree)
            .map((p) => (
              <SidePostIt
                key={p.id}
                postIt={p}
                colors={COLORS.problem}
                onMouseDown={handleMouseDown}
                onDelete={deletePostItFromFirebase}
                isConnecting={isConnecting}
              />
            ))}
        </Panel>
      </div>

      {/* Overlay édition */}
      {editingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-4 w-[520px] max-w-[94vw]">
            <h3 className="font-black mb-2">Modifier le post-it</h3>
            <textarea
              className="w-full border rounded p-2 h-32"
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="px-3 py-2 rounded bg-gray-200"
                onClick={cancelEditing}
              >
                Annuler
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-emerald-600 text-white font-bold"
                onClick={saveEditing}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event handlers globaux */}
      <div className="fixed inset-0 pointer-events-none" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} />
    </div>
  );
}

/* ---------- Petits composants ---------- */

function Panel({ title, color, onAdd, onToggle, panelState, className = "", children }) {
  return (
    <div
      className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${className} ${
        panelState === "minimized" ? "opacity-30" : ""
      }`}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="font-black" style={{ color }}>{title}</div>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-2 py-1 bg-white border rounded text-sm hover:bg-gray-50"
            onClick={onAdd}
          >
            + Ajouter
          </button>
          <button
            type="button"
            className="px-2 py-1 bg-white border rounded text-sm hover:bg-gray-50"
            onClick={onToggle}
            title="Minimiser/Restaurer"
          >
            ↕
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 overflow-x-auto">
        <div className="flex gap-3">{children}</div>
      </div>
    </div>
  );
}

function SidePostIt({ postIt, colors, onMouseDown, onDelete, isConnecting }) {
  return (
    <div
      className="p-2.5 rounded-lg cursor-move shadow-sm border-2 flex-shrink-0 relative"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
        fontFamily: "'Arial Black', Arial, sans-serif",
        width: POSTIT_W,
        minHeight: POSTIT_H,
        overflow: "hidden",
      }}
      onMouseDown={(e) => onMouseDown(e, postIt.id)}
      title="Glissez vers l’arbre"
    >
      {isConnecting && (
        <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">
          🔗
        </div>
      )}

      <div className="font-bold text-[13px] break-words whitespace-normal">
        {postIt.content}
      </div>
      <div className="text-xs mt-1 opacity-80">{postIt.author}</div>

      {!isConnecting && (
        <button
          type="button"
          className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(postIt.id);
          }}
          title="Supprimer"
        >
          ×
        </button>
      )}
    </div>
  );
}

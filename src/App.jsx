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
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase-config";

// Composants
import QRCodeGenerator from "./components/QRCodeGenerator";
import ArbreProblemePresentation from "./components/ArbreProblemePresentation";

// --- Styles/Constantes
const COLORS = {
  problem: { bg: "#FF6B6B", text: "#FFFFFF", border: "#CC5252" }, // Rouge (central)
  causes: { bg: "#FFB6A6", text: "#1F2937", border: "#E08C7A" },  // Saumon (causes)
  consequences: { bg: "#A7F3D0", text: "#065F46", border: "#6EE7B7" }, // Vert (conséquences)
};

const CATEGORY_LABELS = {
  problem: "Problème central",
  causes: "Causes",
  consequences: "Conséquences",
};

export default function App() {
  // Mode & session
  const [mode, setMode] = useState("moderator");
  const [sessionId, setSessionId] = useState("PROBLEM-TREE-2025");

  // Données Firestore
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]); // réservé si tu veux séparer les liens

  // Sélection / drag
  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Panneaux latéraux
  const [panelStates, setPanelStates] = useState({
    causes: "normal",
    problems: "normal",
    consequences: "normal",
  });

  // Connexions (mode lien)
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSource, setConnectionSource] = useState(null);

  // Métadonnées de session
  const [projectName, setProjectName] = useState("");
  const [theme, setTheme] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Participant
  const [participantName, setParticipantName] = useState(
    () => localStorage.getItem("participantName") || ""
  );
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");
  const [showAnonymousOption, setShowAnonymousOption] = useState(false);

  // Réfs
  const treeAreaRef = useRef(null);
  const svgRef = useRef(null);

  // URL participant
  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    url.searchParams.set("mode", "participant");
    return url.toString();
  }, [sessionId]);

  // Lire paramètres URL (mode + session)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    const s = params.get("session");
    if (m === "participant") setMode("participant");
    if (s) setSessionId(s);
  }, []);

  // Charger métadonnées de session (projectName, theme)
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
          // Première fois : afficher l’onboarding
          setShowOnboarding(true);
        }
      })
      .catch(() => setShowOnboarding(true));
  }, [sessionId]);

  // Écoute temps réel des post-its & connexions
  useEffect(() => {
    if (!sessionId) return;

    // Post-its
    const q1 = query(
      collection(db, "postits"),
      where("sessionId", "==", sessionId),
      orderBy("timestamp", "asc")
    );
    const unsubPostits = onSnapshot(q1, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      setPostIts(items);
    });

    // Connexions (optionnel si tu gardes séparé)
    const q2 = query(
      collection(db, "connections"),
      where("sessionId", "==", sessionId),
      orderBy("timestamp", "asc")
    );
    const unsubConns = onSnapshot(q2, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      setConnections(items);
    });

    return () => {
      unsubPostits();
      unsubConns();
    };
  }, [sessionId]);

  // Garantir un seul problème central (doc id fixe)
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
          x: 400,
          y: 300,
          isInTree: true,
          isCentral: true,
          childIds: [],
          timestamp: serverTimestamp(),
        }).catch(() => {});
      }
    });
  }, [sessionId]);

  // Valider l’onboarding (sauvegarde session)
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

  // Helpers
  const getPanelClasses = (panel, base) =>
    `${base} ${panelStates[panel] === "minimized" ? "opacity-30" : ""}`;

  const togglePanel = (panel) =>
    setPanelStates((s) => ({
      ...s,
      [panel]: s[panel] === "minimized" ? "normal" : "minimized",
    }));

  const toggleConnectionMode = () => {
    setIsConnecting((v) => !v);
    setConnectionSource(null);
  };

  // --- CRUD Post-its ---
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
      causes: { x: 100, y: Math.random() * 100 + 100 },
      consequences: { x: 700, y: Math.random() * 100 + 100 },
      problem: { x: 400, y: Math.random() * 100 + 100 },
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
      alert("⚠️ Impossible d’ajouter le post-it (réseau ou droits).");
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
    // Empêcher la suppression du central
    if (id === `${sessionId}-central`) return;
    try {
      await deleteDoc(doc(db, "postits", id));
      // Optionnel : supprimer connexions liées si tu stockes dans /connections
      const related = connections.filter(
        (c) => c.fromId === id || c.toId === id
      );
      for (const conn of related) {
        await deleteDoc(doc(db, "connections", conn.id));
      }
    } catch (e) {
      console.error("Erreur suppression post-it:", e);
    }
  };

  // Drag & drop dans l’arbre
  const handleMouseDown = (e, postItId) => {
    if (mode !== "moderator") return;
    e.preventDefault();
    setSelectedPostIt(postItId);
    setIsDragging(true);

    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !selectedPostIt) return;
      const treeArea = treeAreaRef.current;
      if (!treeArea) return;

      const rect = treeArea.getBoundingClientRect();
      const newX = Math.max(
        0,
        Math.min(rect.width - 200, e.clientX - rect.left - dragOffset.x)
      );
      const newY = Math.max(
        0,
        Math.min(rect.height - 50, e.clientY - rect.top - dragOffset.y)
      );

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

  // Rendu d’un post-it
  const renderPostIt = (postIt) => {
    const colors = COLORS[postIt.category] || COLORS.problem;
    return (
      <div
        key={postIt.id}
        className="absolute cursor-move select-none"
        style={{
          left: postIt.x,
          top: postIt.y,
          width: 200,
          minHeight: 50,
          zIndex: 2,
        }}
        onMouseDown={(e) => handleMouseDown(e, postIt.id)}
      >
        <div
          className="rounded-lg p-3 shadow-lg border-2 relative"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            fontSize: Math.max(
              12,
              Math.min(16, 200 / Math.max(1, (postIt.content || "").length / 10))
            ),
          }}
        >
          {isConnecting && (
            <div className="absolute -top-1 -left-1 w-6 h-6 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">
              🔗
            </div>
          )}

          <div
            className="font-bold leading-tight"
            contentEditable={mode === "moderator" && !isConnecting}
            suppressContentEditableWarning
            onBlur={(e) =>
              updatePostItInFirebase(postIt.id, {
                content: e.currentTarget.textContent || "",
              })
            }
          >
            {postIt.content}
          </div>

          <div className="text-[10px] opacity-75 mt-1">{postIt.author}</div>

          {mode === "moderator" && (
            <button
              className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs"
              onClick={(ev) => {
                ev.stopPropagation();
                deletePostItFromFirebase(postIt.id);
              }}
            >
              ×
            </button>
          )}

          {mode === "moderator" && (postIt.category === "causes" || postIt.category === "consequences") && (
            <button
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white px-2 py-1 rounded-full text-[10px] font-bold shadow hover:bg-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                addPostItToFirebase(
                  "Nouveau",
                  postIt.category,
                  "Modérateur",
                  postIt.x,
                  postIt.y + 80,
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

  // Connexions (visuel simple : droite entre centres)
  const renderConnections = () => {
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    const lines = [];

    // Connexions depuis childIds si présentes
    postIts.forEach((p) => {
      (p.childIds || []).forEach((childId) => {
        const a = p;
        const b = byId[childId];
        if (!a || !b) return;
        lines.push({ from: a, to: b });
      });
    });

    // Connexions collection séparée (si utilisée)
    connections.forEach((c) => {
      const a = byId[c.fromId];
      const b = byId[c.toId];
      if (!a || !b) return;
      lines.push({ from: a, to: b });
    });

    return lines.map((ln, i) => {
      const x1 = (ln.from.x || 0) + 100;
      const y1 = (ln.from.y || 0) + 25;
      const x2 = (ln.to.x || 0) + 100;
      const y2 = (ln.to.y || 0) + 25;

      // orthogonal simple (déviation horizontale)
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
          opacity="0.9"
        />
      );
    });
  };

  // PARTICIPANT UI
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

          {!participantName && !showAnonymousOption && (
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
                  onClick={() => {
                    localStorage.setItem("participantName", participantName || "Participant");
                  }}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold"
                  disabled={!participantName.trim()}
                >
                  Continuer
                </button>
                <button
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

  // MODÉRATEUR : Onboarding d’abord
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

  // MODÉRATEUR : Tableau + QR persistant
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Entête */}
      <div className="bg-white shadow-sm p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-start gap-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">🌳 Arbre à Problèmes Collaboratif</h1>
            <p className="text-gray-600">Session: {sessionId}</p>
            {(projectName || theme) && (
              <p className="text-sm text-gray-700 mt-1 font-bold">
                {projectName} {theme ? "— " + theme : ""}
              </p>
            )}
            {/* Edition rapide du projet/thème */}
            <div className="flex gap-2 mt-2">
              <input
                className="px-3 py-1 border rounded text-sm"
                placeholder="Nom du projet"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={async () => {
                  await setDoc(
                    doc(db, "sessions", sessionId),
                    { projectName },
                    { merge: true }
                  );
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

          <div className="flex items-start gap-4">
            <button
              onClick={toggleConnectionMode}
              className={`px-4 py-2 rounded-lg font-bold transition ${
                isConnecting ? "bg-blue-600 text-white shadow-lg" : "bg-gray-200 text-gray-800"
              }`}
            >
              🔗 {isConnecting ? "Mode Connexion ON" : "Connecter Post-its"}
            </button>

            {isConnecting && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                <div className="text-sm text-blue-800 font-semibold">
                  {!connectionSource ? "1. Cliquez la SOURCE" : "2. Cliquez la CIBLE"}
                </div>
              </div>
            )}

            {/* QR persistant */}
            <QRCodeGenerator value={participantUrl} size={92} />
          </div>
        </div>
      </div>

      {/* Corps */}
      <div className="max-w-7xl mx-auto p-4 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-120px)]">
        {/* CAUSES */}
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "causes",
            "col-span-3 row-span-9"
          )}`}
        >
          <PanelHeader
            title="📝 Causes"
            color={COLORS.causes.bg}
            panel="causes"
            onAddPostIt={() =>
              addPostItToFirebase("Nouvelle cause", "causes", "Modérateur")
            }
            onToggle={togglePanel}
          />
          <div className="flex-1 p-4 overflow-hidden">
            <div className="flex gap-3 overflow-x-auto h-full">
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
            </div>
          </div>
        </div>

        {/* ARBRE CENTRAL */}
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
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "consequences",
            "col-span-3 row-span-9"
          )}`}
        >
          <PanelHeader
            title="📈 Conséquences"
            color={COLORS.consequences.bg}
            panel="consequences"
            onAddPostIt={() =>
              addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur")
            }
            onToggle={togglePanel}
          />
          <div className="flex-1 p-4 overflow-hidden">
            <div className="flex gap-3 overflow-x-auto h-full">
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
            </div>
          </div>
        </div>

        {/* PROBLÈMES */}
        <div
          className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses(
            "problems",
            "col-span-12 row-span-3"
          )}`}
        >
          <PanelHeader
            title="🧩 Problèmes (zone de préparation)"
            color={COLORS.problem.bg}
            panel="problems"
            onAddPostIt={() =>
              addPostItToFirebase("Nouveau problème", "problem", "Modérateur")
            }
            onToggle={togglePanel}
          />
          <div className="flex-1 p-4 overflow-x-auto">
            <div className="flex gap-3">
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
            </div>
          </div>
        </div>
      </div>

      {/* Events globaux */}
      <div
        className="fixed inset-0 pointer-events-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </div>
  );
}

// --- Petits composants UI --- //
function PanelHeader({ title, color, panel, onAddPostIt, onToggle }) {
  return (
    <div className="p-3 border-b flex items-center justify-between">
      <div className="font-black" style={{ color }}>{title}</div>
      <div className="flex gap-2">
        <button
          className="px-2 py-1 bg-white border rounded text-sm hover:bg-gray-50"
          onClick={() => onAddPostIt?.()}
        >
          + Ajouter
        </button>
        <button
          className="px-2 py-1 bg-white border rounded text-sm hover:bg-gray-50"
          onClick={() => onToggle?.(panel)}
        >
          {/** minimiser/normaliser */}
          ↕
        </button>
      </div>
    </div>
  );
}

function SidePostIt({ postIt, colors, onMouseDown, onDelete, isConnecting }) {
  return (
    <div
      className="p-3 rounded-lg cursor-move shadow-sm border-2 flex-shrink-0 min-w-[200px] group relative"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
        fontFamily: "'Arial Black', Arial, sans-serif",
      }}
      onMouseDown={(e) => onMouseDown(e, postIt.id)}
    >
      <div className="font-bold text-sm">{postIt.content}</div>
      <div className="text-xs mt-1 opacity-80">{postIt.author}</div>

      {isConnecting ? (
        <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center">
          🔗
        </div>
      ) : (
        <button
          className="absolute -top-1 -right-1 w-5 h-5 bg-black/70 text-white rounded-full text-xs opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(postIt.id);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

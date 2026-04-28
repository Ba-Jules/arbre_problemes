// src/App.jsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  generateObjectiveTree,
  transformProblemLabelToObjectiveLabel,
} from "./lib/objectiveTransformer";
import {
  Paintbrush,
  Link2,
  Maximize2,
  LayoutGrid,
  PanelRight,
  PanelBottom,
  Eye,
  EyeOff,
  QrCode,
  RotateCcw,
  BarChart2,
  Target,
  ArrowLeft,
  Folder,
  Tag,
  RefreshCw,
  Bot,
} from "lucide-react";
import { useAIConfig } from "./lib/useAIConfig";

/* ── Bouton icône réutilisable dans le header ── */
function HdrBtn({ icon: Icon, label, active, activeClass = "bg-indigo-100 text-indigo-700", onClick, tooltip, disabled = false, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors select-none whitespace-nowrap",
        active ? activeClass : "text-gray-600 hover:bg-gray-100",
        disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label && <span>{label}</span>}
    </button>
  );
}

/* ========================= Constantes UI ========================= */

const POSTIT_W = 220;
const POSTIT_H = 90;
const MAX_CHARS = 50;

/* Fond & bord — texte forcé en NOIR pour lisibilité */
const COLOR_PALETTE = {
  red:   { bg: "#ef4444", border: "#991b1b" }, // Problème central
  pink:  { bg: "#fb7185", border: "#be123c" }, // Causes
  amber: { bg: "#f59e0b", border: "#92400e" }, // Conséquences (orange/ambre)
  teal:  { bg: "#14b8a6", border: "#0f766e" },
  blue:  { bg: "#3b82f6", border: "#1e3a8a" },
  green: { bg: "#22c55e", border: "#166534" }, // conservé pour usages libres
};

const CATEGORY_DEFAULT_COLOR = {
  problem: "red",
  causes: "pink",
  consequences: "amber", // ← CONSEQUENCES en orange/ambre
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
  const [showPresentation, setShowPresentation] = useState(false);
  // Contexte de l'atelier (renseigné sur la page de démarrage)
  const [workshopContext, setWorkshopContext] = useState(null);

  /* -------- Participant -------- */
  const [participantName, setParticipantName] = useState(
    () => localStorage.getItem("participantName") || ""
  );
  const [isAnonymous, setIsAnonymous] = useState(
    () => (localStorage.getItem("participantName") || "") === "Anonyme"
  );
  const [selectedCategory, setSelectedCategory] = useState("problem");
  const [participantContent, setParticipantContent] = useState("");

  /* -------- Layout "Focus" -------- */
  const [layoutMode, setLayoutMode] = useState("classic"); // 'classic' | 'focus'
  const [dockPosition, setDockPosition] = useState("right"); // 'right' | 'bottom'
  const [dockHidden, setDockHidden] = useState(false);

  /* -------- Vue arbre -------- */
  const [treeViewFilter, setTreeViewFilter] = useState("all"); // 'all' | 'causes' | 'consequences'
  const [pendingReplacement, setPendingReplacement] = useState(null); // { draggedId, existingId }

  /* -------- Arbre à objectifs -------- */
  const [treeMode, setTreeMode] = useState("problems"); // "problems" | "objectives"
  const [objectiveNodes, setObjectiveNodes] = useState([]);
  const [objectiveConnections, setObjectiveConnections] = useState([]);
  const [editingObjectiveId, setEditingObjectiveId] = useState(null);
  const [editingObjectiveText, setEditingObjectiveText] = useState("");

  /* -------- Analyse autonome (via URL) -------- */
  const [standaloneAnalysis, setStandaloneAnalysis] = useState(false);

  /* -------- Config IA (localStorage) -------- */
  const { config: aiConfig, PROVIDER_DEFAULTS: AI_PROVIDER_DEFAULTS } = useAIConfig();

  /* -------- Export (PDF/PNG) -------- */
  const [exportMode, setExportMode] = useState(false); // active le rendu sans clamp + hauteurs dynamiques
  const postItRefs = useRef({}); // id -> DOM node pour mesurer la hauteur en export

  /* -------- Présence -------- */
  const [participantsCount, setParticipantsCount] = useState(1);

  /* -------- Refs -------- */
  const treeAreaRef = useRef(null);
  const selectedPostItRef = useRef(null);
  const isDraggingRef = useRef(false);
  const postItsRef = useRef([]);
  const dragStartedInTreeRef = useRef(false);
  const pendingScrollRef = useRef(null); // { cx, cy, newZoom } — appliqué par useLayoutEffect
  /* Drag objectifs (local uniquement, pas Firebase) */
  const isObjectiveDragRef = useRef(false);
  const draggingObjectiveIdRef = useRef(null);

  useEffect(() => { postItsRef.current = postIts; }, [postIts]);

  // Applique le scroll centré APRÈS le commit React (sizing div déjà mis à jour) et AVANT le paint.
  // RAF n'est pas assez fiable : le navigateur peut recalculer/clamper scrollLeft entre le commit et le RAF.
  useLayoutEffect(() => {
    if (!pendingScrollRef.current) return;
    const { cx, cy, newZoom } = pendingScrollRef.current;
    pendingScrollRef.current = null;
    const scroll = treeScrollRef.current;
    if (!scroll) return;
    scroll.scrollLeft = Math.max(0, cx * newZoom - scroll.clientWidth  / 2);
    scroll.scrollTop  = Math.max(0, cy * newZoom - scroll.clientHeight / 2);
  }, [zoom]);

  // Auto-ajuste le zoom quand on change de layout ou au premier chargement
  useEffect(() => {
    const t = setTimeout(zoomFit, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutMode]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsConnecting(false);
        setConnectSourceId(null);
        setPaintMode(false);
        setEditingId(null);
        setEditingText("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    syncViewFromUrl();
    const onPop = () => syncViewFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncViewFromUrl]);

  /* Quand on revient de l’onglet Analyse → on réinitialise les modes */
  useEffect(() => {
    const onFocus = () => {
      setIsConnecting(false);
      setConnectSourceId(null);
      setPaintMode(false);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

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
    url.searchParams.delete("analysis");
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", url.toString());
    setSessionId(id);
    syncViewFromUrl();
  };

  const newSession = async () => {
    const id = generateSessionId();
    navigateToSession(id);
    setPostIts([]);
    setConnections([]);
    setProjectName("");
    setTheme("");
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
    } catch {}
  };

  /* -------- URL participant (sans analysis) -------- */
  const participantUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    url.searchParams.set("mode", "participant");
    url.searchParams.delete("analysis");
    return url.toString();
  }, [sessionId]);

  /* ========================= Métadonnées session ========================= */

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
  /* ========================= Présence (participants connectés) ========================= */
  useEffect(() => {
    if (!sessionId) return;

    const uid =
      localStorage.getItem("presenceUid") || crypto.randomUUID?.() || String(Math.random());
    localStorage.setItem("presenceUid", uid);

    const participantsCol = collection(db, `sessions/${sessionId}/participants`);
    const meRef = doc(participantsCol, uid);

    // Déclare ma présence
    setDoc(
      meRef,
      {
        uid,
        role: mode === "participant" ? "participant" : "moderator",
        lastSeen: serverTimestamp(),
        connected: true,
      },
      { merge: true }
    ).catch(() => {});

    // Compteur en live
    const unsub = onSnapshot(participantsCol, (snap) => {
      const list = snap.docs.map((d) => d.data());
      const count = list.filter((r) => r.connected !== false).length;
      setParticipantsCount(count || 1);
    });

    // Nettoyage à la fermeture
    const onUnload = async () => {
      try {
        await deleteDoc(meRef);
      } catch {
        try {
          await setDoc(meRef, { connected: false, lastSeen: serverTimestamp() }, { merge: true });
        } catch {}
      }
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.removeEventListener("beforeunload", onUnload);
      unsub?.();
    };
  }, [sessionId, mode]);

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
    try {
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
    } catch (e) {
      console.error("addPostItToFirebase:", e);
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
    } catch (e) {
      console.error(e);
    }
  };

  /* ====== Création via "+ haut / + bas" (CORRIGÉ) ====== */
  const createLinkedPostIt = async (p, direction /* 'up' | 'down' */) => {
    try {
      const gap = 30;

      let newCat = p.category;
      if (p.category === "problem") {
        // *** Correction : HAUT = Conséquences, BAS = Causes ***
        newCat = direction === "up" ? "consequences" : "causes";
      }

      const newColor =
        CATEGORY_DEFAULT_COLOR[newCat] || p.color || activeColor || "red";

      let newX = p.x;
      let newY =
        direction === "up"
          ? Math.max(10, p.y - POSTIT_H - gap)
          : p.y + POSTIT_H + gap;

      const newId = await addPostItToFirebase(
        "Nouvelle étiquette qui comporte\nplusieurs lignes si besoin",
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
        setIsConnecting(false); // quitte le mode connexion après création
      } else {
        setConnectSourceId(null);
        setIsConnecting(false);
      }
      return;
    }

    setSelectedPostIt(postItId);
    selectedPostItRef.current = postItId;
    setIsDragging(true);
    isDraggingRef.current = true;
    const draggedItem = postIts.find((item) => item.id === postItId);
    dragStartedInTreeRef.current = draggedItem?.isInTree ?? false;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
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

      // Drag d'un nœud objectif (local uniquement, pas Firebase)
      if (isObjectiveDragRef.current && draggingObjectiveIdRef.current) {
        const oid = draggingObjectiveIdRef.current;
        setObjectiveNodes((prev) =>
          prev.map((n) => (n.id === oid ? { ...n, x: newX, y: newY } : n))
        );
        return;
      }

      if (!selectedPostIt) return;
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

  const handleMouseUp = (e) => {
    // Fin de drag d'un nœud objectif (local, rien à persister)
    if (isObjectiveDragRef.current) {
      isObjectiveDragRef.current = false;
      draggingObjectiveIdRef.current = null;
      setIsDragging(false);
      isDraggingRef.current = false;
      return;
    }

    if (isDraggingRef.current && selectedPostItRef.current) {
      const currentPostIts = postItsRef.current;
      const dragged = currentPostIts.find((p) => p.id === selectedPostItRef.current);

      if (dragged) {
        const scrollEl = treeScrollRef.current;
        const rect = scrollEl?.getBoundingClientRect();
        const isOutsideCanvas =
          rect &&
          (e.clientX < rect.left || e.clientX > rect.right ||
           e.clientY < rect.top  || e.clientY > rect.bottom);

        if (isOutsideCanvas && dragged.isInTree) {
          // Retour dans le dock : on retire l'étiquette de l'arbre
          updatePostItInFirebase(selectedPostItRef.current, { isInTree: false });
          setPostIts((prev) =>
            prev.map((p) =>
              p.id === selectedPostItRef.current ? { ...p, isInTree: false } : p
            )
          );
        } else if (
          dragged.category === "problem" &&
          !dragStartedInTreeRef.current &&
          dragged.isInTree
        ) {
          // Vérifier s'il faut demander le remplacement du problème central
          const existingCentral = currentPostIts.find(
            (p) => p.id !== selectedPostItRef.current && p.category === "problem" && p.isInTree
          );
          if (existingCentral) {
            setPendingReplacement({
              draggedId: selectedPostItRef.current,
              existingId: existingCentral.id,
            });
          }
        }
      }
    }
    setIsDragging(false);
    isDraggingRef.current = false;
    setSelectedPostIt(null);
    selectedPostItRef.current = null;
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

  /* ========================= Arbre à objectifs ========================= */

  /** Démarre le drag d'un nœud objectif (état local uniquement, pas Firebase). */
  const handleObjectiveMouseDown = (e, nodeId) => {
    e.preventDefault();
    isObjectiveDragRef.current = true;
    draggingObjectiveIdRef.current = nodeId;
    setIsDragging(true);
    isDraggingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  /** Génère (ou régénère) l'arbre à objectifs depuis l'arbre à problèmes courant. */
  const handleGenerateObjectiveTree = () => {
    const result = generateObjectiveTree(postIts, connections);
    setObjectiveNodes(result.nodes);
    setObjectiveConnections(result.connections);
    setTreeMode("objectives");
  };

  /** Repositionne les nœuds objectifs : ends en haut, central au centre, means en bas. */
  const autoLayoutObjectives = () => {
    const canvasH = layoutMode === "focus" ? CANVAS_H_FOCUS : CANVAS_H_CLASSIC;
    const CENTER_X = Math.round(CANVAS_W / 2 - POSTIT_W / 2);
    const CENTER_Y = Math.round(canvasH / 2 - POSTIT_H / 2);
    const H_GAP = 40;
    const V_GAP = 100;

    const central = objectiveNodes.find((n) => n.objectiveType === "central");
    const means   = objectiveNodes.filter((n) => n.objectiveType === "means");
    const ends    = objectiveNodes.filter((n) => n.objectiveType === "ends");

    const placeRow = (items, startY) => {
      const total = items.length * POSTIT_W + (items.length - 1) * H_GAP;
      const startX = Math.round((CANVAS_W - total) / 2);
      return items.map((item, j) => ({
        id: item.id,
        x: Math.max(10, startX + j * (POSTIT_W + H_GAP)),
        y: Math.max(10, Math.min(canvasH - POSTIT_H - 10, startY)),
      }));
    };

    const updates = [];
    if (central) updates.push({ id: central.id, x: CENTER_X, y: CENTER_Y });

    // Means : en-dessous du central (même convention que causes dans l'arbre problèmes)
    if (means.length > 0) {
      placeRow(means, CENTER_Y + POSTIT_H + V_GAP).forEach((u) => updates.push(u));
    }
    // Ends : au-dessus du central (même convention que conséquences)
    if (ends.length > 0) {
      placeRow(ends, CENTER_Y - POSTIT_H - V_GAP).forEach((u) => updates.push(u));
    }

    setObjectiveNodes((prev) =>
      prev.map((n) => {
        const u = updates.find((up) => up.id === n.id);
        return u ? { ...n, x: u.x, y: u.y } : n;
      })
    );
  };

  /* ========================= Connexions (SVG) ========================= */

  const getNodeHeight = (id) => {
    // En export, on mesure la vraie hauteur DOM (divisée par le zoom),
    // sinon on garde la hauteur fixe.
    if (exportMode && postItRefs.current[id]) {
      const rect = postItRefs.current[id].getBoundingClientRect();
      return rect.height / (zoom || 1);
    }
    return POSTIT_H;
  };

  const renderConnections = () => {
    const visibleIds = new Set(visiblePostIts.inTree.map((p) => p.id));
    const byId = Object.fromEntries(postIts.map((p) => [p.id, p]));
    const items = [];

    connections.forEach((c) => {
      const a = byId[c.fromId];
      const b = byId[c.toId];
      if (!a || !b) return;
      if (!visibleIds.has(a.id) || !visibleIds.has(b.id)) return;

      const aH = getNodeHeight(a.id);
      const bH = getNodeHeight(b.id);

      const x1 = (a.x || 0) + POSTIT_W / 2;
      const y1 = (a.y || 0) + aH / 2;
      const x2 = (b.x || 0) + POSTIT_W / 2;
      const y2 = (b.y || 0) + bH / 2;

      const midY = y1 + (y2 - y1) / 2;
      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

      const cx = (x1 + x2) / 2;
      const cy = midY;

      items.push(
        <g key={c.id}>
          <path
            d={d}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.2"
            markerEnd="url(#arrowhead)"
            opacity="0.95"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
          {mode === "moderator" && !exportMode && (
            <g
              transform={`translate(${cx}, ${cy})`}
              style={{ cursor: "pointer" }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await deleteDoc(doc(db, "connections", c.id));
                } catch (err) {
                  console.error(err);
                }
              }}
            >
              <circle r="8" fill="#ffffff" stroke="#334155" strokeWidth="1.2" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="12"
                fontWeight="bold"
                fill="#334155"
              >
                ×
              </text>
            </g>
          )}
        </g>
      );
    });

    return items;
  };

  /* ========================= Rendu arbre à objectifs ========================= */

  /** Couleur du point de statut de validation */
  const VALIDATION_DOT = {
    generated: "#94a3b8",   // slate  – généré, non relu
    validated: "#22c55e",   // green  – validé
    to_review: "#f59e0b",   // amber  – à revoir
    edited:    "#3b82f6",   // blue   – modifié manuellement
  };

  const OBJECTIVE_TYPE_LABEL = {
    central: "OBJECTIF CENTRAL",
    means:   "MOYEN",
    ends:    "FIN",
  };

  const renderObjectiveConnections = () => {
    const nodeById = Object.fromEntries(objectiveNodes.map((n) => [n.id, n]));
    return objectiveConnections.map((c) => {
      const a = nodeById[c.fromId];
      const b = nodeById[c.toId];
      if (!a || !b) return null;

      const x1 = (a.x || 0) + POSTIT_W / 2;
      const y1 = (a.y || 0) + POSTIT_H / 2;
      const x2 = (b.x || 0) + POSTIT_W / 2;
      const y2 = (b.y || 0) + POSTIT_H / 2;
      const midY = y1 + (y2 - y1) / 2;
      const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      const cx = (x1 + x2) / 2;
      const cy = midY;

      return (
        <g key={c.id}>
          <path
            d={d}
            fill="none"
            stroke="#1e3a5f"
            strokeWidth="2.2"
            markerEnd="url(#arrowhead)"
            opacity="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "none" }}
          />
          {!exportMode && (
            <g
              transform={`translate(${cx}, ${cy})`}
              style={{ cursor: "pointer" }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => {
                e.stopPropagation();
                setObjectiveConnections((prev) => prev.filter((oc) => oc.id !== c.id));
              }}
            >
              <circle r="8" fill="#ffffff" stroke="#334155" strokeWidth="1.2" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill="#334155">×</text>
            </g>
          )}
        </g>
      );
    });
  };

  const renderObjectivePostIt = (n) => {
    const color     = COLOR_PALETTE[n.color] || COLOR_PALETTE.green;
    const dotColor  = VALIDATION_DOT[n.validation?.status || "generated"];
    const typeLabel = OBJECTIVE_TYPE_LABEL[n.objectiveType] || "OBJECTIF";
    const isValidated = n.validation?.status === "validated";

    return (
      <div
        key={n.id}
        id={`obj-${n.id}`}
        className="absolute select-none cursor-move"
        style={{
          left: n.x,
          top: n.y,
          width: POSTIT_W,
          height: exportMode ? "auto" : POSTIT_H,
          zIndex: 3,
        }}
        onMouseDown={(e) => handleObjectiveMouseDown(e, n.id)}
        title={`Source : "${n.sourceLabel}"`}
      >
        <div
          className="rounded-lg p-3 shadow-lg border-2 relative group"
          style={{
            backgroundColor: color.bg,
            borderColor: isValidated ? "#16a34a" : color.border,
            color: "#111827",
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.2,
            WebkitFontSmoothing: "antialiased",
            textRendering: "optimizeLegibility",
            outline: isValidated ? "2px solid #16a34a" : "none",
          }}
        >
          {/* Point de statut validation */}
          <div
            className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-white/60"
            style={{ backgroundColor: dotColor }}
            title={`Statut : ${n.validation?.status || "generated"}`}
          />

          {/* Boutons d'action — toujours visibles, comme renderPostIt */}
          {!exportMode && (
            <div className="absolute -top-1 -right-1 flex gap-1">
              {/* Modifier l'étiquette */}
              <button
                type="button"
                className="w-5 h-5 bg-black/80 text-white rounded-full text-[11px] flex items-center justify-center"
                title="Modifier l'étiquette"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setEditingObjectiveId(n.id);
                  setEditingObjectiveText(n.content || "");
                }}
              >✎</button>

              {/* Changer la couleur */}
              <button
                type="button"
                className="w-5 h-5 bg-black/80 text-white rounded-full text-[13px] flex items-center justify-center"
                title="Changer la couleur"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  const keys = Object.keys(COLOR_PALETTE);
                  const idx = Math.max(0, keys.indexOf(n.color));
                  const next = keys[(idx + 1) % keys.length];
                  setObjectiveNodes((prev) =>
                    prev.map((node) => (node.id === n.id ? { ...node, color: next } : node))
                  );
                }}
              >🎨</button>

              {/* Basculer validation */}
              <button
                type="button"
                className="w-5 h-5 bg-black/80 text-white rounded-full text-[11px] flex items-center justify-center"
                title={isValidated ? "Marquer « À revoir »" : "Valider cet objectif"}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  const newStatus = isValidated ? "to_review" : "validated";
                  setObjectiveNodes((prev) =>
                    prev.map((node) =>
                      node.id === n.id
                        ? { ...node, validation: { ...node.validation, status: newStatus } }
                        : node
                    )
                  );
                }}
              >{isValidated ? "✓" : "○"}</button>

              {/* Supprimer */}
              <button
                type="button"
                className="w-5 h-5 bg-black/80 text-white rounded-full text-[13px] flex items-center justify-center"
                title="Supprimer cet objectif"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setObjectiveNodes((prev) => prev.filter((node) => node.id !== n.id));
                  setObjectiveConnections((prev) =>
                    prev.filter((c) => c.fromId !== n.id && c.toId !== n.id)
                  );
                }}
              >×</button>
            </div>
          )}

          {/* Texte principal */}
          <div
            className={`font-extrabold text-[16px] break-words whitespace-pre-wrap pl-3 pr-6 ${
              exportMode ? "" : "max-h-[44px] overflow-hidden"
            }`}
          >
            {n.content}
          </div>

          {/* Badge type en bas */}
          <div className="absolute left-2 bottom-0.5 text-[8px] font-black uppercase tracking-wider opacity-50 pointer-events-none">
            {typeLabel}
          </div>
        </div>
      </div>
    );
  };

  /* ========================= Panneaux ========================= */

  const getPanelClasses = (panel, base) => {
    const st = panelStates[panel];
    if (st === "maximized") return "col-span-12 row-span-12 z-40";
    if (st === "minimized") return "col-span-2 row-span-2 min-h-[40px]";
    return base;
  };

  const PanelHeader = ({ title, onAdd, right }) => (
    <div className="flex items-center justify-between p-2 border-b bg-white/70 backdrop-blur-sm">
      <div className="font-semibold text-sm text-slate-700">{title}</div>
      <div className="flex items-center gap-2">
        {right}
        {onAdd && (
          <button
            onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
            onClick={onAdd}
            className="w-6 h-6 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
            title="Ajouter un post-it"
          >
            +
          </button>
        )}
      </div>
    </div>
  );

  /* ========================= Rendu Post-it ========================= */

  const renderPostIt = (p) => {
    const color = COLOR_PALETTE[p.color] || COLOR_PALETTE.red;
    const isSource = isConnecting && connectSourceId === p.id;

    return (
      <div
        key={p.id}
        id={`postit-${p.id}`}
        ref={(el) => { if (el) postItRefs.current[p.id] = el; }}
        className={`absolute select-none transition-transform ${
          isConnecting ? "cursor-pointer" : paintMode ? "cursor-crosshair" : "cursor-move"
        } ${isSource ? "ring-4 ring-blue-400" : ""}`}
        style={{
          left: p.x,
          top: p.y,
          width: POSTIT_W,
          height: exportMode ? "auto" : POSTIT_H, // ← auto pendant l'export
          transform: `translateZ(0)`,
          zIndex: 3,
        }}
        onMouseDown={(e) => handleMouseDown(e, p.id)}
      >
        {/* Conteneur coloré du post-it */}
        <div
          className="rounded-lg p-3 shadow-lg border-2 relative group"
          style={{
            backgroundColor: color.bg,
            borderColor: color.border,
            color: "#111827",
            fontFamily: "'Arial Black', Arial, sans-serif",
            lineHeight: 1.2,
            WebkitFontSmoothing: "antialiased",
            textRendering: "optimizeLegibility",
          }}
        >
          {/* + boutons de connexion – masqués en export et en mode peinture */}
          {mode === "moderator" && !paintMode && !exportMode && (
            <>
              <button
                type="button"
                className={`absolute left-1/2 -translate-x-1/2 text-[16px] font-black leading-none z-20 print:hidden px-1 rounded transition-colors ${
                  isSource ? "text-blue-600 bg-blue-100" : "text-black bg-transparent hover:text-blue-500"
                }`}
                style={{ top: 0 }}
                title={isSource ? "Source active — cliquez sur une autre étiquette pour relier" : "Relier à une autre étiquette"}
                onMouseDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (isConnecting && connectSourceId && connectSourceId !== p.id) {
                    // complète la connexion vers cette étiquette
                    addDoc(collection(db, "connections"), {
                      sessionId,
                      fromId: connectSourceId,
                      toId: p.id,
                      createdAt: serverTimestamp(),
                    }).catch(console.error);
                    setConnectSourceId(null);
                    setIsConnecting(false);
                  } else {
                    // démarre la connexion depuis cette étiquette
                    setPaintMode(false);
                    setIsConnecting(true);
                    setConnectSourceId(p.id);
                  }
                }}
              >
                +
              </button>

              <button
                type="button"
                className={`absolute left-1/2 -translate-x-1/2 text-[16px] font-black leading-none z-20 print:hidden px-1 rounded transition-colors ${
                  isSource ? "text-blue-600 bg-blue-100" : "text-black bg-transparent hover:text-blue-500"
                }`}
                style={{ bottom: 0 }}
                title={isSource ? "Source active — cliquez sur une autre étiquette pour relier" : "Relier à une autre étiquette"}
                onMouseDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (isConnecting && connectSourceId && connectSourceId !== p.id) {
                    // complète la connexion vers cette étiquette
                    addDoc(collection(db, "connections"), {
                      sessionId,
                      fromId: connectSourceId,
                      toId: p.id,
                      createdAt: serverTimestamp(),
                    }).catch(console.error);
                    setConnectSourceId(null);
                    setIsConnecting(false);
                  } else {
                    // démarre la connexion depuis cette étiquette
                    setPaintMode(false);
                    setIsConnecting(true);
                    setConnectSourceId(p.id);
                  }
                }}
              >
                +
              </button>
            </>
          )}

          {/* Actions coin (masquées en export) */}
          {mode === "moderator" && !exportMode && (
            <div className="absolute -top-1 -right-1 flex gap-1">
              {!isConnecting && !paintMode && (
                <>
                  <button
                    type="button"
                    className="w-5 h-5 bg-black/80 text-white rounded-full text-[11px] flex items-center justify-center"
                    title="Modifier"
                    onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      startEditing(p);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="w-5 h-5 bg-black/80 text-white rounded-full text-[13px] flex items-center justify-center"
                    title="Couleur"
                    onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
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
                </>
              )}
              <button
                type="button"
                className="w-5 h-5 bg-black/80 text-white rounded-full text-[13px] flex items-center justify-center"
                title="Supprimer"
                onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
                onClick={(ev) => {
                  ev.stopPropagation();
                  deletePostItFromFirebase(p.id);
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Texte principal : clampé à l'écran, libéré en export */}
          <div
            className={`font-extrabold text-[16px] break-words whitespace-pre-wrap pr-6 ${
              exportMode ? "" : "max-h-[54px] overflow-hidden"
            }`}
          >
            {p.content}
          </div>

          {/* Auteur : masqué en impression ET en export */}
          <div className={`absolute left-2 bottom-1 text-[11px] text-black/80 bg-white/85 rounded px-1 leading-4 border border-black/10 ${exportMode ? "hidden" : "opacity-0 group-hover:opacity-100"} pointer-events-none print:hidden`}>
            {p.author}
          </div>
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
      window.location.replace(url.toString());
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

  const CANVAS_W = 2000;
  const CANVAS_H_CLASSIC = 1200;
  const CANVAS_H_FOCUS = 1400;

  // Zoom centré sur le centre du viewport visible
  const zoomAround = (newZoom) => {
    const scroll = treeScrollRef.current;
    if (!scroll) { setZoom(newZoom); return; }
    // Centre viewport en coordonnées canvas (avant zoom)
    const cx = (scroll.scrollLeft + scroll.clientWidth  / 2) / zoom;
    const cy = (scroll.scrollTop  + scroll.clientHeight / 2) / zoom;
    // Stocker la cible : useLayoutEffect l'appliquera après le commit React
    pendingScrollRef.current = { cx, cy, newZoom };
    setZoom(newZoom);
  };

  const zoomOut = () => zoomAround(Math.max(0.2, +(zoom - 0.1).toFixed(2)));
  const zoomIn  = () => zoomAround(Math.min(2,   +(zoom + 0.1).toFixed(2)));
  const zoomFit = () => {
    const wrap = treeScrollRef.current;
    if (!wrap) return;
    const canvasH = layoutMode === "focus" ? CANVAS_H_FOCUS : CANVAS_H_CLASSIC;
    const factor = Math.max(0.2, Math.min(2, Math.min(wrap.clientWidth / CANVAS_W, wrap.clientHeight / canvasH)));
    setZoom(+factor.toFixed(2));
    // Après ajustement, remettre le scroll à l'origine
    requestAnimationFrame(() => { if (wrap) { wrap.scrollLeft = 0; wrap.scrollTop = 0; } });
  };

  /* ========================= Auto-layout intelligent ========================= */
  const autoLayout = async () => {
    const canvasH = layoutMode === "focus" ? CANVAS_H_FOCUS : CANVAS_H_CLASSIC;
    const CENTER_X = Math.round(CANVAS_W / 2 - POSTIT_W / 2);
    const CENTER_Y = Math.round(canvasH / 2 - POSTIT_H / 2);
    const H_GAP = 40;   // espace horizontal entre étiquettes d'un même niveau
    const V_GAP = 100;  // espace vertical entre niveaux

    const inTree = postIts.filter((p) => p.isInTree);
    const centralProblem = inTree.find((p) => p.category === "problem");
    const causesInTree = inTree.filter((p) => p.category === "causes");
    const consInTree = inTree.filter((p) => p.category === "consequences");

    const updates = [];
    if (centralProblem) updates.push({ id: centralProblem.id, x: CENTER_X, y: CENTER_Y });

    /**
     * BFS depuis le problème central pour trouver la profondeur de chaque
     * étiquette dans sa branche (causes ou conséquences).
     * - Niveau 1 = directement relié au problème central
     * - Niveau 2 = relié à un élément de niveau 1, etc.
     * - Les éléments sans connexion sont mis au dernier niveau.
     * Les connexions sont parcourues dans les deux sens (non dirigé).
     */
    const buildLevels = (items, rootId) => {
      if (items.length === 0) return [];
      const itemById = new Map(items.map((p) => [p.id, p]));
      const allIds = new Set([rootId, ...items.map((p) => p.id)]);
      const visited = new Set([rootId]);
      const depthMap = new Map(); // id → profondeur (1-based depuis root)

      let frontier = [rootId];
      let depth = 0;

      while (frontier.length > 0) {
        depth++;
        const next = [];
        for (const nodeId of frontier) {
          connections.forEach((c) => {
            const otherId =
              c.fromId === nodeId && allIds.has(c.toId) ? c.toId :
              c.toId === nodeId   && allIds.has(c.fromId) ? c.fromId :
              null;
            if (otherId && !visited.has(otherId) && itemById.has(otherId)) {
              visited.add(otherId);
              depthMap.set(otherId, depth);
              next.push(otherId);
            }
          });
        }
        frontier = next;
      }

      // Éléments sans connexion → dernier niveau
      const maxDepth = depthMap.size > 0 ? Math.max(...depthMap.values()) : 0;
      items.forEach((p) => {
        if (!depthMap.has(p.id)) depthMap.set(p.id, maxDepth + 1);
      });

      // Regrouper par niveau
      const grouped = new Map();
      items.forEach((p) => {
        const lvl = depthMap.get(p.id);
        if (!grouped.has(lvl)) grouped.set(lvl, []);
        grouped.get(lvl).push(p);
      });

      return Array.from(grouped.entries())
        .sort(([a], [b]) => a - b)
        .map(([, row]) => row);
    };

    /**
     * Positionne les rangées de bas en haut (conséquences) ou de haut en bas (causes).
     * startY = Y de la première rangée (la plus proche du problème)
     * stepY  = décalage vertical entre rangées (+= vers le bas, -= vers le haut)
     */
    const placeRows = (rows, startY, stepY) => {
      let y = startY;
      for (const row of rows) {
        const rowW = row.length * POSTIT_W + (row.length - 1) * H_GAP;
        const rowStartX = Math.round((CANVAS_W - rowW) / 2);
        const clampedY = Math.max(10, Math.min(canvasH - POSTIT_H - 10, y));
        row.forEach((item, j) => {
          const x = Math.max(10, Math.min(CANVAS_W - POSTIT_W - 10, rowStartX + j * (POSTIT_W + H_GAP)));
          updates.push({ id: item.id, x, y: clampedY });
        });
        y += stepY;
      }
    };

    if (centralProblem) {
      // Conséquences : au-dessus du problème, niveau 1 le plus proche
      if (consInTree.length > 0) {
        const rows = buildLevels(consInTree, centralProblem.id);
        placeRows(rows, CENTER_Y - POSTIT_H - V_GAP, -(POSTIT_H + V_GAP));
      }
      // Causes : en-dessous du problème, niveau 1 le plus proche
      if (causesInTree.length > 0) {
        const rows = buildLevels(causesInTree, centralProblem.id);
        placeRows(rows, CENTER_Y + POSTIT_H + V_GAP, POSTIT_H + V_GAP);
      }
    }

    setPostIts((prev) =>
      prev.map((p) => {
        const u = updates.find((u) => u.id === p.id);
        return u ? { ...p, x: u.x, y: u.y } : p;
      })
    );
    for (const { id, x, y } of updates) await updatePostItInFirebase(id, { x, y });

    // Recentrer le scroll sur le problème central
    if (treeScrollRef.current && centralProblem) {
      const scroll = treeScrollRef.current;
      const targetX = CENTER_X * zoom + (POSTIT_W * zoom) / 2 - scroll.clientWidth / 2;
      const targetY = CENTER_Y * zoom + (POSTIT_H * zoom) / 2 - scroll.clientHeight / 2;
      scroll.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: "smooth" });
    }
  };

  /* >>> Export PDF/PNG : CORRECTION ICI <<< */
  const waitNextFrame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

  const beforeCapture = async () => {
    setExportMode(true);
    await waitNextFrame(); // laisse le temps au DOM de se re-render
  };
  const afterCapture = () => setExportMode(false);

  const exportTreeAsPDF = async () => {
    try {
      await beforeCapture(); // 1) activer exportMode d’abord
      const node = treeAreaRef.current; // 2) lire la ref APRÈS le re-render
      if (!node) throw new Error("Zone arbre introuvable");

      const prevTransform = node.style.transform;
      node.style.transform = "scale(1)";

      const canvas = await html2canvas(node, {
        scale: 3,
        backgroundColor: "#ffffff",
        letterRendering: true,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      const x = (pageWidth - w) / 2;
      const y = (pageHeight - h) / 2;
      pdf.addImage(imgData, "PNG", x, y, w, h);
      pdf.save(`arbre-${sessionId}.pdf`);

      node.style.transform = prevTransform || "";
    } catch (err) {
      console.error(err);
      alert("Export PDF impossible. Réessayez.");
    } finally {
      afterCapture();
    }
  };

  const exportTreeAsPNG = async () => {
    try {
      await beforeCapture(); // 1) activer exportMode d’abord
      const node = treeAreaRef.current; // 2) lire la ref APRÈS le re-render
      if (!node) throw new Error("Zone arbre introuvable");

      const prevTransform = node.style.transform;
      node.style.transform = "scale(1)";

      const canvas = await html2canvas(node, {
        scale: 3,
        backgroundColor: "#ffffff",
        letterRendering: true,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `arbre-${sessionId}.png`;
      a.click();

      node.style.transform = prevTransform || "";
    } catch (err) {
      console.error(err);
      alert("Export PNG impossible. Réessayez.");
    } finally {
      afterCapture();
    }
  };

  const visiblePostIts = {
    inTree: postIts.filter((p) => {
      if (!p.isInTree) return false;
      if (treeViewFilter === "causes") return p.category === "causes" || p.category === "problem";
      if (treeViewFilter === "consequences") return p.category === "consequences" || p.category === "problem";
      return true;
    }),
    causes: postIts.filter((p) => p.category === "causes" && !p.isInTree),
    consequences: postIts.filter((p) => p.category === "consequences" && !p.isInTree),
    problems: postIts.filter((p) => p.category === "problem" && !p.isInTree),
  };

  const handlePresentationComplete = async ({ projectName: p, theme: t, workshopContext: ctx }) => {
    await setDoc(
      doc(db, "sessions", sessionId),
      { projectName: p, theme: t, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setProjectName(p || "");
    setTheme(t || "");
    if (ctx?.hasContent) setWorkshopContext(ctx);
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

  /* ========= Layouts ========= */

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
              color: "#111827",
              borderColor: color.border,
              fontFamily: "'Arial Black', Arial, sans-serif",
              WebkitFontSmoothing: "antialiased",
              textRendering: "optimizeLegibility",
            }}
            onMouseDown={(e) => handleMouseDown(e, p.id)}
            title={paintMode ? "Cliquez pour appliquer la couleur" : `Glissez vers l'arbre (${title})`}
          >
            <div className="font-extrabold text-sm break-words whitespace-pre-wrap">
              {p.content}
            </div>

            {/* Auteur masqué par défaut */}
            <div className="absolute left-2 bottom-1 text-[11px] text-black/80 bg-white/85 rounded px-1 leading-4 border border-black/10 opacity-0 group-hover:opacity-100 pointer-events-none">
              {p.author}
            </div>

            {!paintMode && (
              <button
                className="absolute -top-1 -right-1 w-5 h-5 bg-black/80 text-white rounded-full text-[12px] opacity-0 group-hover:opacity-100"
                onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();}}
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

  /* Couleur par défaut selon le type d'objectif */
  const objTypeDefaultColor = (type) =>
    type === "central" ? "green" : type === "means" ? "teal" : "blue";

  /**
   * Crée un nouveau nœud objectif vide et ouvre directement la modale d'édition.
   * Utilisé par les boutons "+" des colonnes latérales en mode objectifs.
   */
  const addObjectiveNode = (type) => {
    const canvasH = layoutMode === "focus" ? CANVAS_H_FOCUS : CANVAS_H_CLASSIC;
    const CENTER_X = Math.round(CANVAS_W / 2 - POSTIT_W / 2);
    const CENTER_Y = Math.round(canvasH / 2 - POSTIT_H / 2);
    const V_GAP = 120;

    const positionByType = {
      central: { x: CENTER_X,           y: CENTER_Y },
      means:   { x: 40,                  y: CENTER_Y + POSTIT_H + V_GAP },
      ends:    { x: CENTER_X,            y: Math.max(10, CENTER_Y - POSTIT_H - V_GAP) },
    };
    const pos = positionByType[type] || positionByType.means;

    const newNode = {
      id: `obj-manual-${Date.now()}`,
      sourceProblemNodeId: null,
      sourceLabel: null,
      content: type === "central" ? "Objectif central" : type === "means" ? "Nouveau moyen" : "Nouvelle fin",
      objectiveType: type,
      x: pos.x,
      y: pos.y,
      isInTree: true,
      color: objTypeDefaultColor(type),
      validation: { desirable: null, feasible: null, logical: null, status: "generated" },
    };

    setObjectiveNodes((prev) => [...prev, newNode]);
    // Ouvre directement la modale d'édition pour saisir le libellé
    setEditingObjectiveId(newNode.id);
    setEditingObjectiveText(newNode.content);
  };

  /** Liste compacte d'objectifs dans les colonnes latérales (mode objectifs). */
  const ObjectiveColumnList = ({ items }) => (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="text-xs text-slate-400 italic px-1 py-2">Aucun objectif. Cliquez sur + pour en ajouter.</div>
      )}
      {items.map((n) => {
        const color = COLOR_PALETTE[n.color] || COLOR_PALETTE.teal;
        const isValidated = n.validation?.status === "validated";
        return (
          <div
            key={n.id}
            className="p-2 rounded border-2 shadow-sm relative group"
            style={{
              backgroundColor: color.bg,
              borderColor: isValidated ? "#16a34a" : color.border,
              color: "#111827",
              fontFamily: "'Arial Black', Arial, sans-serif",
              WebkitFontSmoothing: "antialiased",
            }}
          >
            <div className="font-extrabold text-xs break-words whitespace-pre-wrap pr-10 leading-tight">
              {n.content}
            </div>
            {n.sourceLabel && (
              <div className="text-[9px] opacity-60 mt-0.5 truncate" title={`Source : ${n.sourceLabel}`}>
                ↳ {n.sourceLabel}
              </div>
            )}
            {/* Boutons toujours visibles */}
            <div className="absolute top-1 right-1 flex gap-0.5">
              <button
                className="w-4 h-4 bg-black/70 text-white rounded-full text-[9px] flex items-center justify-center"
                title="Modifier"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => { setEditingObjectiveId(n.id); setEditingObjectiveText(n.content); }}
              >✎</button>
              <button
                className="w-4 h-4 bg-black/70 text-white rounded-full text-[10px] flex items-center justify-center"
                title="Supprimer"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={() => {
                  setObjectiveNodes((prev) => prev.filter((node) => node.id !== n.id));
                  setObjectiveConnections((prev) =>
                    prev.filter((c) => c.fromId !== n.id && c.toId !== n.id)
                  );
                }}
              >×</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const ClassicLayout = () => (
    <div className="max-w-7xl mx-auto p-3 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-56px)]">
      {/* Colonne gauche : Causes (problèmes) OU Moyens (objectifs) */}
      <div className={setPanelStateWrapper("causes", "col-span-3 row-span-9")}>
        {treeMode === "problems" ? (
          <>
            <PanelHeader
              title="Causes"
              onAdd={() =>
                addPostItToFirebase("Nouvelle cause", "causes", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.causes)
              }
            />
            <div className="p-2 h-full overflow-y-auto">
              <ColumnList items={visiblePostIts.causes} fallbackColor="pink" title="Causes" />
            </div>
          </>
        ) : (
          <>
            <PanelHeader title="Moyens" onAdd={() => addObjectiveNode("means")} />
            <div className="p-2 h-full overflow-y-auto">
              <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "means")} />
            </div>
          </>
        )}
      </div>

      <div className={`${setPanelStateWrapper("tree", "col-span-6 row-span-9")} min-w-0 min-h-0`}>
        <PanelHeader
          title={treeMode === "objectives" ? "Arbre à Objectifs" : "Arbre à Problèmes"}
          right={treeMode === "problems"
            ? <span className="text-xs text-slate-600">👥 {participantsCount}</span>
            : <span className="text-xs font-semibold text-green-700">
                ✓ {objectiveNodes.filter(n => n.validation?.status === "validated").length}/{objectiveNodes.length} validés
              </span>
          }
        />
        {/* ── Barre d’outils : deux modes ── */}
        <div className="px-2 py-1 border-b flex items-center gap-2 text-sm flex-wrap">
          <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomOut} title="Dézoomer">–</button>
          <span className="min-w-[44px] text-center font-semibold">{Math.round(zoom * 100)}%</span>
          <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomIn} title="Zoomer">+</button>
          <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomFit} title="Ajuster">Ajuster</button>
          <div className="w-px h-5 bg-slate-300 mx-1" />
          {treeMode === "problems" ? (
            <>
              <button className="px-2 py-0.5 rounded bg-violet-600 text-white text-xs font-semibold" onClick={autoLayout} title="Centrer et organiser automatiquement">Centrer</button>
              {[
                { key: "all", label: "Tout" },
                { key: "causes", label: "Causes" },
                { key: "consequences", label: "Conséquences" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${treeViewFilter === key ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"}`}
                  onClick={() => setTreeViewFilter(key)}
                  title={`Afficher : ${label}`}
                >
                  {label}
                </button>
              ))}
              <div className="w-px h-5 bg-slate-300 mx-1" />
              <button className="px-2 py-0.5 rounded bg-indigo-600 text-white" onClick={exportTreeAsPDF} title="Exporter l’arbre en PDF">PDF</button>
              <button className="px-2 py-0.5 rounded bg-emerald-600 text-white" onClick={exportTreeAsPNG} title="Exporter l’arbre en PNG">PNG</button>
            </>
          ) : (
            <>
              <button className="px-2 py-0.5 rounded bg-violet-600 text-white text-xs font-semibold" onClick={autoLayoutObjectives} title="Centrer et organiser les objectifs">Centrer</button>
              <button className="px-2 py-0.5 rounded bg-green-700 text-white text-xs font-semibold" onClick={handleGenerateObjectiveTree} title="Régénérer depuis l’arbre à problèmes">Régénérer</button>
              <div className="w-px h-5 bg-slate-300 mx-1" />
              <button className="px-2 py-0.5 rounded bg-indigo-600 text-white" onClick={exportTreeAsPDF} title="Exporter l’arbre à objectifs en PDF">PDF</button>
              <button className="px-2 py-0.5 rounded bg-emerald-600 text-white" onClick={exportTreeAsPNG} title="Exporter l’arbre à objectifs en PNG">PNG</button>
              {/* Légende statuts */}
              <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block"/>=généré</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>=validé</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>=à revoir</span>
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/>=modifié</span>
              </div>
            </>
          )}
          {treeMode === "problems" && <span className="ml-auto text-xs text-slate-500">Ctrl/⌘ + molette</span>}
        </div>

        <div
          ref={treeScrollRef}
          className="relative w-full h-[calc(100%-56px)] overflow-auto"
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.05 : 0.05;
              zoomAround(Math.max(0.2, Math.min(2, +(zoom + delta).toFixed(2))));
            }
          }}
          onFocus={(e) => {
            const scroll = e.currentTarget;
            const sl = scroll.scrollLeft;
            const st = scroll.scrollTop;
            requestAnimationFrame(() => { scroll.scrollLeft = sl; scroll.scrollTop = st; });
          }}
        >
          <div style={{ width: CANVAS_W * zoom, height: CANVAS_H_CLASSIC * zoom, position: "relative", overflow: "hidden" }}>
            <div
              ref={treeAreaRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: CANVAS_W,
                height: CANVAS_H_CLASSIC,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
                backgroundColor: treeMode === "objectives" ? "#f0fdf4" : undefined,
              }}
            >
              {treeMode === "problems" ? (
                <>
                  <svg className="absolute inset-0 w-[2000px] h-[1200px]" style={{ zIndex: 2 }}>
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#0f172a" />
                      </marker>
                    </defs>
                    {renderConnections()}
                  </svg>
                  {visiblePostIts.inTree.map(renderPostIt)}
                </>
              ) : (
                <>
                  {objectiveNodes.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 select-none">
                      <div className="text-5xl mb-4">🎯</div>
                      <div className="font-bold text-lg">Aucun objectif généré</div>
                      <div className="text-sm mt-1">Cliquez sur « Régénérer » pour transformer l’arbre à problèmes</div>
                    </div>
                  ) : (
                    <>
                      <svg className="absolute inset-0 w-[2000px] h-[1200px]" style={{ zIndex: 2 }}>
                        <defs>
                          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#1e3a5f" />
                          </marker>
                        </defs>
                        {renderObjectiveConnections()}
                      </svg>
                      {objectiveNodes.map(renderObjectivePostIt)}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Colonne droite : Conséquences (problèmes) OU Fins (objectifs) */}
      <div className={setPanelStateWrapper("consequences", "col-span-3 row-span-9")}>
        {treeMode === "problems" ? (
          <>
            <PanelHeader
              title="Conséquences"
              onAdd={() =>
                addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.consequences)
              }
            />
            <div className="p-2 h-full overflow-y-auto">
              <ColumnList items={visiblePostIts.consequences} fallbackColor="amber" title="Conséquences" />
            </div>
          </>
        ) : (
          <>
            <PanelHeader title="Fins / Finalités" onAdd={() => addObjectiveNode("ends")} />
            <div className="p-2 h-full overflow-y-auto">
              <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "ends")} />
            </div>
          </>
        )}
      </div>

      {/* Ligne basse : Problèmes suggérés (problèmes) OU Objectif central (objectifs) */}
      <div className={setPanelStateWrapper("problems", "col-span-12 row-span-3")}>
        {treeMode === "problems" ? (
          <>
            <PanelHeader
              title="Problèmes Suggérés"
              onAdd={() =>
                addPostItToFirebase("Nouveau problème", "problem", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.problem)
              }
            />
            <div className="p-2 h-full overflow-x-auto">
              <div className="flex gap-2">
                <ColumnList items={visiblePostIts.problems} fallbackColor="red" title="Problèmes" />
              </div>
            </div>
          </>
        ) : (
          <>
            <PanelHeader title="Objectif Central" onAdd={() => addObjectiveNode("central")} />
            <div className="p-2 h-full overflow-x-auto">
              <div className="flex gap-2">
                <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "central")} />
              </div>
            </div>
          </>
        )}
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
            zoomAround(Math.max(0.2, Math.min(2, +(zoom + delta).toFixed(2))));
          }
        }}
        onFocus={(e) => {
          const scroll = e.currentTarget;
          const sl = scroll.scrollLeft;
          const st = scroll.scrollTop;
          requestAnimationFrame(() => { scroll.scrollLeft = sl; scroll.scrollTop = st; });
        }}
      >
        <div style={{ width: CANVAS_W * zoom, height: CANVAS_H_FOCUS * zoom, position: "relative", flexShrink: 0, overflow: "hidden" }}>
          <div
            ref={treeAreaRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: CANVAS_W,
              height: CANVAS_H_FOCUS,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              backgroundColor: treeMode === "objectives" ? "#f0fdf4" : undefined,
            }}
          >
            {treeMode === "problems" ? (
              <>
                <svg className="absolute inset-0 w-[2000px] h-[1400px]" style={{ zIndex: 2 }}>
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#0f172a" />
                    </marker>
                  </defs>
                  {renderConnections()}
                </svg>
                {visiblePostIts.inTree.map(renderPostIt)}
              </>
            ) : (
              <>
                {objectiveNodes.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 select-none">
                    <div className="text-5xl mb-4">🎯</div>
                    <div className="font-bold text-lg">Aucun objectif généré</div>
                  </div>
                ) : (
                  <>
                    <svg className="absolute inset-0 w-[2000px] h-[1400px]" style={{ zIndex: 2 }}>
                      <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                          <polygon points="0 0, 10 3.5, 0 7" fill="#1e3a5f" />
                        </marker>
                      </defs>
                      {renderObjectiveConnections()}
                    </svg>
                    {objectiveNodes.map(renderObjectivePostIt)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Barre de contrôle flottante (focus) */}
      <div className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-white/90 backdrop-blur border rounded-lg shadow px-2 py-1 text-xs flex-wrap max-w-[90vw]">
        {treeMode === "problems" ? (
          <>
            <button className="px-2 py-0.5 rounded bg-violet-600 text-white font-semibold" onClick={autoLayout} title="Centrer et organiser">Centrer</button>
            {[
              { key: "all", label: "Tout" },
              { key: "causes", label: "Causes" },
              { key: "consequences", label: "Conséquences" },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`px-2 py-0.5 rounded font-semibold ${treeViewFilter === key ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"}`}
                onClick={() => setTreeViewFilter(key)}
              >
                {label}
              </button>
            ))}
          </>
        ) : (
          <>
            <button className="px-2 py-0.5 rounded bg-violet-600 text-white font-semibold" onClick={autoLayoutObjectives}>Centrer</button>
            <button className="px-2 py-0.5 rounded bg-green-700 text-white font-semibold" onClick={handleGenerateObjectiveTree}>Régénérer</button>
            <span className="text-green-700 font-bold">Arbre à Objectifs</span>
          </>
        )}
        <div className="w-px h-4 bg-slate-300 mx-1" />
        <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomOut}>–</button>
        <span className="min-w-[36px] text-center font-semibold">{Math.round(zoom * 100)}%</span>
        <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomIn}>+</button>
        <button className="px-2 py-0.5 rounded bg-slate-200 text-slate-700" onClick={zoomFit}>Ajuster</button>
      </div>

      {!dockHidden && (dockPosition === "right" ? (
        <div className="absolute right-2 top-16 bottom-2 w-72 bg-white/95 backdrop-blur border rounded-lg shadow p-2 overflow-y-auto z-30">
          {treeMode === "problems" ? (
            <>
              <div className="text-sm font-bold mb-2">📥 Zones de collecte</div>
              <div className="space-y-4">
                <DockSection title="Causes" onAdd={() => addPostItToFirebase("Nouvelle cause", "causes", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.causes)}>
                  <ColumnList items={visiblePostIts.causes} fallbackColor="pink" title="Causes" />
                </DockSection>
                <DockSection title="Conséquences" onAdd={() => addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.consequences)}>
                  <ColumnList items={visiblePostIts.consequences} fallbackColor="amber" title="Conséquences" />
                </DockSection>
                <DockSection title="Problèmes" onAdd={() => addPostItToFirebase("Nouveau problème", "problem", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.problem)}>
                  <ColumnList items={visiblePostIts.problems} fallbackColor="red" title="Problèmes" />
                </DockSection>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold mb-2 text-green-700">🎯 Objectifs</div>
              <div className="space-y-4">
                <DockSection title="Moyens" onAdd={() => addObjectiveNode("means")}>
                  <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "means")} />
                </DockSection>
                <DockSection title="Fins" onAdd={() => addObjectiveNode("ends")}>
                  <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "ends")} />
                </DockSection>
                <DockSection title="Objectif Central" onAdd={() => addObjectiveNode("central")}>
                  <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "central")} />
                </DockSection>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="absolute left-2 right-2 bottom-2 bg-white/95 backdrop-blur border rounded-lg shadow p-2 z-30">
          {treeMode === "problems" ? (
            <>
              <div className="text-sm font-bold mb-2">📥 Zones de collecte</div>
              <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                <DockSection title="Causes" onAdd={() => addPostItToFirebase("Nouvelle cause", "causes", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.causes)}>
                  <ColumnList items={visiblePostIts.causes} fallbackColor="pink" title="Causes" />
                </DockSection>
                <DockSection title="Conséquences" onAdd={() => addPostItToFirebase("Nouvelle conséquence", "consequences", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.consequences)}>
                  <ColumnList items={visiblePostIts.consequences} fallbackColor="amber" title="Conséquences" />
                </DockSection>
                <DockSection title="Problèmes" onAdd={() => addPostItToFirebase("Nouveau problème", "problem", "Modérateur", null, null, false, CATEGORY_DEFAULT_COLOR.problem)}>
                  <ColumnList items={visiblePostIts.problems} fallbackColor="red" title="Problèmes" />
                </DockSection>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold mb-2 text-green-700">🎯 Objectifs</div>
              <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                <DockSection title="Moyens" onAdd={() => addObjectiveNode("means")}>
                  <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "means")} />
                </DockSection>
                <DockSection title="Fins" onAdd={() => addObjectiveNode("ends")}>
                  <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "ends")} />
                </DockSection>
                <DockSection title="Objectif Central" onAdd={() => addObjectiveNode("central")}>
                  <ObjectiveColumnList items={objectiveNodes.filter((n) => n.objectiveType === "central")} />
                </DockSection>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );

  function DockSection({ title, children, onAdd }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-sm">{title}</div>
          {onAdd && (
            <button
              className="w-5 h-5 rounded bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center justify-center"
              title={`Ajouter — ${title}`}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={onAdd}
            >+</button>
          )}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ══════════════════════════════ HEADER ══════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center h-14 px-4 gap-0 min-w-0">

          {/* ── 1. Brand ── */}
          <div className="flex items-center gap-2.5 pr-4 border-r border-gray-100 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
              <span className="text-sm leading-none select-none">🌳</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-gray-900 leading-tight whitespace-nowrap">
                Arbre à Problèmes
              </div>
              <div className="text-[10px] text-gray-400 font-mono leading-tight tracking-wide">
                {sessionId}
              </div>
            </div>
          </div>

          {/* ── 2. Projet · Thème ── */}
          <div className="flex items-center gap-0 px-4 flex-1 min-w-0 border-r border-gray-100">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Folder className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <input
                className="text-sm font-semibold text-gray-800 bg-transparent border-0 outline-none w-36 truncate placeholder-gray-300 hover:placeholder-gray-400 transition"
                placeholder="Nom du projet"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={async () => {
                  await setDoc(doc(db, "sessions", sessionId), { projectName }, { merge: true });
                }}
              />
            </div>
            <span className="text-gray-200 px-2 shrink-0 hidden md:block">·</span>
            <div className="items-center gap-1.5 flex-1 min-w-0 hidden md:flex">
              <Tag className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              <input
                className="text-sm text-gray-500 bg-transparent border-0 outline-none flex-1 min-w-0 truncate placeholder-gray-300 hover:placeholder-gray-400 transition"
                placeholder="Thème"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                onBlur={async () => {
                  await setDoc(doc(db, "sessions", sessionId), { theme }, { merge: true });
                }}
              />
            </div>
          </div>

          {/* ── 3. Palette de couleurs ── */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 border-r border-gray-100 shrink-0">
            {Object.keys(COLOR_PALETTE).map((k) => (
              <button
                key={k}
                type="button"
                className={[
                  "w-4 h-4 rounded-full transition-all duration-150",
                  activeColor === k
                    ? "ring-2 ring-offset-1 ring-gray-600 scale-125"
                    : "hover:scale-110 opacity-70 hover:opacity-100",
                ].join(" ")}
                style={{ backgroundColor: COLOR_PALETTE[k].bg }}
                title={`Couleur active : ${k}`}
                onClick={() => setActiveColor(k)}
              />
            ))}
          </div>

          {/* ── 4. Outils ── */}
          <div className="flex items-center gap-0.5 px-3 border-r border-gray-100 shrink-0">
            <HdrBtn
              icon={Paintbrush}
              label="Peindre"
              active={paintMode}
              activeClass="bg-amber-100 text-amber-700"
              tooltip="Mode peinture — appliquer la couleur active sur les post-its"
              onClick={() => {
                setPaintMode((v) => !v);
                if (!paintMode) { setIsConnecting(false); setConnectSourceId(null); }
              }}
            />
            <HdrBtn
              icon={Link2}
              label="Connecter"
              active={isConnecting}
              activeClass="bg-blue-100 text-blue-700"
              tooltip="Mode connexion — relier des post-its"
              onClick={() => {
                setIsConnecting((v) => !v);
                setConnectSourceId(null);
                if (!isConnecting) setPaintMode(false);
              }}
            />
          </div>

          {/* ── 5. Vue ── */}
          <div className="flex items-center gap-0.5 px-3 border-r border-gray-100 shrink-0">
            <HdrBtn
              icon={layoutMode === "classic" ? Maximize2 : LayoutGrid}
              label={layoutMode === "classic" ? "Focus" : "Classique"}
              tooltip={layoutMode === "classic" ? "Vue plein écran (arbre uniquement)" : "Vue classique (colonnes)"}
              onClick={() => setLayoutMode((m) => (m === "classic" ? "focus" : "classic"))}
            />
            {layoutMode === "focus" && (
              <>
                <HdrBtn
                  icon={dockPosition === "right" ? PanelRight : PanelBottom}
                  tooltip={`Dock : ${dockPosition === "right" ? "déplacer en bas" : "déplacer sur le côté"}`}
                  onClick={() => setDockPosition((d) => (d === "right" ? "bottom" : "right"))}
                />
                <HdrBtn
                  icon={dockHidden ? Eye : EyeOff}
                  tooltip={dockHidden ? "Afficher le dock" : "Masquer le dock"}
                  onClick={() => setDockHidden((h) => !h)}
                />
              </>
            )}
          </div>

          {/* ── 6. Session ── */}
          <div className="flex items-center gap-0.5 px-3 border-r border-gray-100 shrink-0">
            <HdrBtn
              icon={QrCode}
              tooltip="Afficher le QR code participants"
              onClick={() => setShowQR((v) => !v)}
            />
            <HdrBtn
              icon={RefreshCw}
              tooltip="Créer une nouvelle session"
              onClick={newSession}
            />
          </div>

          {/* ── 7. Statut IA ── */}
          <div className="flex items-center px-3 border-r border-gray-100 shrink-0">
            <div
              className={[
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium select-none",
                aiConfig.configured
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-600",
              ].join(" ")}
              title={
                aiConfig.configured
                  ? `IA configurée : ${AI_PROVIDER_DEFAULTS[aiConfig.provider]?.label || aiConfig.provider}`
                  : "IA non configurée — lancez une nouvelle session pour configurer"
              }
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">
                {aiConfig.configured
                  ? (AI_PROVIDER_DEFAULTS[aiConfig.provider]?.label || aiConfig.provider)
                  : "IA"}
              </span>
              <span
                className={[
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  aiConfig.configured ? "bg-emerald-500" : "bg-amber-400",
                ].join(" ")}
              />
            </div>
          </div>

          {/* ── 8. CTAs — Analyse + Objectifs ── */}
          <div className="flex items-center gap-2 pl-3 shrink-0">
            {/* Retour aux problèmes (visible seulement en mode objectifs) */}
            {treeMode === "objectives" && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                onClick={() => setTreeMode("problems")}
                title="Retour à l'arbre à problèmes"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Problèmes</span>
              </button>
            )}

            {/* Bouton Objectifs */}
            <button
              type="button"
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                treeMode === "objectives"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white",
                !postIts.some((p) => p.isInTree) ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
              onClick={handleGenerateObjectiveTree}
              disabled={!postIts.some((p) => p.isInTree)}
              title={
                treeMode === "objectives"
                  ? "Régénérer l'arbre à objectifs"
                  : "Générer l'arbre à objectifs"
              }
            >
              <Target className="w-3.5 h-3.5" />
              <span>{treeMode === "objectives" ? "Régénérer" : "Objectifs"}</span>
            </button>

            {/* Bouton Analyser */}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("analysis", "1");
                url.searchParams.delete("mode");
                window.open(url.toString(), "_blank", "noopener");
              }}
              title="Ouvrir le panneau d'analyse (nouvel onglet)"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Analyser</span>
            </button>
          </div>

        </div>
      </header>

      {layoutMode === "classic" ? <ClassicLayout /> : <FocusLayout />}

      {showQR && (
        <div className="fixed top-[56px] right-3 z-50 w-[320px] bg-white rounded shadow-lg border">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="font-semibold">QR participants</div>
            <button className="w-6 h-6 rounded bg-slate-200" onClick={() => setShowQR(false)} title="Fermer">×</button>
          </div>
          <div className="p-3">
            <div className="w-full flex justify-center">
              <QRCodeGenerator url={participantUrl} showLink={true} size={120} />
            </div>
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
      {/* ── Modale d'édition d'un objectif ── */}
      {editingObjectiveId && (() => {
        const node = objectiveNodes.find((n) => n.id === editingObjectiveId);
        if (!node) return null;
        const statusOptions = [
          { value: "generated", label: "Généré (non relu)" },
          { value: "validated", label: "Validé" },
          { value: "to_review", label: "À revoir" },
          { value: "edited",    label: "Modifié" },
        ];
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl w-[480px] p-5">
              <div className="font-bold text-base mb-1">Modifier l'objectif</div>
              {node.sourceLabel && (
                <div className="text-xs text-slate-500 mb-3">
                  Source : <span className="italic">"{node.sourceLabel}"</span>
                </div>
              )}

              <textarea
                rows={3}
                value={editingObjectiveText}
                onChange={(e) => setEditingObjectiveText(e.target.value.slice(0, MAX_CHARS))}
                className="w-full p-3 border-2 border-gray-300 rounded-lg font-extrabold text-sm"
                placeholder="Étiquette de l'objectif…"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    // sauvegarder ci-dessous
                    const trimmed = (editingObjectiveText || "").trim().slice(0, MAX_CHARS);
                    if (!trimmed) return;
                    setObjectiveNodes((prev) =>
                      prev.map((n) =>
                        n.id === editingObjectiveId
                          ? { ...n, content: trimmed, validation: { ...n.validation, status: "edited" } }
                          : n
                      )
                    );
                    setEditingObjectiveId(null);
                    setEditingObjectiveText("");
                  }
                }}
              />
              <div className="flex items-center justify-between mt-1 text-xs text-gray-500 mb-3">
                <span>{MAX_CHARS - (editingObjectiveText?.length || 0)} car. restants</span>
                <span>Ctrl/⌘ + Entrée pour enregistrer</span>
              </div>

              {/* Statut de validation */}
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Statut de validation</label>
                <div className="flex gap-2 flex-wrap">
                  {statusOptions.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        node.validation?.status === value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-slate-100 text-slate-700 border-slate-300 hover:border-indigo-400"
                      }`}
                      onClick={() =>
                        setObjectiveNodes((prev) =>
                          prev.map((n) =>
                            n.id === editingObjectiveId
                              ? { ...n, validation: { ...n.validation, status: value } }
                              : n
                          )
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Critères GAR */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Critères de validation</label>
                <div className="flex gap-4">
                  {[
                    { key: "desirable", label: "Souhaitable" },
                    { key: "feasible",  label: "Réalisable" },
                    { key: "logical",   label: "Logique" },
                  ].map(({ key, label }) => {
                    const val = node.validation?.[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${
                          val === true  ? "bg-green-100 text-green-700 border-green-400" :
                          val === false ? "bg-red-100   text-red-700   border-red-400"   :
                                          "bg-slate-100 text-slate-500 border-slate-300"
                        }`}
                        onClick={() => {
                          const next = val === null || val === undefined ? true : val === true ? false : null;
                          setObjectiveNodes((prev) =>
                            prev.map((n) =>
                              n.id === editingObjectiveId
                                ? { ...n, validation: { ...n.validation, [key]: next } }
                                : n
                            )
                          );
                        }}
                        title="Cliquer pour basculer : non renseigné → ✓ → ✗ → non renseigné"
                      >
                        {val === true ? "✓ " : val === false ? "✗ " : "? "}{label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  className="px-3 py-1 rounded bg-red-100 text-red-700 text-sm font-semibold hover:bg-red-200"
                  onClick={() => {
                    setObjectiveNodes((prev) => prev.filter((n) => n.id !== editingObjectiveId));
                    setObjectiveConnections((prev) =>
                      prev.filter((c) => c.fromId !== editingObjectiveId && c.toId !== editingObjectiveId)
                    );
                    setEditingObjectiveId(null);
                    setEditingObjectiveText("");
                  }}
                >
                  Supprimer
                </button>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded bg-slate-200 text-slate-800"
                    onClick={() => { setEditingObjectiveId(null); setEditingObjectiveText(""); }}
                  >
                    Annuler
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-indigo-600 text-white font-semibold"
                    onClick={() => {
                      const trimmed = (editingObjectiveText || "").trim().slice(0, MAX_CHARS);
                      if (!trimmed) return;
                      setObjectiveNodes((prev) =>
                        prev.map((n) =>
                          n.id === editingObjectiveId
                            ? { ...n, content: trimmed, validation: { ...n.validation, status: "edited" } }
                            : n
                        )
                      );
                      setEditingObjectiveId(null);
                      setEditingObjectiveText("");
                    }}
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {pendingReplacement && (() => {
        const existing = postIts.find((p) => p.id === pendingReplacement.existingId);
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl w-[460px] p-5">
              <div className="font-bold text-base mb-2">Remplacer le problème central ?</div>
              <p className="text-sm text-slate-600 mb-2">Un problème central est déjà sur l'arbre :</p>
              <div className="p-3 bg-red-100 border border-red-300 rounded font-bold text-sm mb-4 whitespace-pre-wrap">
                {existing?.content}
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Le remplacer par le nouveau ? L'ancien retournera dans&nbsp;
                <span className="font-semibold">Problèmes Suggérés</span>.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  className="px-4 py-2 rounded bg-slate-200 text-slate-800 font-semibold"
                  onClick={() => {
                    updatePostItInFirebase(pendingReplacement.draggedId, { isInTree: false });
                    setPostIts((prev) =>
                      prev.map((p) =>
                        p.id === pendingReplacement.draggedId ? { ...p, isInTree: false } : p
                      )
                    );
                    setPendingReplacement(null);
                  }}
                >
                  Non, annuler
                </button>
                <button
                  className="px-4 py-2 rounded bg-red-600 text-white font-semibold"
                  onClick={() => {
                    updatePostItInFirebase(pendingReplacement.existingId, { isInTree: false });
                    setPostIts((prev) =>
                      prev.map((p) =>
                        p.id === pendingReplacement.existingId ? { ...p, isInTree: false } : p
                      )
                    );
                    setPendingReplacement(null);
                  }}
                >
                  Oui, remplacer
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

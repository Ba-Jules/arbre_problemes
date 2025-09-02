// src/components/AnalysisPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase-config";

const CATEGORY_LABELS = {
  problem: "Problèmes",
  causes: "Causes",
  consequences: "Conséquences",
};

function useDataFallback({ sessionId, postItsProp, connectionsProp }) {
  const [postIts, setPostIts] = useState(postItsProp || []);
  const [connections, setConnections] = useState(connectionsProp || []);

  useEffect(() => setPostIts(postItsProp || []), [postItsProp]);
  useEffect(() => setConnections(connectionsProp || []), [connectionsProp]);

  useEffect(() => {
    if (postItsProp && connectionsProp) return;
    if (!sessionId) return;

    const unsubP = onSnapshot(
      query(collection(db, "postits"), where("sessionId", "==", sessionId)),
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setPostIts(arr);
      }
    );

    const unsubC = onSnapshot(
      query(collection(db, "connections"), where("sessionId", "==", sessionId)),
      (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setConnections(arr);
      }
    );

    return () => {
      unsubP && unsubP();
      unsubC && unsubC();
    };
  }, [sessionId, postItsProp, connectionsProp]);

  return { postIts, connections };
}

function buildGraph(postIts, connections) {
  const nodes = {};
  postIts.forEach((p) => {
    nodes[p.id] = {
      ...p,
      indeg: 0,
      outdeg: 0,
    };
  });

  const edges = connections
    .filter((c) => nodes[c.fromId] && nodes[c.toId])
    .map((c) => ({ from: c.fromId, to: c.toId }));

  edges.forEach((e) => {
    nodes[e.from].outdeg++;
    nodes[e.to].indeg++;
  });

  const adj = {};
  const radj = {};
  Object.keys(nodes).forEach((id) => {
    adj[id] = [];
    radj[id] = [];
  });
  edges.forEach((e) => {
    adj[e.from].push(e.to);
    radj[e.to].push(e.from);
  });

  return { nodes, edges, adj, radj };
}

function findCyclesLimited(adj, limit = 3, maxLen = 8) {
  // DFS simple, retourne quelques cycles au plus
  const cycles = [];
  const stack = [];
  const visited = new Set();
  const keys = Object.keys(adj);

  const dfs = (u, start, seenSet) => {
    if (cycles.length >= limit) return;
    seenSet.add(u);
    stack.push(u);
    for (const v of adj[u] || []) {
      if (v === start && stack.length > 1) {
        cycles.push([...stack, start]);
        if (cycles.length >= limit) break;
      } else if (!seenSet.has(v) && stack.length < maxLen) {
        dfs(v, start, new Set(seenSet));
        if (cycles.length >= limit) break;
      }
    }
    stack.pop();
  };

  for (const k of keys) {
    if (cycles.length >= limit) break;
    dfs(k, k, new Set());
  }
  return cycles;
}

function topByDegree(nodes, n = 5) {
  const arr = Object.values(nodes);
  arr.sort((a, b) => b.indeg + b.outdeg - (a.indeg + a.outdeg));
  return arr.slice(0, n);
}

function formatList(items, getText) {
  if (!items || items.length === 0) return "—";
  return items.map(getText).join("; ");
}

function generateAnalysisText({ postIts, connections, projectName, theme }) {
  const { nodes, edges, adj, radj } = buildGraph(postIts, connections);

  const total = postIts.length;
  const byCat = {
    problem: postIts.filter((p) => p.category === "problem").length,
    causes: postIts.filter((p) => p.category === "causes").length,
    consequences: postIts.filter((p) => p.category === "consequences").length,
  };
  const inTree = postIts.filter((p) => p.isInTree).length;
  const notInTree = total - inTree;

  const roots = Object.values(nodes).filter((n) => n.indeg === 0 && n.outdeg > 0);
  const leaves = Object.values(nodes).filter((n) => n.outdeg === 0 && n.indeg > 0);
  const isolates = Object.values(nodes).filter((n) => n.indeg === 0 && n.outdeg === 0);

  const hot = topByDegree(nodes, 5);
  const cycles = findCyclesLimited(adj, 3, 8);

  const pickTitles = (arr) =>
    arr.map((n) => `« ${n.content} » [${CATEGORY_LABELS[n.category] || n.category}]`);

  // Chemins “cause → … → conséquence” (échantillon)
  const causeIds = Object.values(nodes).filter((n) => n.category === "causes").map((n) => n.id);
  const consIds = new Set(
    Object.values(nodes).filter((n) => n.category === "consequences").map((n) => n.id)
  );

  const samplePaths = [];
  const limitPaths = 6;
  for (const cid of causeIds) {
    if (samplePaths.length >= limitPaths) break;
    // BFS jusqu’à une conséquence
    const q = [[cid]];
    const seen = new Set([cid]);
    let found = false;
    while (q.length && !found) {
      const path = q.shift();
      const last = path[path.length - 1];
      if (consIds.has(last) && path.length > 1) {
        samplePaths.push(path);
        found = true;
        break;
      }
      for (const nxt of adj[last] || []) {
        if (!seen.has(nxt)) {
          seen.add(nxt);
          q.push([...path, nxt]);
        }
      }
    }
  }

  const idToTitle = (id) => nodes[id]?.content || id;
  const formatPath = (p) => p.map((id) => `« ${idToTitle(id)} »`).join(" → ");

  const header = [];
  if (projectName || theme) {
    header.push(`Projet : ${projectName || "—"} — Thème : ${theme || "—"}`);
  }

  return [
    header.length ? header.join("\n") + "\n" : "",
    "SYNTHÈSE AUTOMATIQUE (éditable)\n",
    `Aperçu global : ${total} étiquettes, ${edges.length} liaisons.`,
    `Dans l'arbre : ${inTree} — Hors arbre : ${notInTree}.`,
    `Répartition : Problèmes ${byCat.problem}, Causes ${byCat.causes}, Conséquences ${byCat.consequences}.`,
    "",
    "Points structurants (nœuds les plus connectés) :",
    formatList(hot, (n) => `« ${n.content} » (in:${n.indeg}/out:${n.outdeg})`),
    "",
    "Entrées majeures (sans parents) :",
    formatList(roots, (n) => `« ${n.content} »`),
    "",
    "Sorties majeures (sans enfants) :",
    formatList(leaves, (n) => `« ${n.content} »`),
    "",
    isolates.length
      ? `Étiquettes isolées à intégrer ou supprimer : ${formatList(
          isolates,
          (n) => `« ${n.content} »`
        )}`
      : "Pas d'étiquettes isolées détectées.",
    "",
    samplePaths.length
      ? "Chaînes typiques « cause → … → conséquence » :\n- " +
        samplePaths.map(formatPath).join("\n- ")
      : "Chaînes « cause → … → conséquence » : non détectées (ou non reliées).",
    "",
    cycles.length
      ? "Boucles à résoudre (risque de circularité) :\n- " +
        cycles
          .map((cy) => cy.map((id) => `« ${idToTitle(id)} »`).join(" → "))
          .join("\n- ")
      : "Aucune boucle détectée.",
    "",
    "Pistes d’action (brouillon) :",
    "- Regrouper les causes proches et supprimer les doublons.",
    "- Réduire les conséquences en impacts mesurables.",
    "- Définir un(s) problème(s) central(aux) explicitement validé(s).",
    "- Vérifier l’absence de contradictions dans les liaisons.",
    "- Prioriser les chaînes cause → conséquence par fréquence et criticité.",
  ].join("\n");
}

export default function AnalysisPanel({
  sessionId,
  postIts: postItsProp,
  connections: connectionsProp,
  projectName,
  theme,
}) {
  const { postIts, connections } = useDataFallback({
    sessionId,
    postItsProp,
    connectionsProp,
  });

  const [analysisText, setAnalysisText] = useState("");

  const metrics = useMemo(() => {
    const byCat = {
      problem: postIts.filter((p) => p.category === "problem").length,
      causes: postIts.filter((p) => p.category === "causes").length,
      consequences: postIts.filter((p) => p.category === "consequences").length,
    };
    return {
      total: postIts.length,
      edges: connections.length,
      byCat,
    };
  }, [postIts, connections]);

  useEffect(() => {
    // (Re)générer si vide
    if (!analysisText) {
      setAnalysisText(
        generateAnalysisText({ postIts, connections, projectName, theme })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIts, connections, projectName, theme]);

  const regenerate = () => {
    setAnalysisText(
      generateAnalysisText({ postIts, connections, projectName, theme })
    );
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(analysisText || "");
      alert("Copié dans le presse-papiers ✅");
    } catch {
      alert("Impossible de copier.");
    }
  };

  const exportPDF = async () => {
    // Tentative avec jsPDF si dispo, sinon fallback impression
    try {
      const mod = await import("jspdf"); // nécessite jspdf installé
      const { jsPDF } = mod;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 40;
      const maxWidth = 515; // 595 - 2*40
      const title = `Analyse — ${projectName || "Projet"}${theme ? " — " + theme : ""}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(title, margin, 40);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      const lines = doc.splitTextToSize(analysisText || "", maxWidth);
      let y = 70;
      lines.forEach((line) => {
        if (y > 800) {
          doc.addPage();
          y = 40;
        }
        doc.text(line, margin, y);
        y += 16;
      });

      doc.save(`analyse_${sessionId || "session"}.pdf`);
    } catch (e) {
      // Fallback : fenêtre imprimable
      const w = window.open("", "_blank", "noopener");
      if (!w) return;
      w.document.write(`
        <html>
          <head>
            <meta charset="utf-8"/>
            <title>Analyse — ${projectName || "Projet"}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
              h1 { font-size: 18px; margin-bottom: 16px; }
              pre { white-space: pre-wrap; word-wrap: break-word; font-size: 12px; }
            </style>
          </head>
          <body>
            <h1>Analyse — ${projectName || "Projet"}${theme ? " — " + theme : ""}</h1>
            <pre>${(analysisText || "").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
          </body>
        </html>
      `);
      w.document.close();
      w.focus();
      w.print();
    }
  };

  return (
    <div className="space-y-3">
      {/* Statistiques rapides */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Étiquettes : {metrics.total}</Badge>
        <Badge>Liens : {metrics.edges}</Badge>
        <Badge titre="Problèmes">{metrics.byCat.problem}</Badge>
        <Badge titre="Causes" color="pink">{metrics.byCat.causes}</Badge>
        <Badge titre="Conséquences" color="green">{metrics.byCat.consequences}</Badge>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="px-3 py-1 rounded bg-emerald-600 text-white text-sm font-semibold"
          onClick={regenerate}
          title="Recalculer la synthèse automatique"
        >
          Régénérer la synthèse
        </button>
        <button
          className="px-3 py-1 rounded bg-slate-200 text-slate-800 text-sm font-semibold"
          onClick={copyToClipboard}
        >
          Copier le texte
        </button>
        <button
          className="px-3 py-1 rounded bg-indigo-600 text-white text-sm font-semibold"
          onClick={exportPDF}
        >
          Télécharger en PDF
        </button>
      </div>

      {/* Éditeur d'analyse (modifiable) */}
      <div>
        <label className="block text-sm font-bold mb-1">Synthèse IA (éditable)</label>
        <textarea
          rows={18}
          value={analysisText}
          onChange={(e) => setAnalysisText(e.target.value)}
          className="w-full p-3 border-2 border-gray-300 rounded-lg font-mono text-sm"
          placeholder="La synthèse apparaîtra ici…"
        />
      </div>

      {/* Préparation futur “arbre de décision” */}
      <div className="text-xs text-slate-500">
        À venir : génération d’un <strong>arbre de décision</strong> à partir des chaînes cause → conséquence,
        avec critères personnalisés (pondération, probabilité, impact, faisabilité, etc.).
      </div>
    </div>
  );
}

/* ====== Petits composants ====== */

function Badge({ children, titre, color }) {
  const bg =
    color === "pink" ? "bg-pink-100 text-pink-800 border-pink-300"
    : color === "green" ? "bg-green-100 text-green-800 border-green-300"
    : "bg-slate-100 text-slate-800 border-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${bg}`}>
      {titre ? <strong>{titre}:</strong> : null} {children}
    </span>
  );
}

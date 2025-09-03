// src/components/AnalysisPanel.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Panneau d'analyse (ouvre dans un nouvel onglet).
 * Affiche métriques, graphiques colorés et synthèse IA locale (éditable).
 */
export default function AnalysisPanel({
  sessionId,
  postIts = [],
  connections = [],
  projectName = "",
  theme = "",
}) {
  const containerRef = useRef(null);

  /* ===================== Couleurs (cohérentes avec l'appli) ===================== */
  const COLORS = {
    problem: "#ef4444",       // rouge
    causes: "#fb7185",        // saumon
    consequences: "#22c55e",  // vert
    inTree: "#0ea5e9",        // bleu clair
    offTree: "#94a3b8",       // gris ardoise
    bars: "#6366f1",          // indigo
    bars2: "#f59e0b",         // amber
    stroke: "#111827",        // presque noir
  };

  /* ===================== Pré-calculs ===================== */

  const byId = useMemo(
    () => Object.fromEntries((postIts || []).map((p) => [p.id, p])),
    [postIts]
  );

  const graph = useMemo(() => {
    const inMap = new Map();
    const outMap = new Map();
    postIts.forEach((p) => {
      inMap.set(p.id, []);
      outMap.set(p.id, []);
    });
    connections.forEach((c) => {
      if (!byId[c.fromId] || !byId[c.toId]) return;
      outMap.get(c.fromId)?.push(c.toId);
      inMap.get(c.toId)?.push(c.fromId);
    });
    return { inMap, outMap };
  }, [postIts, connections, byId]);

  const degreeStats = useMemo(() => {
    const rows = postIts.map((p) => {
      const indeg = graph.inMap.get(p.id)?.length || 0;
      const outdeg = graph.outMap.get(p.id)?.length || 0;
      return {
        id: p.id,
        label: (p.content || "").slice(0, 40) || "(sans texte)",
        indeg,
        outdeg,
        deg: indeg + outdeg,
        isInTree: !!p.isInTree,
        category: p.category || "problem",
      };
    });

    const top = rows
      .filter((r) => r.isInTree)
      .sort((a, b) => b.deg - a.deg)
      .slice(0, 8);

    // Totaux entrées/sorties par catégorie (pour le graphe 4)
    const sumCat = {
      problem: { indeg: 0, outdeg: 0 },
      causes: { indeg: 0, outdeg: 0 },
      consequences: { indeg: 0, outdeg: 0 },
    };
    rows.forEach((r) => {
      if (!sumCat[r.category]) return;
      sumCat[r.category].indeg += r.indeg;
      sumCat[r.category].outdeg += r.outdeg;
    });

    return { rows, top, sumCat };
  }, [postIts, graph]);

  const counts = useMemo(() => {
    const total = postIts.length;
    const links = connections.length;
    const inTree = postIts.filter((p) => p.isInTree).length;
    const offTree = total - inTree;

    const cats = {
      problem: postIts.filter((p) => p.category === "problem").length,
      causes: postIts.filter((p) => p.category === "causes").length,
      consequences: postIts.filter((p) => p.category === "consequences").length,
    };

    const roots = postIts.filter(
      (p) => p.isInTree && (graph.inMap.get(p.id)?.length || 0) === 0
    );
    const leaves = postIts.filter(
      (p) => p.isInTree && (graph.outMap.get(p.id)?.length || 0) === 0
    );

    const isolated = postIts.filter((p) => {
      if (!p.isInTree) return false;
      const indeg = graph.inMap.get(p.id)?.length || 0;
      const outdeg = graph.outMap.get(p.id)?.length || 0;
      return indeg + outdeg === 0;
    });

    // Dans/Hors arbre par catégorie (pour graphe 2)
    const inOutByCat = ["problem", "causes", "consequences"].map((cat) => {
      const totalCat = postIts.filter((p) => p.category === cat).length;
      const inCat = postIts.filter((p) => p.category === cat && p.isInTree).length;
      return {
        name: displayCat(cat),
        "Dans l'arbre": inCat,
        "Hors arbre": Math.max(0, totalCat - inCat),
        _cat: cat,
      };
    });

    return {
      total,
      links,
      inTree,
      offTree,
      cats,
      roots,
      leaves,
      isolated,
      inOutByCat,
    };
  }, [postIts, connections, graph]);

  /* ===================== Données graphiques ===================== */

  const categoryData = useMemo(
    () => [
      { name: "Problèmes", value: counts.cats.problem, color: COLORS.problem },
      { name: "Causes", value: counts.cats.causes, color: COLORS.causes },
      { name: "Conséquences", value: counts.cats.consequences, color: COLORS.consequences },
    ],
    [counts, COLORS]
  );

  const barTopNodes = useMemo(() => {
    return degreeStats.top.map((r) => ({
      label: r.label,
      Degré: r.deg,
    }));
  }, [degreeStats]);

  const indegOutdegByCat = useMemo(() => {
    const s = degreeStats.sumCat;
    return [
      { name: "Problèmes", Entrées: s.problem.indeg, Sorties: s.problem.outdeg, _cat: "problem" },
      { name: "Causes", Entrées: s.causes.indeg, Sorties: s.causes.outdeg, _cat: "causes" },
      { name: "Conséquences", Entrées: s.consequences.indeg, Sorties: s.consequences.outdeg, _cat: "consequences" },
    ];
  }, [degreeStats]);

  /* ===================== Chaînes cause → … → conséquence ===================== */

  const sampleChains = useMemo(() => {
    const chains = [];
    const maxLen = 4;

    const dfs = (path) => {
      const last = path[path.length - 1];
      const lastNode = byId[last];
      if (!lastNode) return;
      if (path.length > maxLen) return;

      if (
        path.length >= 2 &&
        lastNode.category === "consequences" &&
        byId[path[0]]?.category === "causes"
      ) {
        chains.push([...path]);
      }

      const nexts = graph.outMap.get(last) || [];
      nexts.forEach((n) => {
        if (!path.includes(n)) dfs([...path, n]);
      });
    };

    postIts
      .filter((p) => p.isInTree && p.category === "causes")
      .forEach((p) => dfs([p.id]));

    return chains.slice(0, 5).map((ids) => ids.map((id) => byId[id]?.content || "(?)"));
  }, [postIts, graph, byId]);

  /* ===================== Synthèse IA locale ===================== */

  const initialSummary = useMemo(() => {
    const lines = [];

    lines.push("SYNTHÈSE AUTOMATIQUE (éditable)");
    lines.push("");
    lines.push(
      `Aperçu global : ${counts.total} étiquettes, ${counts.links} liaisons.`
    );
    lines.push(
      `Dans l'arbre : ${counts.inTree} — Hors arbre : ${counts.offTree}.`
    );
    lines.push(
      `Répartition : Problèmes ${counts.cats.problem}, Causes ${counts.cats.causes}, Conséquences ${counts.cats.consequences}.`
    );
    lines.push("");

    if (degreeStats.top.length) {
      lines.push("Points structurants (nœuds les plus connectés) :");
      degreeStats.top.forEach((n) =>
        lines.push(`- ${n.label} (degré ${n.deg})`)
      );
    } else {
      lines.push("Points structurants : —");
    }
    lines.push("");

    if (counts.roots.length) {
      lines.push("Entrées majeures (sans parents) :");
      counts.roots.slice(0, 6).forEach((p) =>
        lines.push(`- ${trimTxt(p.content)}`)
      );
    } else {
      lines.push("Entrées majeures (sans parents) : —");
    }
    lines.push("");

    if (counts.leaves.length) {
      lines.push("Sorties majeures (sans enfants) :");
      counts.leaves.slice(0, 6).forEach((p) =>
        lines.push(`- ${trimTxt(p.content)}`)
      );
    } else {
      lines.push("Sorties majeures (sans enfants) : —");
    }
    lines.push("");

    if (counts.isolated.length) {
      lines.push(
        `Étiquettes isolées dans l'arbre : ${counts.isolated.length} (à relier ou à supprimer).`
      );
    } else {
      lines.push("Pas d'étiquettes isolées détectées.");
    }
    lines.push("");

    if (sampleChains.length) {
      lines.push("Chaînes « cause → … → conséquence » (exemples) :");
      sampleChains.forEach((ch, i) => {
        lines.push(`- Chaîne ${i + 1} : ${ch.map(trimTxt).join(" → ")}`);
      });
    } else {
      lines.push(
        "Chaînes « cause → … → conséquence » : non détectées (ou non reliées)."
      );
    }
    lines.push("");

    // Recos heuristiques
    lines.push("Recommandations (heuristiques) :");
    if (counts.isolated.length) {
      lines.push(
        "- Relier ou écarter les étiquettes isolées pour clarifier la logique."
      );
    }
    if (counts.roots.length > counts.leaves.length + 3) {
      lines.push(
        "- Beaucoup d'entrées pour peu de sorties : regrouper les causes et préciser les conséquences concrètes."
      );
    }
    if (degreeStats.top[0]?.deg >= 4) {
      lines.push(
        `- Le nœud « ${degreeStats.top[0].label} » est très central : valider qu'il ne regroupe pas plusieurs idées distinctes.`
      );
    }
    lines.push(
      "- Vérifier que chaque conséquence découle d'au moins une cause et qu'un problème central est explicite."
    );
    lines.push(
      "- En fin d'atelier : formaliser un plan d'actions priorisé (impact × faisabilité)."
    );

    return lines.join("\n");
  }, [counts, degreeStats, sampleChains]);

  const [summary, setSummary] = useState(initialSummary);
  useEffect(() => setSummary(initialSummary), [initialSummary]);

  /* ===================== Actions ===================== */

  const copySummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary);
      alert("Texte copié ✅");
    } catch {
      window.prompt("Copiez le texte :", summary);
    }
  }, [summary]);

  const exportPDF = useCallback(async () => {
    const node = containerRef.current;
    if (!node) return;
    const canvas = await html2canvas(node, {
      scale: 2.5,
      backgroundColor: "#ffffff",
      useCORS: true,
      letterRendering: true,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(imgData, "PNG", x, y, w, h);
    pdf.save(`analyse-${sessionId}.pdf`);
  }, [sessionId]);

  /* ===================== Rendu ===================== */

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* Bandeau */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-slate-600">
          <strong>Session</strong> : {sessionId}
        </div>
        {(projectName || theme) && (
          <div className="text-sm text-slate-700">
            <strong>Contexte</strong> : {projectName}
            {theme ? " — " + theme : ""}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-1 rounded bg-slate-200 text-slate-800 text-sm"
            onClick={() => setSummary(initialSummary)}
          >
            Régénérer la synthèse
          </button>
          <button
            className="px-3 py-1 rounded bg-slate-200 text-slate-800 text-sm"
            onClick={copySummary}
          >
            Copier le texte
          </button>
          <button
            className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
            onClick={exportPDF}
          >
            Télécharger en PDF
          </button>
        </div>
      </div>

      {/* Compteurs */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge label="Étiquettes" value={counts.total} />
        <Badge label="Liens" value={counts.links} />
        <Badge label="Dans l'arbre" value={counts.inTree} />
        <Badge label="Hors arbre" value={counts.offTree} />
        <Badge label="Problèmes" value={counts.cats.problem} />
        <Badge label="Causes" value={counts.cats.causes} />
        <Badge label="Conséquences" value={counts.cats.consequences} />
      </div>

      {/* Graphiques (4) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Répartition par catégories */}
        <Card title="Répartition par catégories">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={95}
                  stroke={COLORS.stroke}
                  strokeWidth={1}
                  label
                >
                  {categoryData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 2. Dans/Hors arbre par catégorie */}
        <Card title="Dans l'arbre vs Hors arbre (par catégorie)">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={counts.inOutByCat}
                margin={{ top: 12, right: 12, left: 0, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Dans l'arbre" stackId="a" fill={COLORS.inTree} />
                <Bar dataKey="Hors arbre" stackId="a" fill={COLORS.offTree} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 3. Top nœuds par degré */}
        <Card title="Nœuds les plus connectés (degré)">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barTopNodes} margin={{ top: 12, right: 12, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="Degré" fill={COLORS.bars} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 4. Entrées vs Sorties par catégorie */}
        <Card title="Entrées (parents) vs Sorties (enfants) par catégorie">
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={indegOutdegByCat}
                margin={{ top: 12, right: 12, left: 0, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Entrées" fill={COLORS.bars2} />
                <Bar dataKey="Sorties" fill={COLORS.bars} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Chaînes détectées */}
      <Card title="Chaînes cause → … → conséquence (exemples)">
        {sampleChains.length ? (
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {sampleChains.map((ch, i) => (
              <li key={i}>{ch.map(trimTxt).join(" → ")}</li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-600">
            Aucune chaîne détectée pour le moment (ou éléments non reliés).
          </div>
        )}
      </Card>

      {/* Synthèse IA locale (éditable) */}
      <div className="space-y-2">
        <div className="font-semibold">Synthèse IA (éditable)</div>
        <textarea
          className="w-full h-[420px] p-3 border rounded font-mono text-sm leading-5"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
    </div>
  );
}

/* ===================== Petits composants UI ===================== */

function Badge({ label, value }) {
  return (
    <div className="px-2.5 py-1 rounded border bg-white shadow-sm">
      <span className="text-slate-500">{label} :</span>{" "}
      <span className="font-bold">{value}</span>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white border rounded shadow-sm p-3">
      <div className="font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}

function trimTxt(s, n = 60) {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function displayCat(cat) {
  if (cat === "problem") return "Problèmes";
  if (cat === "causes") return "Causes";
  if (cat === "consequences") return "Conséquences";
  return cat;
}

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
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/**
 * Panneau d'analyse avancée
 * - Interprétation: leviers, goulets, couverture, profondeur, doublons
 * - Graphiques: répartition, in/out, top causes (impact), quick wins (scatter),
 *               histogrammes, courbe de Pareto, mini-sankey (SVG)
 * - Recommandations et résumé exécutif
 */
export default function AnalysisPanel({
  sessionId,
  postIts = [],
  connections = [],
  projectName = "",
  theme = "",
}) {
  const containerRef = useRef(null);
  const [tab, setTab] = useState("overview"); // 'overview' | 'causes' | 'consequences' | 'structure' | 'reco'

  /* ===================== Couleurs (alignées avec l'app) ===================== */
  const COLORS = {
    problem: "#ef4444",       // rouge
    causes: "#fb7185",        // saumon/rose
    consequences: "#f59e0b",  // amber (orange)
    inTree: "#0ea5e9",        // bleu clair
    offTree: "#94a3b8",       // gris ardoise
    bars: "#6366f1",          // indigo
    bars2: "#f59e0b",         // amber
    stroke: "#111827",        // presque noir
    grid: "#e5e7eb",          // gris clair
  };

  /* ===================== Index rapides ===================== */
  const byId = useMemo(
    () => Object.fromEntries((postIts || []).map((p) => [p.id, p])),
    [postIts]
  );

  const inMap = useMemo(() => {
    const m = new Map();
    postIts.forEach((p) => m.set(p.id, []));
    connections.forEach((c) => {
      if (!byId[c.fromId] || !byId[c.toId]) return;
      m.get(c.toId)?.push(c.fromId);
    });
    return m;
  }, [postIts, connections, byId]);

  const outMap = useMemo(() => {
    const m = new Map();
    postIts.forEach((p) => m.set(p.id, []));
    connections.forEach((c) => {
      if (!byId[c.fromId] || !byId[c.toId]) return;
      m.get(c.fromId)?.push(c.toId);
    });
    return m;
  }, [postIts, connections, byId]);

  // Adjacence non orientée (pour robustesse si les directions varient)
  const undirected = useMemo(() => {
    const m = new Map();
    postIts.forEach((p) => m.set(p.id, new Set()));
    connections.forEach((c) => {
      if (!byId[c.fromId] || !byId[c.toId]) return;
      m.get(c.fromId).add(c.toId);
      m.get(c.toId).add(c.fromId);
    });
    return m;
  }, [postIts, connections, byId]);

  /* ===================== Comptages descriptifs ===================== */
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
      (p) => p.isInTree && (inMap.get(p.id)?.length || 0) === 0
    );
    const leaves = postIts.filter(
      (p) => p.isInTree && (outMap.get(p.id)?.length || 0) === 0
    );
    const isolated = postIts.filter((p) => {
      if (!p.isInTree) return false;
      const a = (inMap.get(p.id)?.length || 0) + (outMap.get(p.id)?.length || 0);
      return a === 0;
    });

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

    return { total, links, inTree, offTree, cats, roots, leaves, isolated, inOutByCat };
  }, [postIts, connections, inMap, outMap]);

  /* ===================== Mesures structurelles ===================== */
  const nodesStats = useMemo(() => {
    const rows = postIts.map((p) => {
      const indeg = inMap.get(p.id)?.length || 0;
      const outdeg = outMap.get(p.id)?.length || 0;
      const deg = indeg + outdeg;
      return {
        id: p.id,
        label: trimTxt(p.content, 40) || "(sans texte)",
        indeg,
        outdeg,
        deg,
        category: p.category || "problem",
        isInTree: !!p.isInTree,
      };
    });

    // "Flow centrality" (approx. goulet) = indeg × outdeg
    rows.forEach((r) => (r.flow = r.indeg * r.outdeg));

    const topDeg = rows.filter(r => r.isInTree).sort((a, b) => b.deg - a.deg).slice(0, 10);
    const topFlow = rows
      .filter((r) => r.isInTree && (r.indeg > 0 && r.outdeg > 0))
      .sort((a, b) => b.flow - a.flow)
      .slice(0, 10);

    // Histos degrés
    const degHist = histogram(rows.filter(r => r.isInTree).map(r => r.deg));
    const indegHist = histogram(rows.filter(r => r.isInTree).map(r => r.indeg));
    const outdegHist = histogram(rows.filter(r => r.isInTree).map(r => r.outdeg));

    return { rows, topDeg, topFlow, degHist, indegHist, outdegHist };
  }, [postIts, inMap, outMap]);

  /* ===================== Distance au problème & profondeur ===================== */
  const depthInfo = useMemo(() => {
    const problems = postIts.filter((p) => p.isInTree && p.category === "problem").map(p => p.id);
    if (!problems.length) return { distToProblem: new Map(), depthByCat: [] };

    // BFS non orienté depuis tous les problèmes
    const dist = multiSourceBFS(undirected, problems);
    // Signe de profondeur: causes (-), problèmes (0), conséquences (+)
    const depth = new Map();
    postIts.forEach(p => {
      const d = dist.get(p.id);
      if (d == null) return;
      const sign = p.category === "causes" ? -1 : p.category === "consequences" ? +1 : 0;
      depth.set(p.id, d * (sign || 1));
    });

    const byCat = ["causes", "problem", "consequences"].map(cat => {
      const vals = postIts.filter(p => p.isInTree && p.category === cat).map(p => depth.get(p.id)).filter(v => v != null);
      return { cat, avg: average(vals), min: Math.min(...(vals.length ? vals : [0])), max: Math.max(...(vals.length ? vals : [0])) };
    });

    return { distToProblem: dist, depth, depthByCat: byCat };
  }, [postIts, undirected]);

  /* ===================== Impact des causes & Pareto ===================== */
  const causeImpact = useMemo(() => {
    // Nombre de conséquences uniques atteignables depuis chaque cause,
    // via chemins quelconques (non orientés) **qui passent par un problème**.
    const maxDepth = 8;
    const problems = new Set(postIts.filter(p => p.isInTree && p.category === "problem").map(p => p.id));

    const cache = new Map();
    const impact = [];

    const isConseq = (id) => byId[id]?.category === "consequences";
    const isCause  = (id) => byId[id]?.category === "causes";

    const bfsReach = (startId) => {
      if (cache.has(startId)) return cache.get(startId);
      const visited = new Set([startId]);
      const q = [{ id: startId, depth: 0, passedProblem: problems.has(startId) }];
      const reached = new Set();
      while (q.length) {
        const { id, depth, passedProblem } = q.shift();
        if (depth > maxDepth) continue;
        const neigh = undirected.get(id) || new Set();
        for (const nb of neigh) {
          if (visited.has(nb)) continue;
          const pass = passedProblem || problems.has(nb);
          visited.add(nb);
          if (pass && isConseq(nb)) reached.add(nb);
          q.push({ id: nb, depth: depth + 1, passedProblem: pass });
        }
      }
      const result = { reached, visited };
      cache.set(startId, result);
      return result;
    };

    postIts
      .filter((p) => p.isInTree && isCause(p.id))
      .forEach((c) => {
        const { reached } = bfsReach(c.id);
        const indeg = inMap.get(c.id)?.length || 0; // effort proxy
        const outdeg = outMap.get(c.id)?.length || 0;
        impact.push({
          id: c.id,
          label: trimTxt(c.content, 50),
          impact: reached.size,
          indeg,
          outdeg,
          effort: indeg, // proxy
        });
      });

    // Pareto: couverture cumulée des conséquences par rang décroissant d'impact,
    // en évitant les doublons.
    const consequencesAll = new Set(
      postIts.filter((p) => p.isInTree && p.category === "consequences").map(p => p.id)
    );
    const ranked = [...impact].sort((a, b) => b.impact - a.impact);
    const covered = new Set();
    const pareto = ranked.map((c, i) => {
      // Recalcule reach de ce c (ou garde cache)
      const reached = (cache.get(c.id)?.reached) || new Set();
      reached.forEach((x) => covered.add(x));
      return {
        rank: i + 1,
        cumulative: +(covered.size / Math.max(1, consequencesAll.size)).toFixed(3),
      };
    });

    return { impact, ranked, pareto, totalConsequences: consequencesAll.size };
  }, [postIts, undirected, byId, inMap, outMap]);

  const quickWins = useMemo(() => {
    if (!causeImpact.impact.length) return [];
    const ys = causeImpact.impact.map(c => c.impact);
    const xs = causeImpact.impact.map(c => c.effort);
    const y75 = percentile(ys, 0.75);
    const x25 = percentile(xs, 0.25);
    return causeImpact.impact
      .filter(c => c.impact >= y75 && c.effort <= x25)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 8);
  }, [causeImpact]);

  /* ===================== Doublons (Jaccard tokens) ===================== */
  const duplicates = useMemo(() => {
    const norm = (s) => normalizeForCompare(s).split(/\s+/).filter(Boolean);
    const jaccard = (A, B) => {
      const a = new Set(A), b = new Set(B);
      const inter = [...a].filter(x => b.has(x)).length;
      const uni = a.size + b.size - inter || 1;
      return inter / uni;
    };
    const pairs = [];
    const checkCat = (cat) => {
      const nodes = postIts.filter(p => p.isInTree && p.category === cat);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const t1 = norm(nodes[i].content || "");
          const t2 = norm(nodes[j].content || "");
          if (!t1.length || !t2.length) continue;
          const sim = jaccard(t1, t2);
          if (sim >= 0.8) {
            pairs.push({
              a: trimTxt(nodes[i].content, 60),
              b: trimTxt(nodes[j].content, 60),
              cat,
              score: +sim.toFixed(2),
            });
          }
        }
      }
    };
    checkCat("causes");
    checkCat("consequences");
    return pairs.slice(0, 12);
  }, [postIts]);

  /* ===================== Échantillons de chaînes cause → … → conséquence ===================== */
  const sampleChains = useMemo(() => {
    const chains = [];
    const maxLen = 6;

    const dfs = (path, visited) => {
      const last = path[path.length - 1];
      const lastNode = byId[last];
      if (!lastNode) return;
      if (path.length > maxLen) return;

      const firstId = path[0];
      if (
        path.length >= 2 &&
        byId[firstId]?.category === "causes" &&
        lastNode.category === "consequences" &&
        path.some(id => byId[id]?.category === "problem")
      ) {
        chains.push([...path]);
      }

      const nexts = (outMap.get(last) || []).concat(inMap.get(last) || []); // robuste aux directions
      nexts.forEach((n) => {
        if (!visited.has(n)) {
          visited.add(n);
          dfs([...path, n], visited);
          visited.delete(n);
        }
      });
    };

    postIts
      .filter((p) => p.isInTree && p.category === "causes")
      .slice(0, 20)
      .forEach((p) => dfs([p.id], new Set([p.id])));

    return chains.slice(0, 6).map((ids) => ids.map((id) => byId[id]?.content || "(?)"));
  }, [postIts, inMap, outMap, byId]);

  /* ===================== Résumé exécutif & synthèse ===================== */
  const executiveSummary = useMemo(() => {
    const lines = [];

    // 1) Densité et structuration
    lines.push(
      `Ensemble de ${counts.total} étiquettes (${counts.inTree} dans l'arbre, ` +
      `${counts.offTree} hors arbre) pour ${counts.links} liaisons.`
    );

    // 2) Leviers & couverture
    if (causeImpact.ranked.length) {
      const top = causeImpact.ranked[0];
      const cov50 = causeImpact.pareto.find(p => p.cumulative >= 0.5)?.rank ?? "-";
      const cov80 = causeImpact.pareto.find(p => p.cumulative >= 0.8)?.rank ?? "-";
      lines.push(
        `La cause la plus influente (« ${top.label} ») couvre ${top.impact} conséquence(s). ` +
        `Les ${cov50} premières causes couvrent ~50% des conséquences; ` +
        `les ${cov80} premières en couvrent ~80% (approx. Pareto).`
      );
    }

    // 3) Goulets
    if (nodesStats.topFlow.length) {
      const g = nodesStats.topFlow[0];
      lines.push(
        `Un goulet significatif est « ${g.label} » (indeg=${g.indeg}, outdeg=${g.outdeg}) : ` +
        `stabiliser ce point de passage augmentera l'effet de levier.`
      );
    }

    // 4) Propreté du graphe
    if (counts.isolated.length) {
      lines.push(`${counts.isolated.length} étiquette(s) isolée(s) à relier ou élaguer.`);
    }

    return lines.join(" ");
  }, [counts, causeImpact, nodesStats]);

  const initialSummary = useMemo(() => {
    const lines = [];
    lines.push("SYNTHÈSE IA — Analyse interprétative (éditable)");
    lines.push("");
    lines.push("Résumé exécutif :");
    lines.push("• " + executiveSummary);
    lines.push("");

    // Leviers
    if (causeImpact.ranked.length) {
      lines.push("Leviers prioritaires (impact sur les conséquences) :");
      causeImpact.ranked.slice(0, 5).forEach((c, i) => {
        lines.push(`  ${i + 1}. ${c.label} — impact: ${c.impact}, effort (proxy): ${c.effort}`);
      });
      lines.push("");
    }

    // Quick wins
    if (quickWins.length) {
      lines.push("Quick wins (fort impact, faible effort) :");
      quickWins.forEach((c) => lines.push(`  • ${c.label} (impact=${c.impact}, effort=${c.effort})`));
      lines.push("");
    }

    // Goulets
    if (nodesStats.topFlow.length) {
      lines.push("Goulets (points de passage structurants) :");
      nodesStats.topFlow.slice(0, 5).forEach((n) =>
        lines.push(`  • ${n.label} (indeg=${n.indeg}, outdeg=${n.outdeg}, flux≈${n.flow})`)
      );
      lines.push("");
    }

    // Risques et hygiène
    if (duplicates.length) {
      lines.push(`Doublons potentiels détectés (${duplicates.length} paires) : examiner et fusionner si nécessaire.`);
    }
    if (counts.isolated.length) {
      lines.push(`Étiquettes isolées : ${counts.isolated.length} à relier/retirer.`);
    }

    // Plan d’action (générique)
    lines.push("");
    lines.push("Plan d’action recommandé :");
    lines.push("1) Immédiat : traiter 2–3 quick wins pour gagner de la traction.");
    lines.push("2) Court terme : adresser les 3 leviers majeurs (impact) et sécuriser le principal goulet.");
    lines.push("3) Structurel : réduire la redondance (fusion doublons), relier/élaguer les isolés, puis affiner les chaînes causes→conséquences.");

    return lines.join("\n");
  }, [executiveSummary, causeImpact, quickWins, nodesStats, duplicates, counts]);

  const [summary, setSummary] = useState(initialSummary);
  useEffect(() => setSummary(initialSummary), [initialSummary]);

  /* ===================== Données graphiques ===================== */
  const categoryData = useMemo(
    () => [
      { name: "Problèmes", value: counts.cats.problem, color: COLORS.problem },
      { name: "Causes", value: counts.cats.causes, color: COLORS.causes },
      { name: "Conséquences", value: counts.cats.consequences, color: COLORS.consequences },
    ],
    [counts, COLORS]
  );

  const indegOutdegByCat = useMemo(() => {
    const s = { problem: { indeg: 0, outdeg: 0 }, causes: { indeg: 0, outdeg: 0 }, consequences: { indeg: 0, outdeg: 0 } };
    nodesStats.rows.forEach(r => {
      if (!s[r.category]) return;
      s[r.category].indeg += r.indeg;
      s[r.category].outdeg += r.outdeg;
    });
    return [
      { name: "Problèmes", Entrées: s.problem.indeg, Sorties: s.problem.outdeg, _cat: "problem" },
      { name: "Causes", Entrées: s.causes.indeg, Sorties: s.causes.outdeg, _cat: "causes" },
      { name: "Conséquences", Entrées: s.consequences.indeg, Sorties: s.consequences.outdeg, _cat: "consequences" },
    ];
  }, [nodesStats]);

  const barTopCausesByImpact = useMemo(
    () => causeImpact.ranked.slice(0, 12).map((c) => ({ label: c.label, Impact: c.impact })),
    [causeImpact]
  );

  const scatterQuickWins = useMemo(
    () => causeImpact.impact.map((c) => ({ x: c.effort, y: c.impact, label: c.label })),
    [causeImpact]
  );

  const paretoData = useMemo(
    () => causeImpact.pareto.map((p) => ({ Rang: p.rank, Couverture: Math.round(p.cumulative * 100) })),
    [causeImpact]
  );

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

      {/* Résumé exécutif */}
      <Card title="Résumé exécutif">
        <div className="text-sm leading-6">{executiveSummary}</div>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-2 text-sm mt-1">
        {[
          ["overview", "Vue d’ensemble"],
          ["causes", "Causes & Leviers"],
          ["consequences", "Conséquences"],
          ["structure", "Structure"],
          ["reco", "Recommandations"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`px-3 py-1 rounded border ${tab === id ? "bg-slate-900 text-white" : "bg-white"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* Compteurs */}
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge label="Étiquettes" value={counts.total} />
            <Badge label="Liens" value={counts.links} />
            <Badge label="Dans l'arbre" value={counts.inTree} />
            <Badge label="Hors arbre" value={counts.offTree} />
            <Badge label="Problèmes" value={counts.cats.problem} />
            <Badge label="Causes" value={counts.cats.causes} />
            <Badge label="Conséquences" value={counts.cats.consequences} />
            {counts.isolated.length > 0 && (
              <Badge label="Isolés (à traiter)" value={counts.isolated.length} />
            )}
          </div>

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
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
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
          </div>

          {/* 3. Mini “Sankey” (agrégé trois colonnes) */}
          <Card title="Flux agrégé (Causes → Problème(s) → Conséquences)">
            <MiniSankey postIts={postIts} connections={connections} byId={byId} COLORS={COLORS} />
          </Card>

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
                Aucune chaîne détectée (ou éléments non reliés).
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "causes" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top causes par impact */}
            <Card title="Top causes par impact (nº de conséquences atteintes)">
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barTopCausesByImpact} margin={{ top: 12, right: 12, left: 0, bottom: 60 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Impact" fill={COLORS.bars} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Quick wins (scatter effort vs impact) */}
            <Card title="Quick wins — Effort (entrées) vs Impact (conséquences)">
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid stroke={COLORS.grid} />
                    <XAxis type="number" dataKey="x" name="Effort (indeg)" />
                    <YAxis type="number" dataKey="y" name="Impact" />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={scatterQuickWins} fill={COLORS.bars2} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Pareto couverture */}
            <Card title="Couverture cumulée des conséquences (Pareto)">
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={paretoData} margin={{ top: 12, right: 12, left: 0, bottom: 24 }}>
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="Rang" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="Couverture" stroke={COLORS.bars} strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Total conséquences = {causeImpact.totalConsequences || 0}. La courbe montre la part couverte en % par les k premières causes.
              </div>
            </Card>

            {/* Doublons causes */}
            <Card title="Doublons potentiels (Causes)">
              {duplicates.filter(d => d.cat === "causes").length ? (
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {duplicates.filter(d => d.cat === "causes").map((d, i) => (
                    <li key={i}>
                      {d.a} ↔ {d.b} <span className="text-slate-500">(sim={d.score})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-600">Aucun doublon évident.</div>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "consequences" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Entrées vs sorties cat */}
            <Card title="Entrées (parents) vs Sorties (enfants) par catégorie">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={indegOutdegByCat}
                    margin={{ top: 12, right: 12, left: 0, bottom: 24 }}
                  >
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
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

            {/* Doublons conséquences */}
            <Card title="Doublons potentiels (Conséquences)">
              {duplicates.filter(d => d.cat === "consequences").length ? (
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {duplicates.filter(d => d.cat === "consequences").map((d, i) => (
                    <li key={i}>
                      {d.a} ↔ {d.b} <span className="text-slate-500">(sim={d.score})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-slate-600">Aucun doublon évident.</div>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "structure" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Histogramme — Degré total">
              <Histo data={nodesStats.degHist} color={COLORS.bars} />
            </Card>
            <Card title="Histogramme — Entrées (indeg)">
              <Histo data={nodesStats.indegHist} color={COLORS.bars2} />
            </Card>
            <Card title="Histogramme — Sorties (outdeg)">
              <Histo data={nodesStats.outdegHist} color={COLORS.inTree} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
            <Card title="Nœuds les plus connectés (degré)">
              <ListTop rows={nodesStats.topDeg} />
            </Card>
            <Card title="Goulets (flux ≈ indeg × outdeg)">
              <ListTop rows={nodesStats.topFlow} />
            </Card>
          </div>

          <Card title="Profondeur relative (moyenne/min/max)">
            <DepthTable rows={depthInfo.depthByCat} COLORS={COLORS} />
          </Card>
        </>
      )}

      {tab === "reco" && (
        <>
          <Card title="Recommandations actionnables">
            <ul className="list-disc pl-5 space-y-2 text-sm">
              {quickWins.length ? (
                <li>
                  <strong>Quick wins (immédiat)</strong> — Traiter en priorité :
                  <ul className="list-disc pl-5">
                    {quickWins.map((c, i) => (
                      <li key={i}>{c.label} <span className="text-slate-500">(impact={c.impact}, effort={c.effort})</span></li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li>Pas de quick wins évidents — envisager de simplifier des causes à effort élevé.</li>
              )}
              {causeImpact.ranked.length >= 3 && (
                <li>
                  <strong>Leviers (court terme)</strong> — Aligner l’équipe sur les 3 causes majeures :
                  <ul className="list-disc pl-5">
                    {causeImpact.ranked.slice(0, 3).map((c, i) => (
                      <li key={i}>{c.label} <span className="text-slate-500">(impact={c.impact})</span></li>
                    ))}
                  </ul>
                </li>
              )}
              {nodesStats.topFlow.length > 0 && (
                <li>
                  <strong>Goulet structurant</strong> — Sécuriser « {nodesStats.topFlow[0].label} » (clarification, ownership, ressources), car de nombreux chemins y transitent.
                </li>
              )}
              {duplicates.length > 0 && (
                <li>
                  <strong>Hygiène</strong> — Fusionner les doublons détectés ({duplicates.length} paires) pour éviter la dispersion.
                </li>
              )}
              {counts.isolated.length > 0 && (
                <li>
                  <strong>Nettoyage</strong> — Relier/élaguer {counts.isolated.length} étiquette(s) isolée(s).
                </li>
              )}
              <li>
                <strong>Itération</strong> — Après traitement, régénérer l’analyse et viser une couverture ≥ 80% des conséquences par ≤ 20% des causes (si pertinent).
              </li>
            </ul>
          </Card>

          <div className="space-y-2">
            <div className="font-semibold">Synthèse IA (éditable)</div>
            <textarea
              className="w-full h-[360px] p-3 border rounded font-mono text-sm leading-5"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ===================== Mini composants & helpers ===================== */

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

function Histo({ data, color }) {
  const rows = data.map(([k, v]) => ({ bin: String(k), count: v }));
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis dataKey="bin" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill={color} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ListTop({ rows }) {
  if (!rows.length) return <div className="text-sm text-slate-600">—</div>;
  return (
    <ol className="list-decimal pl-5 text-sm space-y-1">
      {rows.map((r, i) => (
        <li key={i}>
          {r.label}{" "}
          <span className="text-slate-500">
            (deg={r.deg}, indeg={r.indeg}, outdeg={r.outdeg}{typeof r.flow === "number" ? `, flux≈${r.flow}` : ""})
          </span>
        </li>
      ))}
    </ol>
  );
}

function DepthTable({ rows = [], COLORS }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[480px] text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-1 pr-4">Catégorie</th>
            <th className="py-1 pr-4">Profondeur moy.</th>
            <th className="py-1 pr-4">Min</th>
            <th className="py-1 pr-4">Max</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cat}>
              <td className="py-1 pr-4">
                <span
                  className="inline-block w-3 h-3 rounded mr-2 align-middle"
                  style={{ background: r.cat === "problem" ? COLORS.problem : r.cat === "causes" ? COLORS.causes : COLORS.consequences }}
                />
                {displayCat(r.cat)}
              </td>
              <td className="py-1 pr-4">{fmtNum(r.avg)}</td>
              <td className="py-1 pr-4">{fmtNum(r.min)}</td>
              <td className="py-1 pr-4">{fmtNum(r.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Mini Sankey (SVG) : 3 colonnes (Causes, Problèmes, Conséquences) avec
 * épaisseur proportionnelle au nombre de liens.
 */
function MiniSankey({ postIts, connections, byId, COLORS }) {
  const width = 900;
  const height = 240;
  const padding = 40;
  const colX = {
    causes: padding,
    problem: width / 2 - 50,
    consequences: width - padding - 180,
  };

  // Agrégation de liens directs cause→problème et problème→conséquence (insensible au sens : on agrège par catégorie)
  const pairs = { cp: 0, pc: 0 };
  connections.forEach(c => {
    const a = byId[c.fromId], b = byId[c.toId];
    if (!a || !b) return;
    const catA = a.category, catB = b.category;
    if ((catA === "causes" && catB === "problem") || (catA === "problem" && catB === "causes")) pairs.cp++;
    if ((catA === "problem" && catB === "consequences") || (catA === "consequences" && catB === "problem")) pairs.pc++;
  });

  const maxFlow = Math.max(1, pairs.cp, pairs.pc);
  const scale = (v) => 8 + (v / maxFlow) * 28;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height}>
        {/* Colonnes */}
        <text x={colX.causes} y={24} fontSize="12" fontWeight="bold" fill="#334155">Causes</text>
        <text x={colX.problem} y={24} fontSize="12" fontWeight="bold" fill="#334155">Problème(s)</text>
        <text x={colX.consequences} y={24} fontSize="12" fontWeight="bold" fill="#334155">Conséquences</text>

        {/* Blocs */}
        <rect x={colX.causes} y={50} width={160} height={120} rx="10" fill={COLORS.causes} opacity="0.75" />
        <rect x={colX.problem} y={50} width={160} height={120} rx="10" fill={COLORS.problem} opacity="0.75" />
        <rect x={colX.consequences} y={50} width={180} height={120} rx="10" fill={COLORS.consequences} opacity="0.75" />

        {/* Liens proportionnels */}
        <FlowLink
          x1={colX.causes + 160}
          y1={110}
          x2={colX.problem}
          y2={110}
          width={scale(pairs.cp)}
          color="#334155"
        />
        <FlowLink
          x1={colX.problem + 160}
          y1={110}
          x2={colX.consequences}
          y2={110}
          width={scale(pairs.pc)}
          color="#334155"
        />

        {/* Légende des flux */}
        <text x={width/2 - 20} y={height - 16} fontSize="12" fill="#334155">
          Liens C↔P: {pairs.cp} • Liens P↔C: {pairs.pc}
        </text>
      </svg>
    </div>
  );
}

function FlowLink({ x1, y1, x2, y2, width, color }) {
  const midX = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return <path d={path} stroke={color} strokeWidth={width} fill="none" opacity="0.85" />;
}

/* ===================== Utils ===================== */

function histogram(values = []) {
  if (!values.length) return [];
  const max = Math.max(...values);
  const arr = new Array(Math.max(1, max + 1)).fill(0);
  values.forEach((v) => {
    const i = Math.min(arr.length - 1, Math.max(0, Math.round(v)));
    arr[i] += 1;
  });
  return arr.map((count, idx) => [idx, count]);
}

function average(a = []) {
  if (!a.length) return 0;
  return +(a.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0) / a.length).toFixed(2);
}

function percentile(arr = [], p = 0.5) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))));
  return a[idx];
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

function normalizeForCompare(s = "") {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** multi-source BFS sur graphe non orienté (Map<id, Set<id>>) */
function multiSourceBFS(graph, sources = []) {
  const dist = new Map();
  const q = [];
  sources.forEach((id) => {
    dist.set(id, 0);
    q.push(id);
  });
  while (q.length) {
    const id = q.shift();
    const d = dist.get(id);
    const neigh = graph.get(id) || new Set();
    neigh.forEach((n) => {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        q.push(n);
      }
    });
  }
  return dist;
}

function fmtNum(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n * 100) / 100);
}

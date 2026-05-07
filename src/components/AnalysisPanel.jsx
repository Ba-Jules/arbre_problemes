// src/components/AnalysisPanel.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { analyzeWithAI } from "../lib/aiTransformer";
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
  aiConfig = null,
  objectiveNodes = [],
  objectiveConnections = [],
  strategies = [],
}) {
  const containerRef = useRef(null);
  const [tab, setTab] = useState("overview");

  /* ─── État analyse IA ─── */
  const [aiAnalysis, setAiAnalysis]     = useState("");
  const [aiAnalyzing, setAiAnalyzing]   = useState(false);
  const [aiAnalysisErr, setAiAnalysisErr] = useState("");

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

  /* ===================== Résumé exécutif analytique ===================== */
  const executiveSummary = useMemo(() => {
    const insights = [];
    if (!counts.inTree) return insights;

    // 1. Densité & structuration
    const density = counts.links / Math.max(1, counts.inTree);
    const densityLabel = density < 0.8 ? "faible" : density < 1.5 ? "correcte" : "élevée";
    const densityMsg = density < 0.8
      ? `Plusieurs nœuds flottent sans ancrage causal — risque de dispersion de l’intervention et de manque de cohérence entre causes.`
      : density > 1.5
      ? `Arbre très interconnecté — vérifier que chaque lien est causal et non simplement associatif, pour éviter des logiques circulaires.`
      : `La structuration est solide. Les nœuds sont bien reliés sans sur-connexion.`;
    insights.push({
      level: density < 0.8 ? "warn" : density > 1.8 ? "warn" : "ok",
      title: "Structuration du graphe",
      text: `${counts.inTree} nœuds, ${counts.links} liaisons (densité ${densityLabel} : ${density.toFixed(1)} lien/nœud). ${densityMsg}`,
    });

    // 2. Concentration causale — loi de Pareto
    if (causeImpact.ranked.length >= 2) {
      const total = causeImpact.ranked.length;
      const rank80 = (causeImpact.pareto.findIndex(p => p.cumulative >= 0.8) + 1) || total;
      const pct80  = Math.round((rank80 / total) * 100);
      const top    = causeImpact.ranked[0];
      const concentrated = pct80 <= 30;
      const balanced     = pct80 >= 60;
      const verdict = concentrated
        ? `Structure concentrée (${pct80}% des causes couvrent 80% des conséquences) : l’intervention doit prioriser ces leviers ou elle risque d’être inefficace.`
        : balanced
        ? `Distribution équilibrée (${pct80}% des causes pour 80% de couverture) : aucun levier dominant. L’action devra être large pour avoir de l’impact.`
        : `Concentration modérée (${pct80}% des causes pour 80% de couverture) : quelques leviers clés émergent sans créer de dépendance excessive.`;
      insights.push({
        level: concentrated ? "warn" : "info",
        title: "Concentration des risques",
        text: `${verdict} Levier principal : « ${top.label} » (atteint ${top.impact} conséquence(s) sur ${causeImpact.totalConsequences}).`,
      });
    }

    // 3. Quick wins
    if (quickWins.length) {
      const qw = quickWins[0];
      insights.push({
        level: "ok",
        title: `${quickWins.length} quick win${quickWins.length > 1 ? "s" : ""} identifié${quickWins.length > 1 ? "s" : ""}`,
        text: `« ${qw.label} » combine fort impact (${qw.impact} conséquences) et faible effort (indeg=${qw.effort}) — traiter en priorité pour générer des résultats visibles rapidement.${quickWins.length > 1 ? ` ${quickWins.length - 1} autre(s) dans le même profil.` : ""}`,
      });
    } else if (causeImpact.ranked.length > 0) {
      insights.push({
        level: "warn",
        title: "Aucun quick win",
        text: "Toutes les causes à fort impact exigent un effort élevé. L’intervention sera structurellement coûteuse — anticiper les délais et calibrer les ressources dès la conception.",
      });
    }

    // 4. Goulet critique
    if (nodesStats.topFlow.length) {
      const g = nodesStats.topFlow[0];
      const critical = g.flow >= 4;
      insights.push({
        level: critical ? "warn" : "info",
        title: "Goulet d’étranglement",
        text: `« ${g.label} » est un nœud de transit ${critical ? "critique" : "modéré"} (${g.indeg} entrée(s) → ${g.outdeg} sortie(s), flux≈${g.flow}). ${critical ? "Un blocage sur ce point paralyse une large portion de la chaîne causale. Sécuriser sa résolution est non négociable." : "À surveiller dans le séquençage de la mise en œuvre."}`,
      });
    }

    // 5. Couverture du diagnostic
    const coverRate = counts.inTree / Math.max(1, counts.total);
    if (coverRate < 0.65) {
      insights.push({
        level: "warn",
        title: "Diagnostic partiel",
        text: `${Math.round(coverRate * 100)}% des étiquettes sont intégrées (${counts.offTree} hors arbre). Des causes ou conséquences identifiées pendant le diagnostic restent déconnectées — risque d’omissions stratégiques dans l’arbre à objectifs.`,
      });
    }

    // 6. Hygiène analytique
    const hygIssues = [];
    if (duplicates.length > 0) hygIssues.push(`${duplicates.length} doublon(s) (formulations quasi-identiques à fusionner)`);
    if (counts.isolated.length > 0) hygIssues.push(`${counts.isolated.length} nœud(s) isolé(s) sans connexion`);
    if (hygIssues.length) {
      insights.push({
        level: "warn",
        title: "Qualité du graphe à améliorer",
        text: `${hygIssues.join(" ; ")}. Ces imperfections biaisent les métriques et brouillent la lecture stratégique.`,
      });
    }

    return insights;
  }, [counts, causeImpact, quickWins, nodesStats, duplicates]);

  const initialSummary = useMemo(() => {
    const lines = ["SYNTHÈSE — Analyse interprétative (éditable)", ""];
    executiveSummary.forEach((ins) => {
      lines.push(`[${ins.level === "ok" ? "✓" : ins.level === "warn" ? "⚠" : "ℹ"}] ${ins.title}`);
      lines.push(`   ${ins.text}`);
      lines.push("");
    });
    if (causeImpact.ranked.length) {
      lines.push("Leviers prioritaires :");
      causeImpact.ranked.slice(0, 5).forEach((c, i) =>
        lines.push(`  ${i + 1}. ${c.label} — ${c.impact} conséquence(s), effort proxy=${c.effort}`)
      );
      lines.push("");
    }
    if (quickWins.length) {
      lines.push("Quick wins :");
      quickWins.forEach((c) => lines.push(`  • ${c.label} (impact=${c.impact}, effort=${c.effort})`));
      lines.push("");
    }
    if (nodesStats.topFlow.length) {
      lines.push("Goulets :");
      nodesStats.topFlow.slice(0, 3).forEach((n) =>
        lines.push(`  • ${n.label} (indeg=${n.indeg}, outdeg=${n.outdeg}, flux≈${n.flow})`)
      );
      lines.push("");
    }
    lines.push("Actions recommandées :");
    lines.push("1) Immédiat (0–3 mois) : traiter les quick wins identifiés.");
    lines.push("2) Court terme (3–12 mois) : adresser les 3 leviers majeurs et sécuriser le goulet principal.");
    lines.push("3) Structurel (1 an+) : fusionner les doublons, relier les isolés, affiner les chaînes causales.");
    return lines.join("\n");
  }, [executiveSummary, causeImpact, quickWins, nodesStats]);

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

  /* ===================== Analyse IA ===================== */
  const handleAIAnalysis = useCallback(async () => {
    if (!aiConfig?.configured) return;
    setAiAnalyzing(true);
    setAiAnalysisErr("");
    setTab("ai");

    // Données objectives
    const objCentral = objectiveNodes.find((n) => n.objectiveType === "central");
    const objMeans   = objectiveNodes.filter((n) => n.objectiveType === "means");
    const objEnds    = objectiveNodes.filter((n) => n.objectiveType === "ends");

    // Stratégies enrichies avec libellés des moyens
    const nodeById = Object.fromEntries(objectiveNodes.map((n) => [n.id, n]));
    const strategiesEnriched = strategies.map((s) => ({
      name:          s.name,
      colorLabel:    s.color?.label,
      rationale:     s.rationale,
      score:         s.score,
      impact:        s.impact,
      meansContents: (s.nodes || [])
        .map((id) => nodeById[id])
        .filter((n) => n?.objectiveType === "means")
        .map((n) => n.content),
    }));

    const payload = {
      projectName,
      theme,
      counts: {
        total:        counts.total,
        links:        counts.links,
        inTree:       counts.inTree,
        offTree:      counts.offTree,
        causes:       counts.cats.causes,
        consequences: counts.cats.consequences,
        problem:      counts.cats.problem,
        isolated:     counts.isolated.length,
      },
      depthByCat:    depthInfo.depthByCat,
      topCauses:     causeImpact.ranked.slice(0, 10),
      quickWins,
      topBottlenecks: nodesStats.topFlow.slice(0, 6),
      duplicates,
      sampleChains,
      objectiveTree: objCentral ? {
        central: objCentral.content,
        means:   objMeans.map((m) => ({ content: m.content, validationStatus: m.validation?.status })),
        ends:    objEnds.map((e)  => ({ content: e.content })),
      } : null,
      strategies: strategiesEnriched,
    };

    try {
      const result = await analyzeWithAI(payload, aiConfig);
      setAiAnalysis(result);
    } catch (err) {
      setAiAnalysisErr(err.message);
    } finally {
      setAiAnalyzing(false);
    }
  }, [aiConfig, projectName, theme, counts, depthInfo, causeImpact, quickWins,
      nodesStats, duplicates, sampleChains, objectiveNodes, strategies]);

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
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {aiConfig?.configured ? (
            <button
              className="px-3 py-1 rounded bg-violet-700 text-white text-sm font-semibold disabled:opacity-60"
              onClick={handleAIAnalysis}
              disabled={aiAnalyzing}
              title="Analyse experte complète par l'IA (arbre problèmes + objectifs + stratégies)"
            >
              {aiAnalyzing ? "Analyse en cours…" : "✦ Analyser avec l'IA"}
            </button>
          ) : (
            <span className="text-xs text-slate-400 italic">Configurez un provider IA pour l'analyse experte</span>
          )}
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
            PDF
          </button>
        </div>
      </div>

      {/* Résumé exécutif analytique */}
      <Card title="Résumé exécutif">
        {executiveSummary.length === 0 ? (
          <div className="text-sm text-slate-400 italic">Ajoutez des étiquettes à l'arbre pour générer le résumé.</div>
        ) : (
          <div className="space-y-2">
            {executiveSummary.map((ins, i) => (
              <div
                key={i}
                className={`flex gap-3 p-2.5 rounded-lg text-sm border ${
                  ins.level === "ok"   ? "bg-emerald-50 border-emerald-200" :
                  ins.level === "warn" ? "bg-amber-50 border-amber-200" :
                                         "bg-sky-50 border-sky-200"
                }`}
              >
                <span className={`shrink-0 text-base font-bold ${
                  ins.level === "ok" ? "text-emerald-600" : ins.level === "warn" ? "text-amber-600" : "text-sky-600"
                }`}>
                  {ins.level === "ok" ? "✓" : ins.level === "warn" ? "⚠" : "ℹ"}
                </span>
                <div>
                  <span className={`font-semibold ${
                    ins.level === "ok" ? "text-emerald-800" : ins.level === "warn" ? "text-amber-800" : "text-sky-800"
                  }`}>{ins.title} — </span>
                  <span className="text-slate-700">{ins.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-2 text-sm mt-1">
        {[
          ["overview", "Vue d’ensemble"],
          ["causes", "Causes & Leviers"],
          ["consequences", "Conséquences"],
          ["structure", "Structure"],
          ["reco", "Recommandations"],
          ["ai", aiAnalyzing ? "Analyse IA…" : aiAnalysis ? "Analyse IA ✓" : "Analyse IA ✦"],
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

      {tab === "ai" && (
        <AIAnalysisTab
          analyzing={aiAnalyzing}
          analysis={aiAnalysis}
          error={aiAnalysisErr}
          configured={!!aiConfig?.configured}
          onLaunch={handleAIAnalysis}
          onCopy={async () => {
            try { await navigator.clipboard.writeText(aiAnalysis); alert("Analyse copiée ✅"); }
            catch { window.prompt("Copiez :", aiAnalysis); }
          }}
        />
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

/* ===================== Onglet Analyse IA ===================== */

function AIAnalysisTab({ analyzing, analysis, error, configured, onLaunch, onCopy }) {
  if (!configured) {
    return (
      <Card title="Analyse IA experte">
        <div className="py-8 text-center text-slate-500 text-sm">
          <div className="text-2xl mb-3">🔑</div>
          <p>Configurez un provider IA (OpenAI, Anthropic, Google, OpenRouter)</p>
          <p className="mt-1 text-xs text-slate-400">L'analyse couvrira l'arbre à problèmes, l'arbre à objectifs et les stratégies.</p>
        </div>
      </Card>
    );
  }
  if (analyzing) {
    return (
      <Card title="Analyse IA experte">
        <div className="py-10 text-center">
          <div className="inline-block w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-600">Analyse en cours — l'IA lit l'arbre, les chaînes causales et les stratégies…</p>
          <p className="text-xs text-slate-400 mt-1">Durée estimée : 15–40 secondes selon le provider</p>
        </div>
      </Card>
    );
  }
  if (error) {
    return (
      <Card title="Analyse IA experte">
        <div className="p-3 bg-red-50 border border-red-200 rounded mb-3 text-sm text-red-700">
          ✗ Erreur : {error}
        </div>
        <button
          className="px-3 py-1.5 rounded bg-violet-700 text-white text-sm font-semibold"
          onClick={onLaunch}
        >Réessayer</button>
      </Card>
    );
  }
  if (!analysis) {
    return (
      <Card title="Analyse IA experte">
        <div className="py-8 text-center">
          <p className="text-sm text-slate-600 mb-4">
            L'IA analysera simultanément le diagnostic causal, l'arbre à objectifs et les stratégies d'intervention.
          </p>
          <ul className="text-xs text-slate-500 text-left inline-block mb-5 space-y-1">
            <li>✦ Qualité du diagnostic causal (exhaustivité, cohérence, angles manquants)</li>
            <li>✦ Solidité logique de l'arbre à objectifs (chaînes, sauts logiques)</li>
            <li>✦ Analyse critique des stratégies (pertinence, chevauchements, recommandation)</li>
            <li>✦ Risques et hypothèses critiques non modélisés</li>
            <li>✦ Recommandations opérationnelles sur 3 horizons</li>
            <li>✦ Score de qualité global /10 avec sous-scores</li>
          </ul>
          <br />
          <button
            className="px-4 py-2 rounded-lg bg-violet-700 text-white font-semibold text-sm"
            onClick={onLaunch}
          >✦ Lancer l'analyse experte</button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Analyse IA experte">
      <div className="flex justify-end gap-2 mb-3">
        <button
          className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs"
          onClick={onLaunch}
        >↺ Relancer</button>
        <button
          className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs"
          onClick={onCopy}
        >Copier</button>
      </div>
      <MarkdownText text={analysis} />
    </Card>
  );
}

function MarkdownText({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let listItems = [];

  const flushList = (key) => {
    if (!listItems.length) return;
    elements.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-0.5 mb-2 text-sm text-slate-700">
        {listItems.map((item, j) => (
          <li key={j}><InlineText text={item} /></li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      flushList(i);
      elements.push(
        <h3 key={i} className="text-sm font-bold text-slate-900 mt-5 mb-1.5 pb-1 border-b border-slate-200 uppercase tracking-wide">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      flushList(i);
      elements.push(
        <h4 key={i} className="text-sm font-bold text-violet-700 mt-3 mb-1">
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      flushList(i);
      elements.push(
        <p key={i} className="text-sm font-bold text-slate-800 mt-4 mb-1">
          <InlineText text={line.slice(2, -2)} />
        </p>
      );
    } else if (line.startsWith("- ") || line.startsWith("  - ") || line.startsWith("   - ")) {
      listItems.push(line.replace(/^\s*-\s/, ""));
    } else if (line === "---") {
      flushList(i);
      elements.push(<hr key={i} className="my-4 border-slate-200" />);
    } else if (line.trim() === "") {
      flushList(i);
    } else {
      flushList(i);
      elements.push(
        <p key={i} className="text-sm text-slate-700 mb-1.5 leading-6">
          <InlineText text={line} />
        </p>
      );
    }
  });
  flushList("end");
  return <div>{elements}</div>;
}

function InlineText({ text = "" }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4
          ? <strong key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
          : p
      )}
    </>
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

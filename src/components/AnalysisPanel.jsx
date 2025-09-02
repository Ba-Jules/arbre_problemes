import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const COLORS = {
  problem: "#ef4444",
  causes: "#fb7185",
  consequences: "#22c55e",
};
const PIE_COLORS = ["#22c55e", "#ef4444", "#fb7185", "#3b82f6", "#f59e0b", "#a855f7"];

export default function AnalysisPanel({ sessionId, projectName, theme, postIts = [], connections = [] }) {
  const exportRef = useRef(null);

  const byCategory = useMemo(() => {
    const counts = { problem: 0, causes: 0, consequences: 0 };
    postIts.forEach(p => { if (counts[p.category] != null) counts[p.category]++; });
    return [
      { name: "Problèmes", key: "problem", value: counts.problem, color: COLORS.problem },
      { name: "Causes", key: "causes", value: counts.causes, color: COLORS.causes },
      { name: "Conséquences", key: "conséquences", value: counts.consequences, color: COLORS.consequences },
    ];
  }, [postIts]);

  const byAuthor = useMemo(() => {
    const m = new Map();
    postIts.forEach(p => {
      const key = p.author || "Anonyme";
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([author, value]) => ({ author, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [postIts]);

  const timeline = useMemo(() => {
    const m = new Map();
    postIts.forEach(p => {
      const t = p.timestamp?.toDate ? p.timestamp.toDate()
        : (p.timestamp?._seconds ? new Date(p.timestamp._seconds * 1000) : null);
      if (!t) return;
      const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a,b) => a[0] < b[0] ? -1 : 1)
      .map(([time, value]) => ({ time, value }));
  }, [postIts]);

  const byId = useMemo(() => Object.fromEntries(postIts.map(p => [p.id, p])), [postIts]);

  const degrees = useMemo(() => {
    const inDeg = new Map(), outDeg = new Map();
    postIts.forEach(p => { inDeg.set(p.id, 0); outDeg.set(p.id, 0); });
    connections.forEach(c => {
      if (!byId[c.fromId] || !byId[c.toId]) return;
      outDeg.set(c.fromId, (outDeg.get(c.fromId) || 0) + 1);
      inDeg.set(c.toId, (inDeg.get(c.toId) || 0) + 1);
    });
    return { inDeg, outDeg };
  }, [postIts, connections, byId]);

  const roots = useMemo(() =>
    postIts.filter(p => (degrees.inDeg.get(p.id) || 0) === 0 && (degrees.outDeg.get(p.id) || 0) > 0),
    [postIts, degrees]
  );
  const leaves = useMemo(() =>
    postIts.filter(p => (degrees.outDeg.get(p.id) || 0) === 0 && (degrees.inDeg.get(p.id) || 0) > 0),
    [postIts, degrees]
  );
  const hubs = useMemo(() =>
    [...postIts]
      .map(p => ({ p, d: (degrees.inDeg.get(p.id) || 0) + (degrees.outDeg.get(p.id) || 0) }))
      .sort((a,b) => b.d - a.d)
      .slice(0, 5),
    [postIts, degrees]
  );
  const isolated = useMemo(() =>
    postIts.filter(p => (degrees.inDeg.get(p.id) || 0) === 0 && (degrees.outDeg.get(p.id) || 0) === 0),
    [postIts, degrees]
  );

  const hasCycle = useMemo(() => {
    const visited = new Set();
    const stack = new Set();
    const adj = new Map();
    connections.forEach(c => {
      if (!adj.has(c.fromId)) adj.set(c.fromId, []);
      adj.get(c.fromId).push(c.toId);
    });
    const dfs = (u) => {
      if (stack.has(u)) return true;
      if (visited.has(u)) return false;
      visited.add(u);
      stack.add(u);
      for (const v of (adj.get(u) || [])) {
        if (dfs(v)) return true;
      }
      stack.delete(u);
      return false;
    };
    for (const p of postIts) if (dfs(p.id)) return true;
    return false;
  }, [postIts, connections]);

  const chains = useMemo(() => {
    const adj = new Map();
    connections.forEach(c => {
      if (!byId[c.fromId] || !byId[c.toId]) return;
      if (!adj.has(c.fromId)) adj.set(c.fromId, []);
      adj.get(c.fromId).push(c.toId);
    });

    const maxDepth = 6;
    const keep = [];
    const visitedPath = new Set();

    const dfs = (nodeId, path) => {
      if (path.length > maxDepth) return;
      const node = byId[nodeId];
      if (!node) return;
      const newPath = [...path, nodeId];
      if (newPath.length >= 2) {
        const first = byId[newPath[0]];
        const last = byId[newPath[newPath.length - 1]];
        if (first?.category === "causes" && last?.category === "consequences") {
          const key = newPath.join(">");
          if (!visitedPath.has(key)) {
            visitedPath.add(key);
            keep.push(newPath);
          }
        }
      }
      for (const nx of (adj.get(nodeId) || [])) {
        dfs(nx, newPath);
      }
    };

    postIts.filter(p => p.category === "causes").forEach(c => dfs(c.id, []));

    const score = (path) => {
      let s = path.length;
      for (let i=1;i<path.length;i++) {
        if (byId[path[i-1]]?.category !== byId[path[i]]?.category) s += 0.5;
      }
      return s;
    };

    return keep
      .sort((a,b) => score(b) - score(a))
      .slice(0, 8)
      .map(ids => ids.map(id => byId[id]?.content || "•").join(" → "));
  }, [byId, postIts, connections]);

  const insights = useMemo(() => {
    const total = postIts.length;
    const nbLinks = connections.length;
    const maxAuthor = byAuthor[0]?.author || "—";
    const maxAuthorCount = byAuthor[0]?.value || 0;
    const topCategory = [...byCategory].sort((a,b) => b.value - a.value)[0];
    const density = total > 1 ? (nbLinks / (total * (total - 1))).toFixed(3) : "0.000";

    return [
      `Total de contributions : ${total}`,
      `Connexions (liens) : ${nbLinks} — Densité approx. du graphe : ${density}`,
      `Catégorie la plus fournie : ${topCategory?.name || "—"} (${topCategory?.value || 0})`,
      `Participant le plus actif : ${maxAuthor} (${maxAuthorCount} post-its)`,
      `Hubs : ${hubs.map(h => (byId[h.p.id]?.content || "•")).slice(0,3).join(" | ") || "—"}`,
      `Racines (entrées majeures) : ${roots.slice(0,3).map(r => r.content).join(" | ") || "—"}`,
      `Feuilles (sorties majeures) : ${leaves.slice(0,3).map(f => f.content).join(" | ") || "—"}`,
      `Étiquettes isolées : ${isolated.length}`,
      `Cycles détectés : ${hasCycle ? "oui (à investiguer)" : "non"}`,
    ];
  }, [postIts, connections, byAuthor, byCategory, hubs, roots, leaves, isolated, hasCycle, byId]);

  // ---------- Synthèse IA (éditable) ----------
  const makeDeepAnalysis = useCallback(() => {
    const title = `SYNTHÈSE AUTOMATIQUE (éditable)`;
    const header =
`${title}

Aperçu global : ${postIts.length} étiquettes, ${connections.length} liaisons.
Répartition : Problèmes ${byCategory.find(c=>c.key==="problem")?.value||0}, Causes ${byCategory.find(c=>c.key==="causes")?.value||0}, Conséquences ${byCategory.find(c=>c.key==="conséquences")?.value||0}.
Hubs : ${hubs.map(h => (byId[h.p.id]?.content || "•") + ` (${(degrees.inDeg.get(h.p.id)||0)+(degrees.outDeg.get(h.p.id)||0)})`).join(" ; ") || "—"}.
Racines (sans parents) : ${roots.slice(0,5).map(r=>r.content).join(" ; ") || "—"}.
Feuilles (sans enfants) : ${leaves.slice(0,5).map(f=>f.content).join(" ; ") || "—"}.
Isolées : ${isolated.length}. Cycles : ${hasCycle ? "oui" : "non"}.
`;

    const chainBlock = chains.length
      ? `Chaînes cause → … → conséquence (échantillon priorisé) :
- ${chains.join("\n- ")}`
      : `Chaînes cause → … → conséquence : non détectées (ou non reliées).`;

    const quality =
`Qualité & cohérence :
- Doublons potentiels : à vérifier (étiquettes proches sémantiquement ou libellés similaires).
- Normalisation : harmoniser la casse, éviter les phrases trop longues (> ${50} car.).
- Structure : privilégier des liens cause→problème→conséquence ; limiter les croisements inutiles.
- Gouvernance : nommer un modérateur couleur (🎨) pour uniformiser les codes visuels.`;

    const recommandations =
`Recommandations opérationnelles :
1) Regrouper les causes proches en 3–5 familles (thématisation).
2) Valider le(s) problème(s) central(aux) — s’il y en a trop, en faire des sous-arbres.
3) Prioriser les conséquences selon l’impact/urgence (High/Medium/Low) et la probabilité.
4) Construire un plan d’action :
   • Actions “Quick wins” (fort impact, faisable court terme)
   • Actions “Structurantes” (moyen/long terme, besoins ressources)
   • Actions “Exploration” (incertitudes à lever)
5) Préparer l’export et l’atelier décisionnel.`;

    const decisionPrep =
`Pistes pour l’arbre de décision (à venir) :
- Critères : impact, probabilité, faisabilité, coût, délai, risques, sponsors.
- Pondération suggérée : Impact (40%), Faisabilité (30%), Probabilité (20%), Risques négatifs (10%).
- Sortie attendue : portefeuille d’actions priorisé + road-map 30/60/90 jours.`;

    const ctx = (projectName || theme)
      ? `Contexte : ${[projectName, theme].filter(Boolean).join(" — ")}.`
      : `Contexte : (à compléter — nom du projet / thème).`;

    return [
      ctx,
      header,
      chainBlock,
      quality,
      recommandations,
      decisionPrep
    ].join("\n\n");
  }, [
    postIts, connections, byCategory, hubs, byId, degrees, roots, leaves,
    isolated, hasCycle, chains, projectName, theme
  ]) ;

  const [analysisText, setAnalysisText] = useState(makeDeepAnalysis());

  useEffect(() => {
    setAnalysisText(makeDeepAnalysis());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postIts, connections]);

  const handleRegenerate = () => setAnalysisText(makeDeepAnalysis());

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(analysisText || "");
      alert("Synthèse copiée ✅");
    } catch {
      prompt("Copiez la synthèse :", analysisText || "");
    }
  };

  const handleExportPdf = async () => {
    const node = exportRef.current;
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    const x = (pageWidth - w) / 2;
    const y = 10;

    pdf.text(`Analyse — Session ${sessionId}`, 10, 8);
    pdf.addImage(imgData, "PNG", x, y, w, h);
    pdf.save(`analyse-${sessionId}.pdf`);
  };

  return (
    <div className="w-full h-full overflow-auto">
      <div className="flex items-center gap-2 flex-wrap justify-between mb-3">
        <h2 className="text-xl font-black">Analyse de la session</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRegenerate}
            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold"
            title="Régénérer la synthèse à partir de l’arbre"
          >
            Régénérer la synthèse
          </button>
          <button
            onClick={handleCopy}
            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold"
          >
            Copier le texte
          </button>
          <button
            onClick={handleExportPdf}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold"
          >
            Télécharger en PDF
          </button>
        </div>
      </div>

      <div ref={exportRef} className="space-y-12">
        <section>
          <h3 className="font-bold mb-2">Répartition par catégorie</h3>
          <div className="w-full h-64 bg-white rounded-lg shadow border">
            <ResponsiveContainer>
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value">
                  {byCategory.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <h3 className="font-bold mb-2">Chronologie des contributions</h3>
          <div className="w-full h-64 bg-white rounded-lg shadow border">
            <ResponsiveContainer>
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" minTickGap={24} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <h3 className="font-bold mb-2">Top contributeurs</h3>
          <div className="w-full bg-white rounded-lg shadow border p-3">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie dataKey="value" data={byAuthor} outerRadius={100} label>
                      {byAuthor.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2">Auteur</th>
                      <th className="py-2">Post-its</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byAuthor.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{r.author}</td>
                        <td className="py-2 font-bold">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-bold mb-2">Insights</h3>
          <ul className="bg-white rounded-lg shadow border p-4 list-disc pl-6 space-y-1">
            {insights.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>

        <section>
          <h3 className="font-bold mb-2">Synthèse IA (éditable)</h3>
          <div
            contentEditable
            suppressContentEditableWarning
            className="min-h-[280px] w-full bg-white rounded-lg shadow border p-4 font-mono text-[13px] whitespace-pre-wrap focus:outline-none"
            onInput={(e)=> setAnalysisText(e.currentTarget.innerText)}
          >
            {analysisText}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Astuce : éditez directement le texte ci-dessus. Le bouton “Régénérer” remplace le contenu par une nouvelle
            analyse basée sur l’arbre actuel.
          </p>
        </section>
      </div>
    </div>
  );
}

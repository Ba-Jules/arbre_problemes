import React, { useMemo, useRef } from "react";
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

export default function AnalysisPanel({ sessionId, postIts = [], connections = [] }) {
  const exportRef = useRef(null);

  // Nettoyage / jeux de données
  const byCategory = useMemo(() => {
    const counts = { problem: 0, causes: 0, consequences: 0 };
    postIts.forEach(p => { if (counts[p.category] != null) counts[p.category]++; });
    return [
      { name: "Problèmes", value: counts.problem, color: COLORS.problem },
      { name: "Causes", value: counts.causes, color: COLORS.causes },
      { name: "Conséquences", value: counts.consequences, color: COLORS.consequences },
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
    // bucket par date HH:mm
    const m = new Map();
    postIts.forEach(p => {
      const t = p.timestamp?.toDate ? p.timestamp.toDate() : (p.timestamp?._seconds ? new Date(p.timestamp._seconds * 1000) : null);
      if (!t) return;
      const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a,b) => a[0] < b[0] ? -1 : 1)
      .map(([time, value]) => ({ time, value }));
  }, [postIts]);

  const insights = useMemo(() => {
    const total = postIts.length;
    const nbLinks = connections.length;
    const maxAuthor = byAuthor[0]?.author || "—";
    const maxAuthorCount = byAuthor[0]?.value || 0;

    const topCategory = [...byCategory].sort((a,b) => b.value - a.value)[0];
    return [
      `Total de contributions : ${total}`,
      `Connexions (liens) dans l’arbre : ${nbLinks}`,
      `Catégorie la plus fournie : ${topCategory?.name || "—"} (${topCategory?.value || 0})`,
      `Participant le plus actif : ${maxAuthor} (${maxAuthorCount} post-its)`,
    ];
  }, [postIts, connections, byAuthor, byCategory]);

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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-black">Analyse de la session</h2>
        <button
          onClick={handleExportPdf}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold"
        >
          Exporter en PDF
        </button>
      </div>

      <div ref={exportRef} className="space-y-12">
        {/* 1. Répartition par catégorie */}
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

        {/* 2. Chronologie des ajouts */}
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

        {/* 3. Top auteurs */}
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

        {/* 4. Insights rapides */}
        <section>
          <h3 className="font-bold mb-2">Insights</h3>
          <ul className="bg-white rounded-lg shadow border p-4 list-disc pl-6 space-y-1">
            {insights.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}

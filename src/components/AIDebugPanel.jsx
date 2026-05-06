import React, { useState } from "react";

const TABS = [
  { id: "nodes",   label: "Décisions nœud par nœud" },
  { id: "payload", label: "Payload envoyé" },
  { id: "raw",     label: "Réponse brute" },
  { id: "parsed",  label: "Réponse parsée" },
];

export default function AIDebugPanel({ log, onClose }) {
  const [tab, setTab] = useState("nodes");
  const [expandPayload, setExpandPayload] = useState(false);

  const payloadEntries = log.filter((e) => e.type === "payload");
  const rawEntries     = log.filter((e) => e.type === "raw");
  const parsedEntries  = log.filter((e) => e.type === "parsed");
  const errorEntries   = log.filter((e) => e.type === "error" || e.type === "batch_error");
  const decisions      = log.find((e) => e.type === "node_decisions")?.decisions || [];

  const hasAI = payloadEntries.length > 0;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "monospace",
        fontSize: 12,
        maxHeight: "45vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#1e293b", borderBottom: "1px solid #334155", flexShrink: 0 }}>
        <span style={{ fontWeight: "bold", color: "#38bdf8" }}>DEBUG IA</span>
        {!hasAI && (
          <span style={{ color: "#f59e0b", fontSize: 11 }}>
            ⚠ Aucun appel IA détecté — IA non configurée ou pipeline purement lexical
          </span>
        )}
        {errorEntries.length > 0 && (
          <span style={{ color: "#f87171", fontSize: 11 }}>
            ✗ {errorEntries.length} erreur(s) — voir onglet Payload
          </span>
        )}
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "2px 10px",
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                background: tab === t.id ? "#38bdf8" : "#334155",
                color: tab === t.id ? "#0f172a" : "#94a3b8",
                fontFamily: "monospace",
                fontSize: 11,
                fontWeight: tab === t.id ? "bold" : "normal",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{ marginLeft: "auto", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
          title="Fermer le panneau debug"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ overflow: "auto", flex: 1, padding: "8px 12px" }}>

        {/* ── Onglet : Payload ── */}
        {tab === "payload" && (
          <div>
            {payloadEntries.length === 0 ? (
              <NoneMsg>Aucun payload — l'IA n'a pas été appelée (pipeline purement lexical).</NoneMsg>
            ) : payloadEntries.map((e, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 4 }}>
                  Lot {e.batchIndex ?? 0} / {e.labelsCount} étiquettes — provider : <b>{e.provider}</b> — model : <b>{e.model}</b> — temperature : {e.temperature} — max_tokens : {e.max_tokens}
                </div>
                <div style={{ color: "#94a3b8", marginBottom: 4 }}>Étiquettes envoyées :</div>
                <pre style={PRE}>{JSON.stringify(e.labels, null, 2)}</pre>
                <button
                  onClick={() => setExpandPayload((v) => !v)}
                  style={{ color: "#7dd3fc", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, marginBottom: 4 }}
                >
                  {expandPayload ? "▼ Masquer le prompt système" : "▶ Afficher le prompt système complet"}
                </button>
                {expandPayload && (
                  <>
                    <div style={{ color: "#94a3b8", marginBottom: 2 }}>Message system :</div>
                    <pre style={{ ...PRE, whiteSpace: "pre-wrap" }}>{e.messages?.[0]?.content}</pre>
                    <div style={{ color: "#94a3b8", marginBottom: 2 }}>Message user :</div>
                    <pre style={{ ...PRE, whiteSpace: "pre-wrap" }}>{e.messages?.[1]?.content}</pre>
                  </>
                )}
              </div>
            ))}
            {errorEntries.map((e, i) => (
              <div key={i} style={{ color: "#f87171", marginBottom: 8 }}>
                ✗ Erreur {e.type === "batch_error" ? `(lot ${e.batchIndex})` : ""} : {e.message}
              </div>
            ))}
          </div>
        )}

        {/* ── Onglet : Réponse brute ── */}
        {tab === "raw" && (
          <div>
            {rawEntries.length === 0 ? (
              <NoneMsg>Aucune réponse brute — l'IA n'a pas répondu.</NoneMsg>
            ) : rawEntries.map((e, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 4 }}>Lot {e.batchIndex ?? 0} — Réponse brute du provider :</div>
                <pre style={{ ...PRE, whiteSpace: "pre-wrap", maxHeight: 200 }}>{e.rawText}</pre>
              </div>
            ))}
          </div>
        )}

        {/* ── Onglet : Réponse parsée ── */}
        {tab === "parsed" && (
          <div>
            {parsedEntries.length === 0 ? (
              <NoneMsg>Aucune réponse parsée — l'IA n'a pas répondu ou le parsing a échoué.</NoneMsg>
            ) : parsedEntries.map((e, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 4 }}>Lot {e.batchIndex ?? 0} — JSON parsé ({e.parsed?.length ?? 0} entrées) :</div>
                <pre style={PRE}>{JSON.stringify(e.parsed, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}

        {/* ── Onglet : Décisions nœud par nœud ── */}
        {tab === "nodes" && (
          <div>
            {decisions.length === 0 ? (
              <NoneMsg>Aucune décision enregistrée — lancez la génération de l'arbre à objectifs pour voir le diagnostic.</NoneMsg>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: "#7dd3fc", textAlign: "left", position: "sticky", top: 0, background: "#0f172a" }}>
                    <th style={TH}>Étiquette source</th>
                    <th style={TH}>Résultat lexical</th>
                    <th style={TH}>Structure lexicale</th>
                    <th style={TH}>Résultat IA brut</th>
                    <th style={TH}>Source affichée</th>
                    <th style={TH}>Raison</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #1e293b", background: i % 2 === 0 ? "#0f172a" : "#111827" }}>
                      <td style={TD}>{d.sourceLabel}</td>
                      <td style={TD}>{d.lexicalContent}</td>
                      <td style={{ ...TD, color: "#a78bfa" }}>{d.lexicalStructure}</td>
                      <td style={{ ...TD, color: d.aiContent ? (d.accepted ? "#86efac" : "#fca5a5") : "#475569" }}>
                        {d.aiContent ?? <i style={{ color: "#475569" }}>—</i>}
                      </td>
                      <td style={{ ...TD, fontWeight: "bold", color: d.source === "ai" ? "#34d399" : "#fb923c" }}>
                        {d.source === "ai" ? "IA" : "Lexical (fallback)"}
                      </td>
                      <td style={{ ...TD, color: "#94a3b8" }}>{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {decisions.length > 0 && (
              <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 11 }}>
                {decisions.filter((d) => d.source === "ai").length} / {decisions.length} étiquettes affichées depuis l'IA.{" "}
                {decisions.filter((d) => d.source === "lexical" && d.aiContent).length > 0 && (
                  <span style={{ color: "#f87171" }}>
                    {decisions.filter((d) => d.source === "lexical" && d.aiContent).length} résultat(s) IA rejeté(s) (mécaniques).
                  </span>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function NoneMsg({ children }) {
  return <div style={{ color: "#64748b", fontStyle: "italic", padding: "8px 0" }}>{children}</div>;
}

const PRE = {
  background: "#1e293b",
  padding: "6px 10px",
  borderRadius: 4,
  overflow: "auto",
  maxHeight: 180,
  margin: 0,
  color: "#e2e8f0",
  fontSize: 11,
};

const TH = {
  padding: "4px 8px",
  borderBottom: "1px solid #334155",
  fontWeight: "bold",
  whiteSpace: "nowrap",
};

const TD = {
  padding: "3px 8px",
  verticalAlign: "top",
  maxWidth: 220,
  wordBreak: "break-word",
};

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

  const payloadEntries  = log.filter((e) => e.type === "payload");
  const rawEntries      = log.filter((e) => e.type === "raw");
  const parsedEntries   = log.filter((e) => e.type === "parsed");
  const httpErrors      = log.filter((e) => e.type === "http_error");
  const httpRequests    = log.filter((e) => e.type === "http_request");
  const httpOk          = log.filter((e) => e.type === "http_ok");
  const errorEntries    = log.filter((e) => e.type === "error" || e.type === "batch_error");
  const decisions       = log.find((e) => e.type === "node_decisions")?.decisions || [];

  const hasAI     = payloadEntries.length > 0;
  const hasErrors = httpErrors.length > 0 || errorEntries.length > 0;
  const hasSuccess = httpOk.length > 0;

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
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#1e293b", borderBottom: "1px solid #334155", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontWeight: "bold", color: "#38bdf8" }}>DEBUG IA</span>

        {/* Statut global */}
        {!hasAI && (
          <span style={{ color: "#f59e0b", fontSize: 11 }}>
            ⚠ Aucun appel IA détecté — IA non configurée ou pipeline purement lexical
          </span>
        )}
        {hasAI && hasErrors && !hasSuccess && (
          <span style={{ color: "#f87171", fontSize: 11, fontWeight: "bold" }}>
            ✗ APPEL IA ÉCHOUÉ — fallback lexical utilisé (voir onglet Payload)
          </span>
        )}
        {hasAI && hasSuccess && (
          <span style={{ color: "#34d399", fontSize: 11, fontWeight: "bold" }}>
            ✓ Appel IA réussi
          </span>
        )}

        {/* Résumé HTTP inline */}
        {httpRequests.length > 0 && (
          <span style={{ color: "#94a3b8", fontSize: 10 }}>
            {httpRequests.map((r, i) => (
              <span key={i}>
                {r.provider} / {r.model} → {r.endpoint?.split("?")[0]}
              </span>
            ))}
          </span>
        )}
        {httpErrors.map((e, i) => (
          <span key={i} style={{ color: "#fca5a5", fontSize: 10, background: "#450a0a", padding: "1px 6px", borderRadius: 3 }}>
            HTTP {e.httpStatus} {e.httpStatusText}
          </span>
        ))}

        {/* Tabs */}
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
          title="Fermer"
        >✕</button>
      </div>

      {/* ── Content ── */}
      <div style={{ overflow: "auto", flex: 1, padding: "8px 12px" }}>

        {/* ── Payload ── */}
        {tab === "payload" && (
          <div>
            {/* Erreurs HTTP en premier */}
            {httpErrors.map((e, i) => (
              <div key={i} style={{ marginBottom: 12, padding: "8px 12px", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 6 }}>
                <div style={{ color: "#f87171", fontWeight: "bold", marginBottom: 4 }}>
                  ✗ Erreur HTTP {e.httpStatus} ({e.httpStatusText})
                </div>
                <div style={{ color: "#fca5a5", marginBottom: 2 }}>Endpoint : {e.endpoint}</div>
                <div style={{ color: "#fca5a5", marginBottom: 4 }}>Message : {e.message}</div>
                {e.errorBody && (
                  <pre style={{ ...PRE, maxHeight: 100, color: "#fca5a5" }}>{JSON.stringify(e.errorBody, null, 2)}</pre>
                )}
              </div>
            ))}

            {errorEntries.map((e, i) => (
              <div key={i} style={{ color: "#f87171", marginBottom: 8 }}>
                ✗ Erreur{e.type === "batch_error" ? ` (lot ${e.batchIndex})` : ""} : {e.message}
              </div>
            ))}

            {payloadEntries.length === 0 ? (
              <NoneMsg>Aucun payload — l'IA n'a pas été appelée.</NoneMsg>
            ) : payloadEntries.map((e, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 4 }}>
                  Lot {e.batchIndex ?? 0} — <b>provider :</b> {e.provider} — <b>model :</b> {e.model} — {e.labelsCount} étiquettes
                </div>
                {/* Endpoint affiché depuis http_request */}
                {httpRequests[i] && (
                  <div style={{ color: "#a78bfa", marginBottom: 6, fontSize: 11 }}>
                    Endpoint : {httpRequests[i].endpoint?.split("?")[0]}
                  </div>
                )}
                <div style={{ color: "#94a3b8", marginBottom: 4 }}>Étiquettes envoyées :</div>
                <pre style={PRE}>{JSON.stringify(e.labels, null, 2)}</pre>
                <button
                  onClick={() => setExpandPayload((v) => !v)}
                  style={{ color: "#7dd3fc", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: "4px 0", display: "block" }}
                >
                  {expandPayload ? "▼ Masquer les prompts" : "▶ Afficher les prompts système + user"}
                </button>
                {expandPayload && (
                  <>
                    <div style={{ color: "#94a3b8", marginBottom: 2 }}>Prompt système :</div>
                    <pre style={{ ...PRE, whiteSpace: "pre-wrap" }}>{e.messages?.[0]?.content}</pre>
                    <div style={{ color: "#94a3b8", marginBottom: 2 }}>Prompt user :</div>
                    <pre style={{ ...PRE, whiteSpace: "pre-wrap" }}>{e.messages?.[1]?.content}</pre>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Réponse brute ── */}
        {tab === "raw" && (
          <div>
            {rawEntries.length === 0 ? (
              <NoneMsg>
                Aucune réponse brute.
                {httpErrors.length > 0 && (
                  <span style={{ color: "#f87171" }}> L'appel a échoué avec HTTP {httpErrors[0]?.httpStatus} : {httpErrors[0]?.message}</span>
                )}
              </NoneMsg>
            ) : rawEntries.map((e, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 4 }}>Lot {e.batchIndex ?? 0} — Réponse brute :</div>
                <pre style={{ ...PRE, whiteSpace: "pre-wrap", maxHeight: 220 }}>{e.rawText}</pre>
              </div>
            ))}
          </div>
        )}

        {/* ── Réponse parsée ── */}
        {tab === "parsed" && (
          <div>
            {parsedEntries.length === 0 ? (
              <NoneMsg>
                Aucune réponse parsée.
                {httpErrors.length > 0 && (
                  <span style={{ color: "#f87171" }}> Cause : HTTP {httpErrors[0]?.httpStatus} — {httpErrors[0]?.message}</span>
                )}
              </NoneMsg>
            ) : parsedEntries.map((e, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ color: "#7dd3fc", marginBottom: 4 }}>Lot {e.batchIndex ?? 0} — JSON parsé ({e.parsed?.length ?? 0} entrées) :</div>
                <pre style={PRE}>{JSON.stringify(e.parsed, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}

        {/* ── Décisions par nœud ── */}
        {tab === "nodes" && (
          <div>
            {decisions.length === 0 ? (
              <NoneMsg>Lancez la génération pour voir le diagnostic.</NoneMsg>
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
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <span style={{ color: decisions.filter((d) => d.source === "ai").length > 0 ? "#34d399" : "#fb923c" }}>
                  {decisions.filter((d) => d.source === "ai").length} / {decisions.length} étiquettes depuis l'IA.
                </span>
                {decisions.filter((d) => d.source === "lexical" && d.aiContent).length > 0 && (
                  <span style={{ color: "#f87171", marginLeft: 8 }}>
                    {decisions.filter((d) => d.source === "lexical" && d.aiContent).length} résultat(s) IA rejeté(s).
                  </span>
                )}
                {decisions.every((d) => d.source === "lexical") && httpErrors.length > 0 && (
                  <span style={{ color: "#f87171", marginLeft: 8, fontWeight: "bold" }}>
                    ⚠ IA non disponible — fallback lexical utilisé (HTTP {httpErrors[0]?.httpStatus})
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
const TH = { padding: "4px 8px", borderBottom: "1px solid #334155", fontWeight: "bold", whiteSpace: "nowrap" };
const TD = { padding: "3px 8px", verticalAlign: "top", maxWidth: 220, wordBreak: "break-word" };

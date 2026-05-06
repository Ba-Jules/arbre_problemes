/**
 * aiTransformer.js — Transformation IA des étiquettes
 *
 * Providers supportés :
 *   - openai     : api.openai.com
 *   - openrouter : openrouter.ai
 *   - google     : generativelanguage.googleapis.com (v1beta)
 *   - anthropic  : api.anthropic.com
 */

const SYSTEM_PROMPT = `Tu es expert en Gestion Axée sur les Résultats (GAR) et en arbres à objectifs (logframe).
Ta tâche : transformer des étiquettes négatives (problèmes, causes, conséquences) en objectifs positifs et actionnables.

Règles obligatoires :
- Remplace la négation par son opposé sémantique (ex : "Formation trop théorique" → "Formation plus pratique")
- 2 à 6 mots maximum, naturel en français, sans ponctuation finale
- Aucun mot négatif dans le résultat : interdit d'y trouver les mots trop, peu, absent, insuffisant, faible, confus, complexe, fréquent, dégradé, réduit, moins, inutile
- "cause" devient un MOYEN (action, ressource, capacité à renforcer)
- "consequence" devient une FIN (résultat, impact, bénéfice à atteindre)
- "problem" devient l'OBJECTIF CENTRAL (formulé comme un état positif souhaité)
- Si l'étiquette est déjà positive (ex : "Communication renforcée"), la conserver telle quelle

Réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre :
[{"id": "...", "content": "..."}]`;

function buildUserMessage(labels) {
  const items = labels
    .map((l) => `{"id":"${l.id}","text":${JSON.stringify(l.text)},"type":"${l.type}"}`)
    .join(",\n  ");
  return `Transforme ces étiquettes :\n[\n  ${items}\n]`;
}

function parseAIResponse(text) {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Réponse IA invalide : pas de JSON array trouvé");
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error("Réponse IA invalide : pas un tableau");
  return parsed;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function maskKey(key = "") {
  if (key.length <= 8) return "***";
  return key.slice(0, 6) + "***" + key.slice(-3);
}

async function handleHttpError(res, provider, endpoint) {
  const errBody = await res.json().catch(() => ({}));
  const message = errBody?.error?.message || res.statusText || "Erreur inconnue";
  const fullMsg = `${provider} ${res.status}: ${message}`;
  const detail  = { httpStatus: res.status, httpStatusText: res.statusText, endpoint, errorBody: errBody, message: fullMsg };
  return detail;
}

/* ─── Providers ──────────────────────────────────────────────────────────── */

async function callOpenAI(messages, config, onDebug) {
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const model    = config.model || "gpt-4o";
  onDebug?.({ type: "http_request", provider: "openai", model, endpoint: endpoint });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 1000 }),
  });

  if (!res.ok) {
    const detail = await handleHttpError(res, "OpenAI", endpoint);
    onDebug?.({ type: "http_error", ...detail });
    throw new Error(detail.message);
  }
  onDebug?.({ type: "http_ok", provider: "openai", status: res.status, endpoint });
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenRouter(messages, config, onDebug) {
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const model    = config.model || "openai/gpt-4o";
  onDebug?.({ type: "http_request", provider: "openrouter", model, endpoint });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Arbre à Objectifs GAR",
    },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 1000 }),
  });

  if (!res.ok) {
    const detail = await handleHttpError(res, "OpenRouter", endpoint);
    onDebug?.({ type: "http_error", ...detail });
    throw new Error(detail.message);
  }
  onDebug?.({ type: "http_ok", provider: "openrouter", status: res.status, endpoint });
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGoogle(messages, config, onDebug) {
  const model    = config.model || "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const url      = `${endpoint}?key=${config.apiKey}`;
  onDebug?.({ type: "http_request", provider: "google", model, endpoint: `${endpoint}?key=${maskKey(config.apiKey)}` });

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsg   = messages.find((m) => m.role === "user")?.content   || "";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemMsg }] },
      contents: [{ role: "user", parts: [{ text: userMsg }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
    }),
  });

  if (!res.ok) {
    const detail = await handleHttpError(res, "Google", `${endpoint}?key=${maskKey(config.apiKey)}`);
    onDebug?.({ type: "http_error", ...detail });
    throw new Error(detail.message);
  }
  onDebug?.({ type: "http_ok", provider: "google", status: res.status, model, endpoint });
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callAnthropic(messages, config, onDebug) {
  const endpoint = "https://api.anthropic.com/v1/messages";
  const model    = config.model || "claude-haiku-4-5-20251001";
  onDebug?.({ type: "http_request", provider: "anthropic", model, endpoint });

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs  = messages.filter((m) => m.role !== "system");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: 1000, system: systemMsg, messages: userMsgs, temperature: 0.3 }),
  });

  if (!res.ok) {
    const detail = await handleHttpError(res, "Anthropic", endpoint);
    onDebug?.({ type: "http_error", ...detail });
    throw new Error(detail.message);
  }
  onDebug?.({ type: "http_ok", provider: "anthropic", status: res.status, endpoint });
  const data = await res.json();
  return data.content[0].text;
}

/* ─── Point d'entrée principal ───────────────────────────────────────────── */

export async function transformWithAI(labels, config, onDebug) {
  if (!labels?.length) return [];
  if (!config?.provider || !config?.apiKey) {
    throw new Error("IA non configurée");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: buildUserMessage(labels) },
  ];

  const debugPayload = {
    type: "payload",
    provider: config.provider,
    model: config.model || "(défaut provider)",
    temperature: 0.3,
    max_tokens: 1000,
    labelsCount: labels.length,
    labels,
    messages,
  };
  console.log("[IA] CALLING IA WITH:", { provider: config.provider, model: config.model, labelsCount: labels.length });
  onDebug?.(debugPayload);

  let rawText;
  try {
    switch (config.provider) {
      case "openai":
        rawText = await callOpenAI(messages, config, onDebug);
        break;
      case "openrouter":
        rawText = await callOpenRouter(messages, config, onDebug);
        break;
      case "google":
        rawText = await callGoogle(messages, config, onDebug);
        break;
      case "anthropic":
        rawText = await callAnthropic(messages, config, onDebug);
        break;
      default:
        rawText = await callOpenAI(messages, config, onDebug);
    }
  } catch (err) {
    onDebug?.({ type: "error", message: err.message });
    throw err;
  }

  onDebug?.({ type: "raw", rawText });

  const parsed = parseAIResponse(rawText);
  onDebug?.({ type: "parsed", parsed });

  return parsed;
}

/* ─── Détection de stratégies IA ─────────────────────────────────────────── */

const STRATEGY_SYSTEM = `Tu es expert en Gestion Axée sur les Résultats (GAR) et en logframe.
Ton rôle : analyser un arbre à objectifs et proposer des stratégies d'intervention cohérentes.
Réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre.`;

/**
 * Envoie les données de l'arbre à l'IA et reçoit des groupes de stratégies.
 *
 * @param {{ central, means, ends, meansConnections }} chainsData
 * @param {{ provider, apiKey, model }} config
 * @param {function?} onDebug
 * @returns {Promise<Array<{name:string, nodeIds:string[], rationale:string}>>}
 */
export async function detectStrategiesWithAI(chainsData, config, onDebug) {
  if (!config?.provider || !config?.apiKey) throw new Error("IA non configurée");

  const { central, means, ends, meansConnections } = chainsData;

  const lines = [
    `OBJECTIF CENTRAL : "${central.content}"`,
    ``,
    `MOYENS (à regrouper en stratégies) :`,
    ...means.map((m, i) => `${i + 1}. [${m.id}] "${m.content}"`),
    ``,
    `FINS visées (impacts attendus) :`,
    ...ends.map((e, i) => `${i + 1}. "${e.content}"`),
  ];

  if (meansConnections.length > 0) {
    lines.push(``, `LIENS entre certains moyens :`);
    meansConnections.slice(0, 20).forEach((c) => lines.push(`- "${c.from}" ↔ "${c.to}"`));
  }

  lines.push(
    ``,
    `Regroupe ces ${means.length} moyen(s) en 2 à 3 stratégies cohérentes selon leur logique métier ou domaine d'action.`,
    `Chaque moyen doit appartenir à exactement une stratégie.`,
    ``,
    `Réponds UNIQUEMENT avec ce JSON valide (en français) :`,
    `[{"name": "Nom court (3-5 mots)", "nodeIds": ["id_exact_du_moyen", ...], "rationale": "Une phrase expliquant la cohérence stratégique"}]`
  );

  const messages = [
    { role: "system", content: STRATEGY_SYSTEM },
    { role: "user",   content: lines.join("\n") },
  ];

  console.log("[IA] CALLING IA FOR STRATEGIES:", { provider: config.provider, model: config.model, meansCount: means.length });
  onDebug?.({ type: "payload", provider: config.provider, model: config.model, labelsCount: means.length, labels: means, messages });

  let rawText;
  try {
    switch (config.provider) {
      case "openai":     rawText = await callOpenAI(messages, config, onDebug);     break;
      case "openrouter": rawText = await callOpenRouter(messages, config, onDebug); break;
      case "google":     rawText = await callGoogle(messages, config, onDebug);     break;
      case "anthropic":  rawText = await callAnthropic(messages, config, onDebug);  break;
      default:           rawText = await callOpenAI(messages, config, onDebug);
    }
  } catch (err) {
    onDebug?.({ type: "error", message: err.message });
    throw err;
  }

  onDebug?.({ type: "raw", rawText });
  const parsed = parseAIResponse(rawText);
  onDebug?.({ type: "parsed", parsed });
  return parsed;
}

/* ─── Transformation en lots ─────────────────────────────────────────────── */

export async function transformWithAIBatched(labels, config, batchSize = 20, onDebug) {
  const resultMap = new Map();
  for (let i = 0; i < labels.length; i += batchSize) {
    const batch = labels.slice(i, i + batchSize);
    const batchOnDebug = onDebug
      ? (evt) => onDebug({ ...evt, batchIndex: i, batchTotal: labels.length })
      : undefined;
    try {
      const results = await transformWithAI(batch, config, batchOnDebug);
      for (const r of results) {
        if (r.id && r.content) resultMap.set(r.id, r.content.trim());
      }
    } catch (err) {
      onDebug?.({ type: "batch_error", batchIndex: i, message: err.message });
      console.warn(`[aiTransformer] lot ${i}–${i + batchSize} échoué :`, err.message);
    }
  }
  return resultMap;
}

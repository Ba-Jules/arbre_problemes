/**
 * aiTransformer.js — Transformation IA des étiquettes
 *
 * Envoie les labels problèmes au fournisseur IA configuré et retourne
 * les versions transformées en objectifs GAR.
 *
 * Providers supportés :
 *   - openai     : api.openai.com (CORS OK depuis navigateur)
 *   - openrouter : openrouter.ai  (CORS OK, proxy multi-modèles)
 *   - google     : generativelanguage.googleapis.com (CORS OK)
 *   - anthropic  : api.anthropic.com (CORS limité — recommander OpenRouter)
 *
 * Toutes les fonctions sont async et rejettent avec une erreur descriptive.
 */

/* ─── Prompt système ─────────────────────────────────────────────────────── */
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

/* ─── Parseur de réponse ─────────────────────────────────────────────────── */
function parseAIResponse(text) {
  // Essaie d'extraire un JSON array depuis le texte brut (parfois entouré de markdown)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Réponse IA invalide : pas de JSON array trouvé");
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error("Réponse IA invalide : pas un tableau");
  return parsed; // [{id, content}]
}

/* ─── Providers ──────────────────────────────────────────────────────────── */

async function callOpenAI(messages, config) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenRouter(messages, config) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Arbre à Objectifs GAR",
    },
    body: JSON.stringify({
      model: config.model || "openai/gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGoogle(messages, config) {
  const model = config.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
  // Reconstituer le contenu Gemini à partir des messages chat
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsg   = messages.find((m) => m.role === "user")?.content || "";
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
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callAnthropic(messages, config) {
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsgs  = messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model || "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemMsg,
      messages: userMsgs,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

/* ─── Point d'entrée principal ───────────────────────────────────────────── */
/**
 * Transforme un lot d'étiquettes via l'IA configurée.
 *
 * @param {Array<{id:string, text:string, type:"problem"|"causes"|"consequences"}>} labels
 * @param {{ provider:string, apiKey:string, model:string }} config
 * @returns {Promise<Array<{id:string, content:string}>>}
 */
export async function transformWithAI(labels, config) {
  if (!labels?.length) return [];
  if (!config?.provider || !config?.apiKey) {
    throw new Error("IA non configurée");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: buildUserMessage(labels) },
  ];

  let rawText;
  switch (config.provider) {
    case "openai":
      rawText = await callOpenAI(messages, config);
      break;
    case "openrouter":
      rawText = await callOpenRouter(messages, config);
      break;
    case "google":
      rawText = await callGoogle(messages, config);
      break;
    case "anthropic":
      rawText = await callAnthropic(messages, config);
      break;
    default:
      // Tenter comme OpenAI-compatible
      rawText = await callOpenAI(messages, config);
  }

  return parseAIResponse(rawText);
}

/**
 * Transforme les labels avec l'IA, en lot de taille `batchSize`.
 * Retourne un Map id → content. Si l'IA échoue sur un lot, les IDs
 * du lot sont absents du résultat (le caller peut utiliser le fallback lexical).
 *
 * @param {Array} labels
 * @param {object} config
 * @param {number} batchSize
 * @returns {Promise<Map<string, string>>}
 */
export async function transformWithAIBatched(labels, config, batchSize = 20) {
  const resultMap = new Map();
  for (let i = 0; i < labels.length; i += batchSize) {
    const batch = labels.slice(i, i + batchSize);
    try {
      const results = await transformWithAI(batch, config);
      for (const r of results) {
        if (r.id && r.content) resultMap.set(r.id, r.content.trim());
      }
    } catch (err) {
      console.warn(`[aiTransformer] lot ${i}–${i + batchSize} échoué :`, err.message);
      // Les IDs de ce lot ne seront pas dans le Map → fallback lexical côté caller
    }
  }
  return resultMap;
}

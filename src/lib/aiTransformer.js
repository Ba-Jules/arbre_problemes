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
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: config.maxTokens ?? 1000 }),
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
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: config.maxTokens ?? 1000 }),
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
      generationConfig: { temperature: 0.3, maxOutputTokens: config.maxTokens ?? 1000 },
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
    body: JSON.stringify({ model, max_tokens: config.maxTokens ?? 1000, system: systemMsg, messages: userMsgs, temperature: 0.3 }),
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
  if (!chainsData?.central?.content || !chainsData?.means?.length) {
    throw new Error("Arbre incomplet : objectif central ou moyens manquants");
  }

  const { central, means, ends, chains, meansConnections } = chainsData;

  const lines = [
    `ARBRE À OBJECTIFS`,
    ``,
    `OBJECTIF CENTRAL : "${central.content}"`,
    ``,
    `MOYENS D'INTERVENTION (${means.length}) :`,
    ...means.map((m, i) => `  ${i + 1}. [${m.id}] "${m.content}"`),
    ``,
    `FINS ATTENDUES (${ends.length}) :`,
    ...ends.map((e, i) => `  ${i + 1}. "${e.content}"`),
  ];

  if (chains?.length > 0) {
    lines.push(``, `CHAÎNES D'INTERVENTION COMPLÈTES (moyen(s) → objectif central → fin(s)) :`);
    chains.forEach((c, i) => {
      lines.push(`  Chaîne ${i + 1} [IDs concernés : ${c.meansIds.join(", ")}]`);
      lines.push(`    ${c.path}`);
    });
  }

  if (meansConnections?.length > 0) {
    lines.push(``, `LIENS ENTRE MOYENS :`);
    meansConnections.slice(0, 20).forEach((c) => lines.push(`  "${c.from}" ↔ "${c.to}"`));
  }

  lines.push(
    ``,
    `INSTRUCTION : Regroupe ces ${means.length} moyen(s) en 2 à 3 stratégies cohérentes`,
    `selon leur logique d'intervention (domaine, niveau d'action, synergie).`,
    `Chaque moyen doit appartenir à exactement une stratégie.`,
    `Utilise les IDs exacts entre crochets — ne les modifie pas.`,
    ``,
    `Réponds UNIQUEMENT avec ce JSON valide (en français), rien d'autre :`,
    `[{"name": "Nom 3-5 mots", "nodeIds": ["id_exact_1", "id_exact_2"], "rationale": "1 phrase sur la logique stratégique"}]`
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

/* ─── Analyse experte IA ─────────────────────────────────────────────────── */

const ANALYSIS_SYSTEM = `Tu es un expert senior en évaluation de projets de développement international :
GAR (Gestion Axée sur les Résultats), cadres logiques (logframe), analyse causale,
méthodologie OCDE-CAD, théorie du changement, conception de stratégies d'intervention.

Ton niveau d'analyse : cabinet conseil international (IOD PARC, ITAD, Adam Smith International, Coffey).

Règles absolues :
- Chaque affirmation est ancrée dans les données fournies — cite les nœuds par leur libellé exact
- Aucune formule générique : interdit d'écrire "il est important de", "il convient de", "on peut noter que"
- Donne des verdicts clairs : "solide", "fragile", "lacunaire", "à risque", "redondant", "manquant"
- Sois critique et direct : une analyse qui ne pointe pas de faiblesses n'est pas une analyse
- Format : Markdown structuré, sections numérotées, sous-points avec tirets

Réponds en français.`;

function buildAnalysisPrompt(d) {
  const L = [];
  const p = d.counts || {};
  const fmt = (n) => (n == null ? "—" : String(n));

  if (d.projectName || d.theme) {
    L.push(`## CONTEXTE DU PROJET`);
    if (d.projectName) L.push(`- Nom : **${d.projectName}**`);
    if (d.theme)       L.push(`- Thème : **${d.theme}**`);
    L.push(``);
  }

  L.push(`## MÉTRIQUES — ARBRE À PROBLÈMES`);
  L.push(`- Nœuds total : **${fmt(p.total)}** (${fmt(p.causes)} causes, ${fmt(p.consequences)} conséquences, ${fmt(p.problem)} problème(s))`);
  L.push(`- Liaisons : **${fmt(p.links)}** | Dans l'arbre : **${fmt(p.inTree)}** / ${fmt(p.total)} | Hors arbre : ${fmt(p.offTree)}`);
  if (d.depthByCat?.length) {
    d.depthByCat.forEach((row) =>
      L.push(`- Profondeur ${row.cat} : moy=${fmt(row.avg)}, min=${fmt(row.min)}, max=${fmt(row.max)}`)
    );
  }
  if (p.isolated > 0) L.push(`- ⚠ Nœuds isolés : **${p.isolated}** (non reliés, hors arbre logique)`);
  L.push(``);

  if (d.topCauses?.length) {
    L.push(`## LEVIERS — TOP CAUSES PAR IMPACT`);
    d.topCauses.slice(0, 8).forEach((c, i) =>
      L.push(`${i + 1}. "${c.label}" → **${c.impact} conséquence(s)** couvertes, effort proxy (indeg) = ${c.effort}`)
    );
    L.push(``);
  }

  if (d.quickWins?.length) {
    L.push(`## QUICK WINS (impact ≥ P75, effort ≤ P25)`);
    d.quickWins.forEach((c) => L.push(`- "${c.label}" — impact=${c.impact}, effort=${c.effort}`));
    L.push(``);
  } else {
    L.push(`## QUICK WINS`);
    L.push(`- Aucun quick win détecté : les causes à fort impact ont toutes un effort élevé.`);
    L.push(``);
  }

  if (d.topBottlenecks?.length) {
    L.push(`## GOULETS D'ÉTRANGLEMENT (flux = indeg × outdeg)`);
    d.topBottlenecks.slice(0, 5).forEach((n) =>
      L.push(`- "${n.label}" — entrées=${n.indeg}, sorties=${n.outdeg}, flux≈${n.flow}`)
    );
    L.push(``);
  }

  if (d.duplicates?.length) {
    L.push(`## DOUBLONS POTENTIELS (Jaccard ≥ 0.8)`);
    d.duplicates.slice(0, 8).forEach((dup) =>
      L.push(`- "${dup.a}" ↔ "${dup.b}" (similarité=${dup.score})`)
    );
    L.push(``);
  }

  if (d.sampleChains?.length) {
    L.push(`## CHAÎNES CAUSALES REPRÉSENTATIVES`);
    d.sampleChains.forEach((ch, i) => L.push(`${i + 1}. ${ch.join(" → ")}`));
    L.push(``);
  }

  if (d.objectiveTree) {
    const ot = d.objectiveTree;
    L.push(`## ARBRE À OBJECTIFS`);
    L.push(`- Objectif central : **"${ot.central}"**`);
    L.push(`- Moyens (${fmt(ot.means?.length)}) :`);
    (ot.means || []).forEach((m) => {
      const st = m.validationStatus === "validated" ? "✓ validé"
               : m.validationStatus === "to_review"  ? "⚠ à revoir"
               : "généré";
      L.push(`  - "${m.content}" [${st}]`);
    });
    L.push(`- Fins attendues (${fmt(ot.ends?.length)}) :`);
    (ot.ends || []).forEach((e) => L.push(`  - "${e.content}"`));
    const v = (ot.means || []).filter((m) => m.validationStatus === "validated").length;
    const r = (ot.means || []).filter((m) => m.validationStatus === "to_review").length;
    L.push(`- Validation : **${v} validés**, ${r} à revoir, ${(ot.means?.length || 0) - v - r} générés non relus`);
    L.push(``);
  }

  if (d.strategies?.length) {
    L.push(`## STRATÉGIES D'INTERVENTION IDENTIFIÉES`);
    d.strategies.forEach((s, i) => {
      L.push(`### Stratégie ${i + 1} : "${s.name || s.colorLabel}"`);
      if (s.rationale) L.push(`- Logique déclarée : ${s.rationale}`);
      if (s.score != null) L.push(`- Score BFS : ${s.score} | Fins couvertes : ${fmt(s.impact)}`);
      if (s.meansContents?.length) L.push(`- Moyens : ${s.meansContents.map((x) => `"${x}"`).join(", ")}`);
      L.push(``);
    });
  }

  L.push(`---`);
  L.push(``);
  L.push(`## ANALYSE DEMANDÉE`);
  L.push(``);
  L.push(`Produis une analyse de niveau expert en 6 sections numérotées et titrées.`);
  L.push(`Chaque section doit contenir au minimum 3 points substantiels.`);
  L.push(`Cite systématiquement les libellés exacts des nœuds pour ancrer ton analyse.`);
  L.push(``);
  L.push(`**1. QUALITÉ DU DIAGNOSTIC CAUSAL**`);
  L.push(`   Exhaustivité du mapping, cohérence de la logique causale, angles manquants,`);
  L.push(`   doublons à fusionner, nœuds isolés à traiter.`);
  L.push(``);
  L.push(`**2. SOLIDITÉ LOGIQUE DE L'ARBRE À OBJECTIFS**`);
  L.push(`   Qualité des transformations problème → objectif, solidité des chaînes`);
  L.push(`   moyens → central → fins, risques de causalité inversée ou de sauts logiques.`);
  L.push(``);
  L.push(`**3. ANALYSE CRITIQUE DES STRATÉGIES**`);
  L.push(`   Pertinence et cohérence interne de chaque stratégie, complémentarité ou`);
  L.push(`   chevauchements entre stratégies, stratégie recommandée avec justification.`);
  L.push(``);
  L.push(`**4. RISQUES ET HYPOTHÈSES CRITIQUES**`);
  L.push(`   Facteurs de risque absents de l'arbre, hypothèses implicites à expliciter,`);
  L.push(`   points de fragilité du cadre logique, dépendances externes non modélisées.`);
  L.push(``);
  L.push(`**5. RECOMMANDATIONS OPÉRATIONNELLES PRIORISÉES**`);
  L.push(`   - Immédiat (0–3 mois) : actions spécifiques sur les quick wins et goulets`);
  L.push(`   - Court terme (3–12 mois) : consolidation des leviers majeurs`);
  L.push(`   - Structurel (1 an+) : renforcement systémique du cadre logique`);
  L.push(``);
  L.push(`**6. SCORE DE QUALITÉ GLOBAL /10**`);
  L.push(`   Sous-score diagnostic causal /10, sous-score arbre à objectifs /10,`);
  L.push(`   sous-score cohérence stratégique /10, justification détaillée de chaque note.`);

  return L.join("\n");
}

/**
 * Lance une analyse experte complète via le provider IA configuré.
 * @param {object} analyticsData — métriques + arbres + stratégies
 * @param {{ provider, apiKey, model }} config
 * @param {function?} onDebug
 * @returns {Promise<string>} — texte Markdown de l'analyse
 */
export async function analyzeWithAI(analyticsData, config, onDebug) {
  if (!config?.provider || !config?.apiKey) throw new Error("IA non configurée");

  const userContent = buildAnalysisPrompt(analyticsData);
  const messages = [
    { role: "system", content: ANALYSIS_SYSTEM },
    { role: "user",   content: userContent },
  ];

  const cfg = { ...config, maxTokens: 3000 };

  console.log("[IA] CALLING IA FOR EXPERT ANALYSIS:", { provider: config.provider, model: config.model });
  onDebug?.({ type: "payload", provider: config.provider, model: config.model, labelsCount: 0, labels: [], messages });

  let rawText;
  try {
    switch (config.provider) {
      case "openai":     rawText = await callOpenAI(messages, cfg, onDebug);     break;
      case "openrouter": rawText = await callOpenRouter(messages, cfg, onDebug); break;
      case "google":     rawText = await callGoogle(messages, cfg, onDebug);     break;
      case "anthropic":  rawText = await callAnthropic(messages, cfg, onDebug);  break;
      default:           rawText = await callOpenAI(messages, cfg, onDebug);
    }
  } catch (err) {
    onDebug?.({ type: "error", message: err.message });
    throw err;
  }

  onDebug?.({ type: "raw", rawText });
  return rawText;
}

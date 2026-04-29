/**
 * objectiveTransformer.js — v3 (transformation sémantique expert)
 *
 * Architecture :
 *   1. analyzeProblemLabel()         — analyse sémantique du label source
 *   2. Utilitaires grammaticaux      — genre, nombre, accord, article
 *   3. Formateurs spécialisés        — un par structure sémantique
 *   4. formatObjectiveLabel()        — nettoyage final (supprime les "(e)")
 *   5. transformProblemLabelToObjectiveLabel() — fonction principale
 *   6. computeValidationScore()      — score automatique de confiance
 *   7. computeSemanticType()         — typage sémantique fin (means/intermediate/end)
 *   8. generateObjectiveTree()       — génération complète
 *   9. runSelfTests()                — suite de tests internes
 *
 * Toutes les fonctions sont pures, sans effet de bord.
 * Préparées pour remplacement ultérieur par appel IA.
 */

/* =========================================================
   ÉTAPE 1 — ANALYSE SÉMANTIQUE
   ========================================================= */

/**
 * Analyse la structure sémantique d'un label problème.
 * Détecte le type de négation, l'objet principal et la structure de phrase.
 *
 * @param {string} label
 * @returns {{
 *   typeNegation: string|null,
 *   objetPrincipal: string,
 *   structure: string,
 *   raw: string
 * }}
 */
export function analyzeProblemLabel(label) {
  if (!label?.trim()) {
    return { typeNegation: null, objetPrincipal: label ?? "", structure: "unknown", raw: label ?? "" };
  }
  const t = label.trim();

  /* ── Patterns PRÉFIXE (négation en début de phrase) ── */
  const prefixRules = [
    // Manque / Absence
    { re: /^manque\s+d[e']\s*/i,            type: "manque",      structure: "manque_de_X" },
    { re: /^manque\s+/i,                    type: "manque",      structure: "manque_de_X" },
    { re: /^absence\s+d[e']\s*/i,           type: "absence",     structure: "absence_de_X" },
    { re: /^inexistence\s+d[e']\s*/i,       type: "absence",     structure: "absence_de_X" },
    { re: /^insuffisance\s+d[e']\s*/i,      type: "insuffisance",structure: "manque_de_X" },
    // Quantitatif
    { re: /^faibles?\s+/i,                  type: "faible",      structure: "faible_X" },
    { re: /^insuffisant[e]?\s+/i,           type: "faible",      structure: "faible_X" },
    { re: /^mauvais[e]?\s+/i,               type: "mauvais",     structure: "faible_X" },
    { re: /^fragiles?\s+/i,                 type: "faible",      structure: "faible_X" },
    { re: /^limité[e]?\s+/i,               type: "faible",      structure: "faible_X" },
    { re: /^peu\s+d[e']\s*/i,              type: "manque",      structure: "manque_de_X" },
    { re: /^pas\s+d[e']\s*/i,              type: "absence",     structure: "absence_de_X" },
    { re: /^aucun[e]?\s+/i,                type: "absence",     structure: "absence_de_X" },
    // Baisse / Perte
    { re: /^baisse\s+d(?:es?|[e'])\s*/i,   type: "baisse",      structure: "baisse_de_X" },
    { re: /^déclin\s+d(?:es?|[e'])\s*/i,   type: "baisse",      structure: "baisse_de_X" },
    { re: /^perte\s+d(?:es?|[e'])\s*/i,    type: "perte",       structure: "perte_de_X" },
    { re: /^dégradation\s+d(?:es?|[e'])\s*/i, type: "dégradation", structure: "baisse_de_X" },
    { re: /^détérioration\s+d(?:es?|[e'])\s*/i, type: "dégradation", structure: "baisse_de_X" },
    // Spéciaux
    { re: /^déficit\s+d(?:es?|[e'])\s*/i,  type: "manque",      structure: "manque_de_X" },
    { re: /^pénurie\s+d(?:es?|[e'])\s*/i,  type: "manque",      structure: "manque_de_X" },
    { re: /^problème[s]?\s+d[e']\s*/i,     type: "problème",    structure: "manque_de_X" },
    { re: /^problème[s]?\s+de\s+/i,        type: "problème",    structure: "manque_de_X" },
    // Difficulté
    { re: /^difficultés?\s+[àa]\s+/i,      type: "difficulté",  structure: "difficulte_a_X" },
    { re: /^difficultés?\s+d[e']\s*/i,     type: "difficulté",  structure: "manque_de_X" },
    { re: /^difficultés?\s+de\s+/i,        type: "difficulté",  structure: "manque_de_X" },
    // Isolement / Exclusion
    { re: /^isolement\s+d[e']\s*/i,        type: "isolement",   structure: "isolement_de_X" },
    { re: /^exclusion\s+d[e']\s*/i,        type: "exclusion",   structure: "exclusion_de_X" },
    { re: /^marginalisation\s+d[e']\s*/i,  type: "exclusion",   structure: "exclusion_de_X" },
    // Désorganisation / Inefficacité
    { re: /^inefficacité\s+d[e']\s*/i,     type: "inefficacité",structure: "faible_X" },
    { re: /^désorganisation\s+d[e']\s*/i,  type: "désorganisation", structure: "desorganisation_de_X" },
    { re: /^méconnaissance\s+d[e']\s*/i,   type: "méconnaissance",  structure: "meconnaissance_de_X" },
    { re: /^désinformation\b/i,            type: "désinformation",  structure: "desinformation" },
    // Réticence / Résistance
    { re: /^réticences?\s+(?:[àa]|d[e']\s*)?/i, type: "réticence", structure: "faible_X" },
    { re: /^résistances?\s+(?:[àa]|d[e']\s*)?/i, type: "résistance", structure: "faible_X" },
    // Non / Sous
    { re: /^non[-\s]+/i,                   type: "non",         structure: "non_X" },
    { re: /^sous[-\s]+/i,                  type: "sous",        structure: "faible_X" },
  ];

  for (const { re, type, structure } of prefixRules) {
    if (re.test(t)) {
      const objetPrincipal = t.replace(re, "").trim();
      return { typeNegation: type, objetPrincipal, structure, raw: t };
    }
  }

  /* ── Patterns MILIEU / composés (ex: "Rôles non définis") ── */
  const midRules = [
    { re: /^(.+?)\s+non\s+défini[e]?s?$/i,        type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+formalisé[e]?s?$/i,     type: "non_formalise", structure: "X_non_formalise", group: 1 },
    { re: /^(.+?)\s+non\s+établi[e]?s?$/i,        type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+fonctionnel[s]?$/i,     type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+structuré[e]?s?$/i,     type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+maîtrisé[e]?s?$/i,      type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+coordonné[e]?s?$/i,     type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+opérationnel[s]?$/i,    type: "non_defini",    structure: "X_non_defini",    group: 1 },
    { re: /^(.+?)\s+non\s+mis\s+en\s+place$/i,    type: "absence",       structure: "absence_de_X",    group: 1 },
    { re: /^(.+?)\s+non\s+respecté[e]?s?$/i,      type: "non_defini",    structure: "X_non_defini",    group: 1 },
  ];

  for (const { re, type, structure, group } of midRules) {
    const m = t.match(re);
    if (m) {
      const objetPrincipal = m[group].trim();
      return { typeNegation: type, objetPrincipal, structure, raw: t };
    }
  }

  /* ── Patterns SUFFIXE (adjectif négatif en fin de phrase) ── */
  const suffixRules = [
    { re: /\s+irrégulières?$/i,     type: "irrégulier",   structure: "X_irregulier" },
    { re: /\s+insuffisant[e]?s?$/i, type: "faible",        structure: "X_faible" },
    { re: /\s+faibles?$/i,          type: "faible",        structure: "X_faible" },
    { re: /\s+limité[e]?s?$/i,      type: "faible",        structure: "X_faible" },
    { re: /\s+absent[e]?s?$/i,      type: "absence",       structure: "X_absent" },
    { re: /\s+inexistant[e]?s?$/i,  type: "absence",       structure: "X_absent" },
    { re: /\s+défaillant[e]?s?$/i,  type: "faible",        structure: "X_faible" },
    { re: /\s+inadéquat[e]?s?$/i,   type: "faible",        structure: "X_faible" },
    { re: /\s+discontinu[e]?s?$/i,  type: "irrégulier",    structure: "X_irregulier" },
    { re: /\s+ponctuel[s]?$/i,      type: "irrégulier",    structure: "X_irregulier" },
  ];

  for (const { re, type, structure } of suffixRules) {
    if (re.test(t)) {
      const objetPrincipal = t.replace(re, "").trim();
      return { typeNegation: type, objetPrincipal, structure, raw: t };
    }
  }

  /* ── Aucun pattern détecté ── */
  return { typeNegation: null, objetPrincipal: t, structure: "neutral", raw: t };
}

/* =========================================================
   ÉTAPE 2 — UTILITAIRES GRAMMATICAUX
   ========================================================= */

/**
 * Devine le genre grammatical français d'un nom (heuristique).
 * @returns {"f"|"m"}
 */
function guessGender(noun) {
  const n = noun
    .toLowerCase()
    .trim()
    .replace(/aux$/, "al")   // canaux → canal
    .replace(/eaux$/, "eau") // bureaux → bureau
    .replace(/[xs]$/, "");   // autres pluriels

  // Terminaisons féminines fiables
  if (/(ion|ité|ance|ence|esse|ure|ode|ise|tion|sion|ison|tude|ude|ière|ière|ée|eau)$/.test(n)) return "f";

  // Mots féminins courants en gestion de projet / GAR
  const feminineWords = [
    "information", "communication", "coordination", "mobilisation", "participation",
    "formation", "ressource", "ressources", "confiance", "cohésion", "vision", "mission", "décision",
    "coopération", "organisation", "collaboration", "implication", "adhésion", "contribution",
    "compétence", "transparence", "gouvernance", "performance", "référence", "présence",
    "cohérence", "pertinence", "connaissance", "reconnaissance", "répartition", "planification",
    "animation", "sensibilisation", "conscientisation", "mutualisation", "valorisation",
    "capitalisation", "documentation", "évaluation", "représentation", "concertation",
    "cotisation", "solidarité", "responsabilité", "durabilité", "visibilité", "crédibilité",
    "disponibilité", "accessibilité", "qualité", "capacité", "activité", "volonté",
  ];
  if (feminineWords.some((fw) => n.includes(fw))) return "f";

  // Terminaisons masculines
  if (/(ment|age|eur|isme|oir|al|eau|et|eau|é|if|oud|our)$/.test(n)) return "m";

  return "m"; // défaut masculin
}

/** Renvoie true si le mot est au pluriel (heuristique). */
function isPlural(noun) {
  const n = noun.trim().toLowerCase();
  // Mots invariables courants (toujours terminés en -s/-x mais singuliers)
  const invariable = ['voix', 'croix', 'bois', 'temps', 'corps', 'bras', 'dos', 'cas', 'pays',
                      'choix', 'prix', 'flux', 'avis', 'poids', 'mois', 'cours', 'accès'];
  if (invariable.includes(n)) return false;
  // Mots en -aux → pluriel de -al (canaux, journaux, animaux…)
  if (/aux$/i.test(n)) return true;
  // Terminaison en -s ou -x → pluriel probable (rôles, ressources, financières…)
  if (/[sx]$/i.test(n)) return true;
  return false;
}

/**
 * Extrait le nom tête (premier mot) d'un syntagme nominal.
 * Ex: "participation aux réunions" → "participation"
 *     "ressources financières"     → "ressources"
 *     "plan d'action"              → "plan"
 */
function extractHeadNoun(phrase) {
  const words = phrase.trim().split(/\s+/);
  return words[0] || phrase;
}

/** Singularise simplement un mot français (heuristique). */
function singularize(noun) {
  const n = noun.trim();
  if (/tions$/i.test(n)) return n.replace(/s$/i, "");      // communications
  if (/sions$/i.test(n)) return n.replace(/s$/i, "");      // décisions
  if (/ences$/i.test(n)) return n.replace(/s$/i, "");      // compétences
  if (/ances$/i.test(n)) return n.replace(/s$/i, "");      // ressources
  if (/ités$/i.test(n)) return n.replace(/s$/i, "");       // capacités
  if (/ités$/i.test(n)) return n.replace(/s$/i, "");
  if (/aux$/i.test(n)) return n.replace(/aux$/i, "al");    // canaux → canal
  if (/eaux$/i.test(n)) return n.replace(/eaux$/i, "eau"); // bureaux → bureau
  if (/s$/i.test(n)) return n.replace(/s$/, "");           // général
  return n;
}

/**
 * Table d'accords des participes passés les plus utilisés.
 * Forme : { m, f, mp, fp }
 */
const ACCORD_TABLE = {
  assuré:    { m: "assuré",    f: "assurée",    mp: "assurés",    fp: "assurées"    },
  renforcé:  { m: "renforcé",  f: "renforcée",  mp: "renforcés",  fp: "renforcées"  },
  stabilisé: { m: "stabilisé", f: "stabilisée", mp: "stabilisés", fp: "stabilisées" },
  amélioré:  { m: "amélioré",  f: "améliorée",  mp: "améliorés",  fp: "améliorées"  },
  préservé:  { m: "préservé",  f: "préservée",  mp: "préservés",  fp: "préservées"  },
  défini:    { m: "défini",    f: "définie",    mp: "définis",    fp: "définies"    },
  formalisé: { m: "formalisé", f: "formalisée", mp: "formalisés", fp: "formalisées" },
  mobilisé:  { m: "mobilisé",  f: "mobilisée",  mp: "mobilisés",  fp: "mobilisées"  },
  valorisé:  { m: "valorisé",  f: "valorisée",  mp: "valorisés",  fp: "valorisées"  },
  adapté:    { m: "adapté",    f: "adaptée",    mp: "adaptés",    fp: "adaptées"    },
  optimisé:  { m: "optimisé",  f: "optimisée",  mp: "optimisés",  fp: "optimisées"  },
  intégré:   { m: "intégré",   f: "intégrée",   mp: "intégrés",   fp: "intégrées"   },
  développé: { m: "développé", f: "développée", mp: "développés", fp: "développées" },
  consolidé: { m: "consolidé", f: "consolidée", mp: "consolidés", fp: "consolidisées" },
  facilité:  { m: "facilité",  f: "facilitée",  mp: "facilités",  fp: "facilitées"  },
  maintenu:  { m: "maintenu",  f: "maintenue",  mp: "maintenus",  fp: "maintenues"  },
  organisé:  { m: "organisé",  f: "organisée",  mp: "organisés",  fp: "organisées"  },
  structuré: { m: "structuré", f: "structurée", mp: "structurés", fp: "structurées" },
};

/**
 * Accorde un participe passé avec le nom donné.
 * @param {string} base   - Forme masculine singulier (ex: "assuré")
 * @param {string} noun   - Nom de référence
 * @returns {string} Forme accordée
 */
function agree(base, noun) {
  const table = ACCORD_TABLE[base];
  if (!table) return base;
  // Accord sur le nom tête (premier mot du syntagme) pour éviter l'attraction
  // vers un complément : "participation aux réunions" → accord sur "participation"
  const head = extractHeadNoun(noun);
  const plural = isPlural(head);
  const gender = guessGender(head);
  if (plural) return gender === "f" ? table.fp : table.mp;
  return gender === "f" ? table.f : table.m;
}

/**
 * Accorde "mis en place" avec le nom.
 */
function misEnPlace(noun) {
  const head = extractHeadNoun(noun);
  const plural = isPlural(head);
  const gender = guessGender(head);
  if (plural && gender === "f") return "mises en place";
  if (plural) return "mis en place";
  if (gender === "f") return "mise en place";
  return "mis en place";
}

/**
 * Construit "de + article + nom singulier" (élision/contraction).
 * Ex: "information" → "de l'information"
 *     "dispositif" → "du dispositif"
 */
function deArticle(noun) {
  const singular = singularize(noun).toLowerCase().trim();
  if (/^[aeiouéèêëàâùûü]/i.test(singular)) return `de l'${singular}`;
  const gender = guessGender(noun);
  return gender === "f" ? `de la ${singular}` : `du ${singular}`;
}

/* =========================================================
   ÉTAPE 3 — FORMATEURS SÉMANTIQUES SPÉCIALISÉS
   ========================================================= */

function formatManque(objet) {
  // "manque de X" → "X assuré(e)"
  return `${cap(objet)} ${agree("assuré", objet)}`;
}

function formatAbsence(objet) {
  // "absence de X" → "X mis(e) en place"
  return `${cap(objet)} ${misEnPlace(objet)}`;
}

function formatFaible(objet) {
  // "faible X" → "X renforcé(e)"
  return `${cap(objet)} ${agree("renforcé", objet)}`;
}

function formatBaisse(objet) {
  // "baisse de X" → "X stabilisé(e) et renforcé(e)"
  const s1 = agree("stabilisé", objet);
  const s2 = agree("renforcé", objet);
  return `${cap(objet)} ${s1} et ${s2}`;
}

function formatPerte(objet) {
  // "perte de X" → "X préservé(e) et renforcé(e)"
  const s1 = agree("préservé", objet);
  const s2 = agree("renforcé", objet);
  return `${cap(objet)} ${s1} et ${s2}`;
}

function formatIrregulier(objet) {
  // "X irrégulier/ières" → "Diffusion régulière de X assurée"
  // On nominalise l'objet via "de + article + singulier"
  const article = deArticle(objet);
  return `Diffusion régulière ${article} assurée`;
}

function formatNonDefini(objet) {
  // "X non défini(s)" → "X clairement défini(s)"
  // Si "rôle", "fonction", "tâche", "mission" → ajoute "et responsabilités"
  const hasRole = /rôle|fonction|tâche|mission|attribut|poste/i.test(objet);
  const adj = agree("défini", objet);
  if (hasRole) {
    return `${cap(objet)} et responsabilités clairement ${adj}`;
  }
  return `${cap(objet)} clairement ${adj}`;
}

function formatNonFormalise(objet) {
  // "X non formalisé(s)" → "X formalisé(s)"
  return `${cap(objet)} ${agree("formalisé", objet)}`;
}

function formatDifficulteA(objet) {
  // "difficulté à X" → "Capacité à X renforcée"
  return `Capacité à ${objet} renforcée`;
}

function formatIsolement(objet) {
  return `${cap(objet)} ${agree("intégré", objet)} et connecté`;
}

function formatExclusion(objet) {
  return `${cap(objet)} inclus et valorisé`;
}

function formatDesorganisation(objet) {
  return `${cap(objet)} ${agree("organisé", objet)}`;
}

function formatMeconnaissance(objet) {
  // "méconnaissance de X" → "Connaissance de X renforcée"
  return `Connaissance ${deArticle(objet)} renforcée`;
}

function formatNonX(objet) {
  // "non X" générique → "X assuré(e)"
  return `${cap(objet)} ${agree("assuré", objet)}`;
}

function formatXFaible(objet) {
  // adjectif négatif suffixe faiblesse
  return `${cap(objet)} ${agree("renforcé", objet)}`;
}

function formatXAbsent(objet) {
  return `${cap(objet)} ${agree("assuré", objet)} et disponible`;
}

/* =========================================================
   ÉTAPE 4 — FORMATEUR FINAL (nettoyage)
   ========================================================= */

/**
 * Nettoie et standardise le label objectif final.
 * — Supprime les marqueurs "(e)" résiduels
 * — Capitalise la première lettre
 * — Normalise les espaces
 *
 * @param {string} text
 * @returns {string}
 */
export function formatObjectiveLabel(text) {
  if (!text) return text ?? "";
  return text
    .replace(/\(e\)s\b/g, "s")   // "(e)s" → "s"
    .replace(/\(e\)\b/g, "")     // "(e)" → ""
    .replace(/\(s\)\b/g, "s")    // "(s)" → "s"
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/* =========================================================
   ÉTAPE 5 — MARQUEURS POSITIFS (labels à conserver tels quels)
   ========================================================= */

const POSITIVE_MARKERS = [
  "renforcé", "renforcée", "renforcés", "renforcées",
  "amélioré", "améliorée", "améliorés", "améliorées",
  "stabilisé", "stabilisée", "stabilisés", "stabilisées",
  "mis en place", "mise en place", "mises en place",
  "assuré", "assurée", "assurés", "assurées",
  "disponible", "disponibles",
  "suffisant", "suffisante",
  "performant", "efficace", "optimisé",
  "adapté", "adaptée", "adaptés", "adaptées",
  "développé", "développée",
  "consolidé", "consolidée",
  "mobilisé", "mobilisée", "mobilisés", "mobilisées",
  "intégré", "intégrée",
  "atteint", "atteinte",
  "préservé", "préservée",
  "formalisé", "formalisée", "formalisés", "formalisées",
  "défini", "définie", "définis", "définies",
  "clairement défini", "clairement définie",
  "structuré", "structurée",
  "organisé", "organisée",
  "opérationnel", "fonctionnel",
  "régulier", "régulière", "réguliers", "régulières",
  "établi", "établie",
  "valorisé", "valorisée",
  "maintenu", "maintenue",
];

/**
 * Renvoie true si le label semble déjà formulé positivement.
 * Vérifie qu'il ne commence pas par une négation avant d'approuver.
 */
function soundsPositive(label) {
  if (!label) return false;
  // Si commence par un mot négatif → pas positif
  if (/^(?:manque|absence|faible|insuffisant|mauvais|baisse|non|pas|peu|aucun|déficit|perte|dégradation|problème|difficulté|inexistence|inefficacité|désorganisation)/i.test(label.trim())) return false;
  // Si contient "non " → pas positif
  if (/\bnon\s+/i.test(label)) return false;
  // Contient un marqueur positif ?
  const lower = label.toLowerCase();
  return POSITIVE_MARKERS.some((m) => lower.includes(m));
}

/* =========================================================
   ÉTAPE 6 — TRANSFORMATION PRINCIPALE
   ========================================================= */

/**
 * Transforme une étiquette négative en objectif positif opérationnel.
 * Approche sémantique : analyse d'abord, formule ensuite.
 *
 * @param {string} label    - Étiquette source (arbre à problèmes)
 * @param {"problem"|"causes"|"consequences"} nodeType
 * @returns {string}        - Étiquette objectif
 */
export function transformProblemLabelToObjectiveLabel(label, nodeType) {
  if (!label?.trim()) return label ?? "";
  const t = label.trim();

  const { typeNegation, objetPrincipal, structure } = analyzeProblemLabel(t);

  let result;

  switch (structure) {
    // ── Structures avec "de/des + X" ─────────────────────────────────────────
    case "manque_de_X":
    case "insuffisance_de_X":
      result = formatManque(objetPrincipal);
      break;

    case "absence_de_X":
      result = formatAbsence(objetPrincipal);
      break;

    case "faible_X":
      result = formatFaible(objetPrincipal);
      break;

    case "baisse_de_X":
      result = formatBaisse(objetPrincipal);
      break;

    case "perte_de_X":
      result = formatPerte(objetPrincipal);
      break;

    // ── Structures suffixes / milieu ──────────────────────────────────────────
    case "X_irregulier":
      result = formatIrregulier(objetPrincipal);
      break;

    case "X_non_defini":
      result = formatNonDefini(objetPrincipal);
      break;

    case "X_non_formalise":
      result = formatNonFormalise(objetPrincipal);
      break;

    case "X_faible":
      result = formatXFaible(objetPrincipal);
      break;

    case "X_absent":
      result = formatXAbsent(objetPrincipal);
      break;

    // ── Cas spéciaux ──────────────────────────────────────────────────────────
    case "difficulte_a_X":
      result = formatDifficulteA(objetPrincipal);
      break;

    case "isolement_de_X":
      result = formatIsolement(objetPrincipal);
      break;

    case "exclusion_de_X":
      result = formatExclusion(objetPrincipal);
      break;

    case "desorganisation_de_X":
      result = formatDesorganisation(objetPrincipal);
      break;

    case "meconnaissance_de_X":
      result = formatMeconnaissance(objetPrincipal);
      break;

    case "desinformation":
      result = "Information fiable diffusée";
      break;

    case "non_X":
      result = formatNonX(objetPrincipal);
      break;

    // ── Neutre : label peut-être déjà positif, ou non reconnu ────────────────
    case "neutral":
    default:
      if (soundsPositive(t)) return t;
      // Repli selon le type de nœud
      if (nodeType === "causes")       result = formatFaible(t);
      else if (nodeType === "consequences") result = `${cap(t)} ${agree("amélioré", t)}`;
      else result = `${cap(t)} ${agree("assuré", t)}`;
      break;
  }

  return formatObjectiveLabel(result);
}

/* =========================================================
   ÉTAPE 7 — SCORE DE VALIDATION AUTOMATIQUE
   ========================================================= */

/** Formulations interdites (vides de sens ou mécaniques). */
const FORBIDDEN_PATTERNS = [
  /résoudre le problème/i,
  /améliorer la situation de/i,
  /réduire le manque de/i,
  /suppression de l'absence/i,
  /mettre fin [àa]/i,
  /problème traité/i,
  /cause résolue/i,
  /\(e\)/,        // marqueurs genre non résolus
];

/**
 * Calcule un score de confiance (0–3) pour la transformation.
 * score < 2 → statut "to_review"
 *
 * @param {string} sourceLabel
 * @param {{ typeNegation: string|null, structure: string }} analysis
 * @param {string} transformedLabel
 * @returns {number}
 */
function computeValidationScore(sourceLabel, analysis, transformedLabel) {
  let score = 0;

  // +1 : aucune formulation interdite
  if (!FORBIDDEN_PATTERNS.some((p) => p.test(transformedLabel))) score += 1;

  // +1 : une transformation reconnue a été appliquée (pas de repli neutre)
  if (analysis.typeNegation !== null && analysis.structure !== "neutral") score += 1;

  // +1 : le label transformé est différent du source (quelque chose a bien changé)
  if (transformedLabel.trim().toLowerCase() !== sourceLabel.trim().toLowerCase()) score += 1;

  return score;
}

/* =========================================================
   ÉTAPE 8 — TYPAGE SÉMANTIQUE FIN
   ========================================================= */

function categoryToObjectiveType(category) {
  if (category === "problem")      return "central";
  if (category === "causes")       return "means";
  if (category === "consequences") return "ends";
  return "means";
}

function objectiveTypeToColor(objectiveType) {
  if (objectiveType === "central") return "green";
  if (objectiveType === "means")   return "teal";
  if (objectiveType === "ends")    return "blue";
  return "teal";
}

/**
 * Détermine le type sémantique fin d'un nœud cause :
 * - "intermediate" : directement relié au problème central
 * - "means"        : relié à une cause intermédiaire (racine profonde)
 * - "end"          : conséquence / finalité
 *
 * @returns {"means"|"intermediate"|"end"}
 */
function computeSemanticType(postIt, problemPostIts, problemConns) {
  if (postIt.category === "problem")      return "end";  // l'objectif central est une fin
  if (postIt.category === "consequences") return "end";

  // Pour les causes : chercher si directement connecté au problème central
  const centralProblem = problemPostIts.find(
    (p) => p.category === "problem" && p.isInTree
  );
  if (!centralProblem) return "means";

  const isDirectlyLinked = (problemConns ?? []).some(
    (c) =>
      (c.fromId === centralProblem.id && c.toId === postIt.id) ||
      (c.fromId === postIt.id && c.toId === centralProblem.id)
  );

  return isDirectlyLinked ? "intermediate" : "means";
}

/* =========================================================
   ÉTAPE 9 — GÉNÉRATION COMPLÈTE DE L'ARBRE À OBJECTIFS
   ========================================================= */

/**
 * Génère l'arbre à objectifs depuis l'arbre à problèmes.
 * Conserve la traçabilité complète + ajoute score et type sémantique.
 *
 * @param {Array} problemPostIts
 * @param {Array} problemConns
 * @returns {{ nodes: Array, connections: Array }}
 */
export function generateObjectiveTree(problemPostIts, problemConns) {
  const inTree = problemPostIts.filter((p) => p.isInTree);
  const inTreeIds = new Set(inTree.map((p) => p.id));

  const nodes = inTree.map((p) => {
    const objectiveType = categoryToObjectiveType(p.category);
    const analysis = analyzeProblemLabel(p.content);
    const transformedLabel = transformProblemLabelToObjectiveLabel(p.content, p.category);
    const score = computeValidationScore(p.content, analysis, transformedLabel);
    const semanticType = computeSemanticType(p, problemPostIts, problemConns || []);

    return {
      id: `obj-${p.id}`,
      // ── Traçabilité (obligatoire) ─────────────────────────────────────
      sourceProblemNodeId: p.id,
      sourceLabel: p.content,
      sourceType: p.category === "problem" ? "problem" : p.category === "causes" ? "cause" : "consequence",
      // ── Contenu ───────────────────────────────────────────────────────
      content: transformedLabel,      // compatibilité champ "content" existant
      objectiveType,                  // "central" | "means" | "ends"
      semanticType,                   // "means" | "intermediate" | "end"
      // ── Positionnement ────────────────────────────────────────────────
      x: p.x,
      y: p.y,
      isInTree: true,
      color: objectiveTypeToColor(objectiveType),
      // ── Validation ────────────────────────────────────────────────────
      validation: {
        desirable: null,
        feasible: null,
        logical: null,
        // Score < 2 → marquer automatiquement "à revoir"
        status: score < 2 ? "to_review" : "generated",
        _score: score,  // utile pour debug / future IA
      },
    };
  });

  const connections = (problemConns ?? [])
    .filter((c) => inTreeIds.has(c.fromId) && inTreeIds.has(c.toId))
    .map((c) => ({
      id: `obj-conn-${c.id}`,
      fromId: `obj-${c.fromId}`,
      toId: `obj-${c.toId}`,
    }));

  return { nodes, connections };
}

/* =========================================================
   ÉTAPE 10 — SUITE DE TESTS INTERNES
   ========================================================= */

/**
 * Exécute les tests de régression internes.
 * Utilisable en dev : `import { runSelfTests } from './lib/objectiveTransformer'`
 *
 * @returns {{ input: string, output: string, expected: string, pass: boolean }[]}
 */
export function runSelfTests() {
  const TESTS = [
    // ── Tests de base (exigences consignes) ───────────────────────────────
    {
      input: "Manque de communication interne", type: "causes",
      expected: "Communication interne assurée",
    },
    {
      input: "Informations irrégulières", type: "causes",
      expected: "Diffusion régulière de l'information assurée",
    },
    {
      input: "Rôles non définis", type: "causes",
      expected: "Rôles et responsabilités clairement définis",
    },
    {
      input: "Faible mobilisation", type: "causes",
      expected: "Mobilisation renforcée",
    },
    {
      input: "Baisse des cotisations", type: "consequences",
      expected: "Cotisations stabilisées et renforcées",
    },
    // ── Tests suffixes ────────────────────────────────────────────────────
    {
      input: "Absence de plan d'action", type: "causes",
      expected: "Plan d'action mis en place",
    },
    {
      input: "Canaux non formalisés", type: "causes",
      expected: "Canaux formalisés",
    },
    {
      input: "Faible participation aux réunions", type: "causes",
      expected: "Participation aux réunions renforcée",
    },
    {
      input: "Manque de ressources financières", type: "causes",
      expected: "Ressources financières assurées",
    },
    {
      input: "Perte de confiance dans l'association", type: "consequences",
      expected: "Confiance dans l'association préservée et renforcée",
    },
    {
      input: "Faible visibilité de l'association", type: "consequences",
      expected: "Visibilité de l'association renforcée",
    },
    // ── Tests labels déjà positifs (ne pas transformer) ───────────────────
    {
      input: "Communication renforcée", type: "causes",
      expected: "Communication renforcée",
    },
    {
      input: "Dispositif de suivi mis en place", type: "causes",
      expected: "Dispositif de suivi mis en place",
    },
  ];

  return TESTS.map((t) => {
    const output = transformProblemLabelToObjectiveLabel(t.input, t.type);
    return {
      input: t.input,
      output,
      expected: t.expected,
      pass: output === t.expected,
    };
  });
}

/** Alias interne (utilisé par App.jsx via import) */
function cap(str) {
  if (!str) return str ?? "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

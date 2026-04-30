/**
 * objectiveTransformer.js — v4 (transformation sémantique + antonymie)
 *
 * Architecture :
 *   1. analyzeProblemLabel()         — analyse sémantique du label source
 *   2. Utilitaires grammaticaux      — genre, nombre, accord, article
 *   3. Formateurs spécialisés        — un par structure sémantique
 *   4. formatObjectiveLabel()        — nettoyage final
 *   5. ADJ_ANTONYMS                  — table adj négatif → adj positif
 *   6. validateObjectiveLabel()      — rejet formulations mécaniques
 *   7. transformProblemLabelToObjectiveLabel() — fonction principale (avec retry)
 *   8. computeValidationScore()      — score automatique de confiance
 *   9. computeSemanticType()         — typage sémantique fin
 *  10. generateObjectiveTree()       — génération complète
 *  11. runSelfTests()                — suite de tests internes
 *
 * Toutes les fonctions sont pures, sans effet de bord.
 */

/* =========================================================
   ÉTAPE 1 — ANALYSE SÉMANTIQUE
   ========================================================= */

/**
 * Analyse la structure sémantique d'un label problème.
 *
 * @param {string} label
 * @returns {{
 *   typeNegation: string|null,
 *   objetPrincipal: string,
 *   structure: string,
 *   adjNégatif?: string,
 *   antonymBase?: string,
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
    // Manque / Absence  (couvre : de, du, des, d', de la)
    { re: /^manque\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i, type: "manque",      structure: "manque_de_X" },
    { re: /^manque\s+/i,                                        type: "manque",      structure: "manque_de_X" },
    { re: /^absence\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,type: "absence",     structure: "absence_de_X" },
    { re: /^inexistence\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i, type: "absence", structure: "absence_de_X" },
    { re: /^insuffisance\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,type:"insuffisance",structure:"manque_de_X"},
    // Quantitatif
    { re: /^faibles?\s+/i,                  type: "faible",      structure: "faible_X" },
    { re: /^insuffisant[e]?\s+/i,           type: "faible",      structure: "faible_X" },
    { re: /^mauvais[e]?\s+/i,               type: "mauvais",     structure: "faible_X" },
    { re: /^fragiles?\s+/i,                 type: "faible",      structure: "faible_X" },
    { re: /^limité[e]?\s+/i,               type: "faible",      structure: "faible_X" },
    { re: /^peu\s+d[e']\s*/i,              type: "manque",      structure: "manque_de_X" },
    { re: /^pas\s+d[e']\s*/i,              type: "absence",     structure: "absence_de_X" },
    { re: /^aucun[e]?\s+/i,                type: "absence",     structure: "absence_de_X" },
    // Baisse / Perte / Diminution  (couvre : de, du, des, d', de la)
    { re: /^baisse\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,        type: "baisse",      structure: "baisse_de_X" },
    { re: /^déclin\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,        type: "baisse",      structure: "baisse_de_X" },
    { re: /^diminution\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,    type: "baisse",      structure: "baisse_de_X" },
    { re: /^réduction\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,     type: "baisse",      structure: "baisse_de_X" },
    { re: /^chute\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,         type: "baisse",      structure: "baisse_de_X" },
    { re: /^affaiblissement\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,type:"baisse",      structure: "baisse_de_X" },
    { re: /^perte\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,         type: "perte",       structure: "perte_de_X"  },
    { re: /^dégradation\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i,   type: "dégradation", structure: "baisse_de_X" },
    { re: /^détérioration\s+(?:de\s+la\s+|du\s+|des?\s+|d[e']\s*)/i, type: "dégradation", structure: "baisse_de_X" },
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

  /* ── Patterns MILIEU composés — "X trop adj" / "X peu adj" ── */
  // Priorité sur les suffixes pour capturer la négation de degré
  const tropMatch = t.match(/^(.+?)\s+trop\s+(.+)$/i);
  if (tropMatch) {
    return {
      typeNegation: "trop_adj",
      objetPrincipal: tropMatch[1].trim(),
      adjNégatif: tropMatch[2].trim(),
      structure: "X_trop_adj",
      raw: t,
    };
  }

  const peuAdjMatch = t.match(/^(.+?)\s+peu\s+(.+)$/i);
  if (peuAdjMatch) {
    return {
      typeNegation: "peu_adj",
      objetPrincipal: peuAdjMatch[1].trim(),
      adjNégatif: peuAdjMatch[2].trim(),
      structure: "X_peu_adj",
      raw: t,
    };
  }

  /* ── Patterns MILIEU / composés existants (ex: "Rôles non définis") ── */
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

  /* ── Patterns SUFFIXE — adjectifs négatifs avec antonymie sémantique ── */
  // Ces règles ont priorité sur les suffixes génériques qui suivent
  const adjAntonymSuffixRules = [
    { re: /^(.+?)\s+confus[e]?s?$/i,          antonymBase: "clarifié"    },
    { re: /^(.+?)\s+complexes?$/i,              antonymBase: "simplifié"   },
    { re: /^(.+?)\s+fréquente?s?$/i,            antonymBase: "optimisé"    },
    { re: /^(.+?)\s+dégradé[e]?s?$/i,          antonymBase: "amélioré"    },
    { re: /^(.+?)\s+obsolète[s]?$/i,            antonymBase: "modernisé"   },
    { re: /^(.+?)\s+inadapté[e]?s?$/i,         antonymBase: "adapté"      },
    { re: /^(.+?)\s+inadéquat[e]?s?$/i,        antonymBase: "adapté"      },
    { re: /^(.+?)\s+inutile[s]?$/i,             antonymBase: "valorisé"    },
    { re: /^(.+?)\s+inefficace[s]?$/i,          antonymBase: "optimisé"    },
    { re: /^(.+?)\s+problématique[s]?$/i,       antonymBase: "résolu"      },
    { re: /^(.+?)\s+défaillant[e]?s?$/i,       antonymBase: "renforcé"    },
    { re: /^(.+?)\s+lent[e]?s?$/i,             antonymBase: "optimisé"    },
    { re: /^(.+?)\s+lourd[e]?s?$/i,            antonymBase: "simplifié"   },
    { re: /^(.+?)\s+rigide[s]?$/i,              antonymBase: "adapté"      },
  ];

  for (const { re, antonymBase } of adjAntonymSuffixRules) {
    const m = t.match(re);
    if (m) {
      return {
        typeNegation: "adj_negatif",
        objetPrincipal: m[1].trim(),
        antonymBase,
        structure: "X_adj_antonym",
        raw: t,
      };
    }
  }

  /* ── Patterns SUFFIXE génériques (adjectifs de manque/absence) ── */
  const suffixRules = [
    { re: /\s+irrégulières?$/i,     type: "irrégulier",   structure: "X_irregulier" },
    { re: /\s+insuffisant[e]?s?$/i, type: "faible",        structure: "X_faible" },
    { re: /\s+faibles?$/i,          type: "faible",        structure: "X_faible" },
    { re: /\s+limité[e]?s?$/i,      type: "faible",        structure: "X_faible" },
    { re: /\s+absent[e]?s?$/i,      type: "absence",       structure: "X_absent" },
    { re: /\s+inexistant[e]?s?$/i,  type: "absence",       structure: "X_absent" },
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

function guessGender(noun) {
  const n = noun
    .toLowerCase()
    .trim()
    .replace(/aux$/, "al")
    .replace(/eaux$/, "eau")
    .replace(/[xs]$/, "");

  if (/(ion|ité|ance|ence|esse|ure|ode|ise|tion|sion|ison|tude|ude|ière|ée)$/.test(n)) return "f";

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
    "interface", "plateforme", "application", "saisie", "procédure", "démarche",
  ];
  if (feminineWords.some((fw) => n.includes(fw))) return "f";

  if (/(ment|age|eur|isme|oir|al|eau|et|eau|é|if|oud|our)$/.test(n)) return "m";

  return "m";
}

function isPlural(noun) {
  const n = noun.trim().toLowerCase();
  const invariable = [
    "voix", "croix", "bois", "temps", "corps", "bras", "dos", "cas", "pays",
    "choix", "prix", "flux", "avis", "poids", "mois", "cours", "accès",
    "parcours", "recours", "succès", "procès", "progrès", "palmarès",
  ];
  if (invariable.includes(n)) return false;
  if (/aux$/i.test(n)) return true;
  if (/[sx]$/i.test(n)) return true;
  return false;
}

function extractHeadNoun(phrase) {
  const words = phrase.trim().split(/\s+/);
  return words[0] || phrase;
}

function singularize(noun) {
  const n = noun.trim();
  if (/tions$/i.test(n)) return n.replace(/s$/i, "");
  if (/sions$/i.test(n)) return n.replace(/s$/i, "");
  if (/ences$/i.test(n)) return n.replace(/s$/i, "");
  if (/ances$/i.test(n)) return n.replace(/s$/i, "");
  if (/ités$/i.test(n)) return n.replace(/s$/i, "");
  if (/aux$/i.test(n)) return n.replace(/aux$/i, "al");
  if (/eaux$/i.test(n)) return n.replace(/eaux$/i, "eau");
  if (/s$/i.test(n)) return n.replace(/s$/, "");
  return n;
}

const ACCORD_TABLE = {
  assuré:      { m: "assuré",      f: "assurée",      mp: "assurés",      fp: "assurées"      },
  renforcé:    { m: "renforcé",    f: "renforcée",    mp: "renforcés",    fp: "renforcées"    },
  stabilisé:   { m: "stabilisé",   f: "stabilisée",   mp: "stabilisés",   fp: "stabilisées"   },
  amélioré:    { m: "amélioré",    f: "améliorée",    mp: "améliorés",    fp: "améliorées"    },
  préservé:    { m: "préservé",    f: "préservée",    mp: "préservés",    fp: "préservées"    },
  défini:      { m: "défini",      f: "définie",      mp: "définis",      fp: "définies"      },
  formalisé:   { m: "formalisé",   f: "formalisée",   mp: "formalisés",   fp: "formalisées"   },
  mobilisé:    { m: "mobilisé",    f: "mobilisée",    mp: "mobilisés",    fp: "mobilisées"    },
  valorisé:    { m: "valorisé",    f: "valorisée",    mp: "valorisés",    fp: "valorisées"    },
  adapté:      { m: "adapté",      f: "adaptée",      mp: "adaptés",      fp: "adaptées"      },
  optimisé:    { m: "optimisé",    f: "optimisée",    mp: "optimisés",    fp: "optimisées"    },
  intégré:     { m: "intégré",     f: "intégrée",     mp: "intégrés",     fp: "intégrées"     },
  développé:   { m: "développé",   f: "développée",   mp: "développés",   fp: "développées"   },
  consolidé:   { m: "consolidé",   f: "consolidée",   mp: "consolidés",   fp: "consolidées"   },
  facilité:    { m: "facilité",    f: "facilitée",    mp: "facilités",    fp: "facilitées"    },
  maintenu:    { m: "maintenu",    f: "maintenue",    mp: "maintenus",    fp: "maintenues"    },
  organisé:    { m: "organisé",    f: "organisée",    mp: "organisés",    fp: "organisées"    },
  structuré:   { m: "structuré",   f: "structurée",   mp: "structurés",   fp: "structurées"   },
  // Nouveaux (antonymie)
  clarifié:    { m: "clarifié",    f: "clarifiée",    mp: "clarifiés",    fp: "clarifiées"    },
  simplifié:   { m: "simplifié",   f: "simplifiée",   mp: "simplifiés",   fp: "simplifiées"   },
  modernisé:   { m: "modernisé",   f: "modernisée",   mp: "modernisés",   fp: "modernisées"   },
  rationalisé: { m: "rationalisé", f: "rationalisée", mp: "rationalisés", fp: "rationalisées" },
  unifié:      { m: "unifié",      f: "unifiée",      mp: "unifiés",      fp: "unifiées"      },
  résolu:      { m: "résolu",      f: "résolue",      mp: "résolus",      fp: "résolues"      },
  numérisé:    { m: "numérisé",    f: "numérisée",    mp: "numérisés",    fp: "numérisées"    },
};

function agree(base, noun) {
  const table = ACCORD_TABLE[base];
  if (!table) return base;
  const head = extractHeadNoun(noun);
  const plural = isPlural(head);
  const gender = guessGender(head);
  if (plural) return gender === "f" ? table.fp : table.mp;
  return gender === "f" ? table.f : table.m;
}

function misEnPlace(noun) {
  const head = extractHeadNoun(noun);
  const plural = isPlural(head);
  const gender = guessGender(head);
  if (plural && gender === "f") return "mises en place";
  if (plural) return "mis en place";
  if (gender === "f") return "mise en place";
  return "mis en place";
}

function deArticle(noun) {
  const singular = singularize(noun).toLowerCase().trim();
  if (/^[aeiouéèêëàâùûü]/i.test(singular)) return `de l'${singular}`;
  const gender = guessGender(noun);
  return gender === "f" ? `de la ${singular}` : `du ${singular}`;
}

/* =========================================================
   ÉTAPE 3 — TABLE ANTONYMS ADJECTIVAUX
   (pour "X trop adj" → "X plus [antonym(adj)]")
   ========================================================= */

/**
 * Adjectif négatif → adjectif positif (invariable ou déjà accordé).
 * Quand "trop adj" est détecté, on cherche l'antonym et on produit
 * "X plus [antonym]" — l'adj source est déjà accordé dans la phrase originale.
 */
const ADJ_ANTONYMS = {
  "théorique": "pratique",       "théoriques": "pratiques",
  "complexe":  "simple",         "complexes":  "simples",
  "lent":      "rapide",         "lente":      "rapide",    "lents": "rapides",  "lentes": "rapides",
  "long":      "concis",         "longue":     "concise",   "longs": "concis",   "longues": "concises",
  "flou":      "clair",          "floue":      "claire",    "flous": "clairs",   "floues": "claires",
  "rigide":    "flexible",       "rigides":    "flexibles",
  "lourd":     "léger",          "lourde":     "légère",    "lourds": "légers",  "lourdes": "légères",
  "difficile": "accessible",     "difficiles": "accessibles",
  "coûteux":   "abordable",      "coûteuse":   "abordable",
  "lourde":    "allégée",
  "fragmenté": "unifié",         "fragmentée": "unifiée",   "fragmentés": "unifiés", "fragmentées": "unifiées",
  "dispersé":  "centralisé",     "dispersée":  "centralisée",
  "redondant": "rationalisé",    "redondante": "rationalisée",
  "manuel":    "automatisé",     "manuelle":   "automatisée",
  "opaque":    "transparent",    "opaques":    "transparents",
  "inefficace": "efficace",      "inefficaces": "efficaces",
  "inadapté":  "adapté",         "inadaptée":  "adaptée",
};

/* =========================================================
   ÉTAPE 4 — FORMATEURS SÉMANTIQUES SPÉCIALISÉS
   ========================================================= */

function formatManque(objet) {
  return `${cap(objet)} ${agree("assuré", objet)}`;
}

function formatAbsence(objet) {
  return `${cap(objet)} ${misEnPlace(objet)}`;
}

function formatFaible(objet) {
  return `${cap(objet)} ${agree("renforcé", objet)}`;
}

function formatBaisse(objet) {
  return `${cap(objet)} ${agree("stabilisé", objet)} et ${agree("renforcé", objet)}`;
}

function formatPerte(objet) {
  return `${cap(objet)} ${agree("préservé", objet)} et ${agree("renforcé", objet)}`;
}

function formatIrregulier(objet) {
  const article = deArticle(objet);
  return `Diffusion régulière ${article} assurée`;
}

function formatNonDefini(objet) {
  const hasRole = /rôle|fonction|tâche|mission|attribut|poste/i.test(objet);
  const adj = agree("défini", objet);
  if (hasRole) return `${cap(objet)} et responsabilités clairement ${adj}`;
  return `${cap(objet)} clairement ${adj}`;
}

function formatNonFormalise(objet) {
  return `${cap(objet)} ${agree("formalisé", objet)}`;
}

function formatDifficulteA(objet) {
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
  return `Connaissance ${deArticle(objet)} renforcée`;
}

function formatNonX(objet) {
  return `${cap(objet)} ${agree("assuré", objet)}`;
}

function formatXFaible(objet) {
  return `${cap(objet)} ${agree("renforcé", objet)}`;
}

function formatXAbsent(objet) {
  return `${cap(objet)} ${agree("assuré", objet)} et disponible`;
}

/**
 * "X adj_antonym" — remplace l'adjectif négatif par son antonyme (participe).
 * Ex : "Parcours utilisateur confus" → antonymBase="clarifié" → "Parcours utilisateur clarifié"
 */
function formatAdjAntonym(objet, antonymBase) {
  return `${cap(objet)} ${agree(antonymBase, objet)}`;
}

/**
 * "X trop adj" → "X plus [antonym(adj)]"
 * Ex : "Formation trop théorique" → "Formation plus pratique"
 * Si pas d'antonymie connue → fallback "X optimisé(e)"
 */
function formatTropAdj(objet, adj) {
  const adjLower = adj.toLowerCase().trim();
  const antonym = ADJ_ANTONYMS[adjLower];
  if (antonym) return `${cap(objet)} plus ${antonym}`;
  // Fallback : suppression de l'adjectif + participe générique
  return `${cap(objet)} ${agree("optimisé", objet)}`;
}

/**
 * "X peu adj" → "X plus adj"
 * Ex : "Interface peu intuitive" → "Interface plus intuitive"
 */
function formatPeuAdj(objet, adj) {
  return `${cap(objet)} plus ${adj.toLowerCase().trim()}`;
}

/* =========================================================
   ÉTAPE 5 — FORMATEUR FINAL (nettoyage)
   ========================================================= */

export function formatObjectiveLabel(text) {
  if (!text) return text ?? "";
  return text
    .replace(/\(e\)s\b/g, "s")
    .replace(/\(e\)\b/g, "")
    .replace(/\(s\)\b/g, "s")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/* =========================================================
   ÉTAPE 6 — MARQUEURS POSITIFS (labels à conserver)
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
  "clarifié", "clarifiée", "clarifiés", "clarifiées",
  "simplifié", "simplifiée", "simplifiés", "simplifiées",
  "modernisé", "modernisée",
  "résolu", "résolue", "résolus", "résolues",
  "rationalisé", "rationalisée",
  "unifié", "unifiée",
];

function soundsPositive(label) {
  if (!label) return false;
  if (/^(?:manque|absence|faible|insuffisant|mauvais|baisse|non|pas|peu|aucun|déficit|perte|dégradation|problème|difficulté|inexistence|inefficacité|désorganisation)/i.test(label.trim())) return false;
  if (/\bnon\s+/i.test(label)) return false;
  if (/\btrop\s+/i.test(label)) return false;
  if (/\bpeu\s+/i.test(label)) return false;
  const lower = label.toLowerCase();
  // Séparer les marqueurs multi-mots (ex: "mis en place") des mots simples
  const multiWord  = POSITIVE_MARKERS.filter((m) => m.includes(" "));
  const singleWord = new Set(POSITIVE_MARKERS.filter((m) => !m.includes(" ")));
  // Marqueurs multi-mots : recherche en sous-chaîne (peu de faux positifs)
  if (multiWord.some((m) => lower.includes(m))) return true;
  // Marqueurs simples : mot entier uniquement (évite "irrégulières" ⊃ "régulières")
  const words = lower.split(/[\s''`-]+/);
  return words.some((w) => singleWord.has(w));
}

/* =========================================================
   ÉTAPE 7 — VALIDATEUR ANTI-FORMULATIONS MÉCANIQUES
   ========================================================= */

/**
 * Liste des mots négatifs interdits dans un objectif transformé.
 * Si l'un de ces mots est présent dans le résultat, la transformation est rejetée.
 */
const NEGATIVE_WORDS_FORBIDDEN = [
  "trop", "peu",
  "diminution", "réduction", "chute", "déclin", "baisse", "perte",
  "confus", "confuse", "confuses",
  "complexe", "complexes",
  "insuffisant", "insuffisante", "insuffisants", "insuffisantes",
  "absent", "absente", "absents", "absentes",
  "fréquent", "fréquente", "fréquents", "fréquentes",
  "faible", "faibles",
  "réduit", "réduite", "réduits", "réduites",
  "dégradé", "dégradée", "dégradés", "dégradées",
  "moins",
  "inutile", "inutiles",
  "problématique", "problématiques",
  "défaillant", "défaillante",
  "théorique", "théoriques",
  "inadéquat", "inadéquate",
  "obsolète",
  "inadapté", "inadaptée",
  "inefficace", "inefficaces",
  "lent", "lente", "lents", "lentes",
  "lourd", "lourde", "lourds", "lourdes",
  "rigide", "rigides",
  "fragmenté", "fragmentée",
  "dispersé", "dispersée",
  "opaque", "opaques",
];

/** Formulations interdites (patterns) */
const FORBIDDEN_PATTERNS = [
  /résoudre le problème/i,
  /améliorer la situation de/i,
  /réduire le manque de/i,
  /suppression de l'absence/i,
  /mettre fin [àa]/i,
  /problème traité/i,
  /cause résolue/i,
  /\(e\)/,
];

/**
 * Valide qu'un objectif transformé ne contient pas de mots négatifs
 * ni de formulations mécaniques.
 *
 * @param {string} sourceLabel
 * @param {string} targetLabel
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateObjectiveLabel(sourceLabel, targetLabel) {
  if (!targetLabel?.trim()) return { valid: false, reason: "empty" };

  if (FORBIDDEN_PATTERNS.some((p) => p.test(targetLabel))) {
    return { valid: false, reason: "forbidden_pattern" };
  }

  const lower = targetLabel.toLowerCase();
  for (const word of NEGATIVE_WORDS_FORBIDDEN) {
    const wordRe = new RegExp(`\\b${word}\\b`, "i");
    if (wordRe.test(lower)) {
      return { valid: false, reason: `contains_negative: ${word}` };
    }
  }

  if (targetLabel.trim().toLowerCase() === sourceLabel.trim().toLowerCase()) {
    return { valid: false, reason: "unchanged" };
  }

  return { valid: true };
}

/* =========================================================
   ÉTAPE 8 — TRANSFORMATION PRINCIPALE
   ========================================================= */

/**
 * Applique la règle de transformation selon la structure détectée.
 * Fonction interne — appelée par transformProblemLabelToObjectiveLabel.
 */
function _applyRule(t, analysis, nodeType) {
  const { typeNegation, objetPrincipal, structure, adjNégatif, antonymBase } = analysis;

  switch (structure) {
    case "manque_de_X":
    case "insuffisance_de_X":
      return formatManque(objetPrincipal);

    case "absence_de_X":
      return formatAbsence(objetPrincipal);

    case "faible_X":
      return formatFaible(objetPrincipal);

    case "baisse_de_X":
      return formatBaisse(objetPrincipal);

    case "perte_de_X":
      return formatPerte(objetPrincipal);

    case "X_irregulier":
      return formatIrregulier(objetPrincipal);

    case "X_non_defini":
      return formatNonDefini(objetPrincipal);

    case "X_non_formalise":
      return formatNonFormalise(objetPrincipal);

    case "X_faible":
      return formatXFaible(objetPrincipal);

    case "X_absent":
      return formatXAbsent(objetPrincipal);

    case "difficulte_a_X":
      return formatDifficulteA(objetPrincipal);

    case "isolement_de_X":
      return formatIsolement(objetPrincipal);

    case "exclusion_de_X":
      return formatExclusion(objetPrincipal);

    case "desorganisation_de_X":
      return formatDesorganisation(objetPrincipal);

    case "meconnaissance_de_X":
      return formatMeconnaissance(objetPrincipal);

    case "desinformation":
      return "Information fiable diffusée";

    case "non_X":
      return formatNonX(objetPrincipal);

    // ── Nouveaux cas sémantiques ──────────────────────────────────────────────
    case "X_adj_antonym":
      return formatAdjAntonym(objetPrincipal, antonymBase);

    case "X_trop_adj":
      return formatTropAdj(objetPrincipal, adjNégatif);

    case "X_peu_adj":
      return formatPeuAdj(objetPrincipal, adjNégatif);

    // ── Neutre : label peut-être déjà positif, ou non reconnu ────────────────
    case "neutral":
    default:
      if (soundsPositive(t)) return t;
      // Repli prudent : utiliser le nom tête + participe selon nodeType
      if (nodeType === "causes")        return formatFaible(objetPrincipal);
      if (nodeType === "consequences")  return `${cap(objetPrincipal)} ${agree("amélioré", objetPrincipal)}`;
      return `${cap(objetPrincipal)} ${agree("assuré", objetPrincipal)}`;
  }
}

/**
 * Transforme une étiquette négative en objectif positif opérationnel.
 * Inclut un mécanisme de retry si la validation échoue.
 *
 * @param {string} label
 * @param {"problem"|"causes"|"consequences"} nodeType
 * @returns {string}
 */
export function transformProblemLabelToObjectiveLabel(label, nodeType) {
  if (!label?.trim()) return label ?? "";
  const t = label.trim();

  // Court-circuit : label déjà formulé positivement → conserver tel quel
  if (soundsPositive(t)) return t;

  const analysis = analyzeProblemLabel(t);

  // Tentative principale
  let result = formatObjectiveLabel(_applyRule(t, analysis, nodeType));

  // Si la validation échoue, tentative de repli sémantique
  if (!validateObjectiveLabel(t, result).valid) {
    const objet = analysis.objetPrincipal || t;
    const fallback =
      nodeType === "causes"       ? formatFaible(objet) :
      nodeType === "consequences" ? `${cap(objet)} ${agree("amélioré", objet)}` :
                                    formatManque(objet);
    const fallbackFormatted = formatObjectiveLabel(fallback);
    // On accepte le repli même imparfait (sera marqué to_review)
    if (fallbackFormatted !== result) result = fallbackFormatted;
  }

  return result;
}

/* =========================================================
   ÉTAPE 9 — SCORE DE VALIDATION AUTOMATIQUE
   ========================================================= */

/**
 * Calcule un score de confiance (0–3) pour la transformation.
 * score < 2 → statut "to_review"
 */
function computeValidationScore(sourceLabel, analysis, transformedLabel) {
  let score = 0;

  // +1 : passe le validateur anti-mécanique
  const v = validateObjectiveLabel(sourceLabel, transformedLabel);
  if (v.valid) score += 1;

  // +1 : une transformation reconnue a été appliquée (pas de repli neutre)
  if (analysis.typeNegation !== null && analysis.structure !== "neutral") score += 1;

  // +1 : le label transformé est différent du source
  if (transformedLabel.trim().toLowerCase() !== sourceLabel.trim().toLowerCase()) score += 1;

  return score;
}

/* =========================================================
   ÉTAPE 10 — TYPAGE SÉMANTIQUE FIN
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

function computeSemanticType(postIt, problemPostIts, problemConns) {
  if (postIt.category === "problem")      return "end";
  if (postIt.category === "consequences") return "end";

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
   ÉTAPE 11 — GÉNÉRATION COMPLÈTE DE L'ARBRE À OBJECTIFS
   ========================================================= */

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
      sourceProblemNodeId: p.id,
      sourceLabel: p.content,
      sourceType: p.category === "problem" ? "problem" : p.category === "causes" ? "cause" : "consequence",
      content: transformedLabel,
      objectiveType,
      semanticType,
      x: p.x,
      y: p.y,
      isInTree: true,
      color: objectiveTypeToColor(objectiveType),
      validation: {
        desirable: null,
        feasible: null,
        logical: null,
        status: score < 2 ? "to_review" : "generated",
        _score: score,
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
   ÉTAPE 12 — SUITE DE TESTS INTERNES
   ========================================================= */

export function runSelfTests() {
  const TESTS = [
    // ── Tests de base ──────────────────────────────────────────────────────────
    { input: "Manque de communication interne",       type: "causes",       expected: "Communication interne assurée" },
    { input: "Informations irrégulières",              type: "causes",       expected: "Diffusion régulière de l'information assurée" },
    { input: "Rôles non définis",                      type: "causes",       expected: "Rôles et responsabilités clairement définis" },
    { input: "Faible mobilisation",                    type: "causes",       expected: "Mobilisation renforcée" },
    { input: "Baisse des cotisations",                 type: "consequences", expected: "Cotisations stabilisées et renforcées" },
    { input: "Absence de plan d'action",               type: "causes",       expected: "Plan d'action mis en place" },
    { input: "Canaux non formalisés",                  type: "causes",       expected: "Canaux formalisés" },
    { input: "Faible participation aux réunions",      type: "causes",       expected: "Participation aux réunions renforcée" },
    { input: "Manque de ressources financières",       type: "causes",       expected: "Ressources financières assurées" },
    { input: "Perte de confiance dans l'association",  type: "consequences", expected: "Confiance dans l'association préservée et renforcée" },
    { input: "Faible visibilité de l'association",     type: "consequences", expected: "Visibilité de l'association renforcée" },
    // ── Labels déjà positifs ──────────────────────────────────────────────────
    { input: "Communication renforcée",                type: "causes",       expected: "Communication renforcée" },
    { input: "Dispositif de suivi mis en place",       type: "causes",       expected: "Dispositif de suivi mis en place" },
    // ── Nouveaux cas sémantiques (antonymie) ─────────────────────────────────
    { input: "Formation trop théorique",               type: "causes",       expected: "Formation plus pratique" },
    { input: "Parcours utilisateur confus",            type: "causes",       expected: "Parcours utilisateur clarifié" },
    { input: "Processus trop complexe",                type: "causes",       expected: "Processus plus simple" },
    { input: "Interface peu intuitive",                type: "causes",       expected: "Interface plus intuitive" },
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

/** Alias interne */
function cap(str) {
  if (!str) return str ?? "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

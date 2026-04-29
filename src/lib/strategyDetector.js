/**
 * strategyDetector.js — Identification automatique des stratégies
 *
 * Une stratégie = une chaîne ordonnée de nœuds allant des feuilles-moyens
 * jusqu'aux fins (finalités terminales), en passant par l'objectif central.
 *
 * Algorithme :
 *  1. Construire les adjacences successeurs / prédécesseurs
 *  2. Trouver les feuilles (moyens sans prédécesseur) et les terminaux (pas de successeur)
 *  3. DFS de chaque feuille vers chaque terminal
 *  4. Scorer chaque chaîne : impact (nb de fins) / longueur
 *  5. Sélectionner les N meilleures chaînes diversifiées (Jaccard < 0.65)
 *  6. Attribuer une couleur unique à chaque stratégie sélectionnée
 */

/* ─── Palette des stratégies (distincte de COLOR_PALETTE des post-its) ──── */
export const STRATEGY_COLORS = [
  { id: "s1", bg: "#7c3aed", border: "#4c1d95", text: "#ffffff", label: "Stratégie 1" },
  { id: "s2", bg: "#ea580c", border: "#7c2d12", text: "#ffffff", label: "Stratégie 2" },
  { id: "s3", bg: "#0891b2", border: "#164e63", text: "#ffffff", label: "Stratégie 3" },
];

/* ─── Limite de sécurité pour éviter les explosions combinatoires ────────── */
const MAX_PATHS = 120;
const MAX_DEPTH = 25;

/* ─── Construction des adjacences ────────────────────────────────────────── */
function buildAdjacency(nodes, connections) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const successors   = {};
  const predecessors = {};
  for (const n of nodes) {
    successors[n.id]   = [];
    predecessors[n.id] = [];
  }
  for (const c of connections) {
    if (nodeIds.has(c.fromId) && nodeIds.has(c.toId)) {
      successors[c.fromId].push(c.toId);
      predecessors[c.toId].push(c.fromId);
    }
  }
  return { successors, predecessors };
}

/* ─── DFS : trouve toutes les chaînes simples de startId aux terminaux ───── */
function findAllPaths(startId, terminalIds, successors) {
  const paths = [];
  const visited = new Set();

  function dfs(nodeId, currentPath) {
    if (visited.has(nodeId) || currentPath.length > MAX_DEPTH) return;
    if (paths.length >= MAX_PATHS) return;

    visited.add(nodeId);
    currentPath.push(nodeId);

    const nexts = successors[nodeId] || [];
    if (terminalIds.has(nodeId) || nexts.length === 0) {
      // Inclure la chaîne uniquement si elle contient au moins un nœud terminal
      if (terminalIds.has(nodeId)) {
        paths.push([...currentPath]);
      }
    } else {
      for (const next of nexts) {
        dfs(next, currentPath);
        if (paths.length >= MAX_PATHS) break;
      }
    }

    currentPath.pop();
    visited.delete(nodeId);
  }

  dfs(startId, []);
  return paths;
}

/* ─── Score d'une chaîne ─────────────────────────────────────────────────── */
function scoreChain(path, endsIds, validatedIds) {
  const endsCovered = path.filter((id) => endsIds.has(id)).length;
  const validated   = path.filter((id) => validatedIds.has(id)).length;
  const length      = path.length;
  if (length === 0) return { impact: 0, length: 0, score: 0 };

  // impact : fins couvertes (principal) + bonus validation (secondaire)
  const impact = endsCovered;
  const score  = (endsCovered / length) + (validated / length) * 0.1;
  return { impact, length, score: +score.toFixed(4) };
}

/* ─── Similarité de Jaccard entre deux ensembles ─────────────────────────── */
function jaccardOverlap(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  const intersect = [...a].filter((x) => b.has(x)).length;
  const union     = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect / union;
}

/* ─── Point d'entrée ─────────────────────────────────────────────────────── */
/**
 * Détecte, score et sélectionne les meilleures stratégies dans l'arbre à objectifs.
 *
 * @param {Array} nodes        — objectiveNodes
 * @param {Array} connections  — objectiveConnections
 * @param {number} maxCount    — nombre max de stratégies (défaut 3)
 * @returns {Strategy[]}
 *
 * Chaque Strategy :
 * {
 *   id: string,
 *   nodes: string[],   // IDs ordonnés feuille → terminal
 *   score: number,
 *   impact: number,    // nb de fins couvertes
 *   length: number,
 *   color: { id, bg, border, text, label }
 * }
 */
export function detectStrategies(nodes, connections, maxCount = 3) {
  if (!nodes?.length) return [];

  const { successors, predecessors } = buildAdjacency(nodes, connections);

  // Nœuds ends
  const endsIds = new Set(
    nodes.filter((n) => n.objectiveType === "ends").map((n) => n.id)
  );

  // Nœuds validés (bonus de score)
  const validatedIds = new Set(
    nodes.filter((n) => n.validation?.status === "validated").map((n) => n.id)
  );

  // Feuilles = nœuds means sans prédécesseur
  const leaves = nodes.filter(
    (n) => n.objectiveType === "means" && (predecessors[n.id]?.length ?? 0) === 0
  );

  // Fallback : si aucune feuille, prendre tous les means
  const startNodes = leaves.length > 0
    ? leaves
    : nodes.filter((n) => n.objectiveType === "means");

  // Terminaux = nœuds sans successeur (bouts de chaîne)
  const terminalIds = new Set(
    nodes.filter((n) => (successors[n.id]?.length ?? 0) === 0).map((n) => n.id)
  );

  // Si aucun terminal ou aucun départ, on ne peut rien détecter
  if (startNodes.length === 0 || terminalIds.size === 0) return [];

  // Construire toutes les chaînes
  const allCandidates = [];
  for (const leaf of startNodes) {
    const paths = findAllPaths(leaf.id, terminalIds, successors);
    for (const path of paths) {
      const { impact, length, score } = scoreChain(path, endsIds, validatedIds);
      allCandidates.push({ nodes: path, impact, length, score });
    }
  }

  if (allCandidates.length === 0) {
    // Fallback : stratégie unique = tous les nœuds connectés au central
    const central = nodes.find((n) => n.objectiveType === "central");
    if (central) {
      const allIds = nodes.map((n) => n.id);
      return [{
        id: "strategy-1",
        nodes: allIds,
        score: 0,
        impact: endsIds.size,
        length: allIds.length,
        color: STRATEGY_COLORS[0],
      }];
    }
    return [];
  }

  // Trier : score décroissant, puis impact décroissant
  allCandidates.sort((a, b) => b.score - a.score || b.impact - a.impact);

  // Sélectionner les N meilleures chaînes diversifiées
  const selected = [];
  for (const candidate of allCandidates) {
    if (selected.length >= maxCount) break;
    const tooSimilar = selected.some(
      (s) => jaccardOverlap(s.nodes, candidate.nodes) > 0.65
    );
    if (!tooSimilar) selected.push(candidate);
  }

  return selected.map((s, i) => ({
    id: `strategy-${i + 1}`,
    nodes: s.nodes,
    score: s.score,
    impact: s.impact,
    length: s.length,
    color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
  }));
}

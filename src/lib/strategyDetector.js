/**
 * strategyDetector.js — Identification automatique des stratégies
 *
 * Approche : graphe NON-DIRIGÉ.
 * Peu importe le sens des connexions (central→means ou means→central),
 * on cherche tous les chemins simples reliant un nœud "means" à un nœud "ends".
 * Le nœud "central" doit obligatoirement être traversé pour que la chaîne soit valide.
 *
 * Score : (fins_couvertes / longueur) + bonus_validation × 0.1
 * Diversité : rejet si similarité Jaccard > 0.65 avec une stratégie déjà choisie
 */

/* ─── Palette ────────────────────────────────────────────────────────────── */
export const STRATEGY_COLORS = [
  { id: "s1", bg: "#7c3aed", border: "#4c1d95", text: "#ffffff", label: "Stratégie 1" },
  { id: "s2", bg: "#ea580c", border: "#7c2d12", text: "#ffffff", label: "Stratégie 2" },
  { id: "s3", bg: "#0891b2", border: "#164e63", text: "#ffffff", label: "Stratégie 3" },
];

const MAX_PATHS = 200;
const MAX_DEPTH = 30;

/* ─── Graphe non-dirigé ──────────────────────────────────────────────────── */
function buildUndirectedAdj(nodes, connections) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const c of connections) {
    if (nodeIds.has(c.fromId) && nodeIds.has(c.toId)) {
      adj[c.fromId].push(c.toId);
      adj[c.toId].push(c.fromId);   // ← les deux sens
    }
  }
  return adj;
}

/* ─── DFS non-dirigé : de startId vers n'importe quel ends ──────────────── */
/**
 * Trouve tous les chemins simples allant de startId à un nœud ends.
 * Contrainte : le chemin doit contenir le nœud central (objectif obligatoire).
 */
function findPathsToEnds(startId, endsIds, centralId, undirectedAdj) {
  const paths = [];
  const visited = new Set();

  function dfs(nodeId, currentPath) {
    if (visited.has(nodeId) || currentPath.length > MAX_DEPTH) return;
    if (paths.length >= MAX_PATHS) return;

    visited.add(nodeId);
    currentPath.push(nodeId);

    if (endsIds.has(nodeId)) {
      // Chemin valide uniquement s'il passe par le central
      if (!centralId || currentPath.includes(centralId)) {
        paths.push([...currentPath]);
      }
      // Ne pas continuer après un ends
    } else {
      for (const next of (undirectedAdj[nodeId] || [])) {
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

/* ─── Score ──────────────────────────────────────────────────────────────── */
function scoreChain(path, endsIds, validatedIds) {
  const endsCovered = path.filter((id) => endsIds.has(id)).length;
  const validated   = path.filter((id) => validatedIds.has(id)).length;
  const length = path.length;
  if (length === 0) return { impact: 0, length: 0, score: 0 };
  const score = (endsCovered / length) + (validated / length) * 0.1;
  return { impact: endsCovered, length, score: +score.toFixed(4) };
}

/* ─── Jaccard ────────────────────────────────────────────────────────────── */
function jaccardOverlap(a, b) {
  const sa = new Set(a), sb = new Set(b);
  const intersect = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersect / union;
}

/* ─── Point d'entrée ─────────────────────────────────────────────────────── */
/**
 * @param {Array} nodes        — objectiveNodes
 * @param {Array} connections  — objectiveConnections
 * @param {number} maxCount    — nb max de stratégies (défaut 3)
 * @returns {Strategy[]}
 */
export function detectStrategies(nodes, connections, maxCount = 3) {
  if (!nodes?.length) return [];

  const undirectedAdj = buildUndirectedAdj(nodes, connections);

  const endsIds      = new Set(nodes.filter((n) => n.objectiveType === "ends").map((n) => n.id));
  const validatedIds = new Set(nodes.filter((n) => n.validation?.status === "validated").map((n) => n.id));
  const meansNodes   = nodes.filter((n) => n.objectiveType === "means");
  const centralNode  = nodes.find((n) => n.objectiveType === "central");
  const centralId    = centralNode?.id ?? null;

  // Si pas de fins ou pas de moyens → fallback immédiat
  if (meansNodes.length === 0 || endsIds.size === 0) {
    return centralNode ? [{
      id: "strategy-1",
      nodes: nodes.map((n) => n.id),
      score: 0, impact: 0, length: nodes.length,
      color: STRATEGY_COLORS[0],
    }] : [];
  }

  // Trouver toutes les chaînes means → ends
  const allCandidates = [];
  for (const m of meansNodes) {
    const paths = findPathsToEnds(m.id, endsIds, centralId, undirectedAdj);
    for (const path of paths) {
      const { impact, length, score } = scoreChain(path, endsIds, validatedIds);
      allCandidates.push({ nodes: path, impact, length, score });
    }
  }

  // Fallback : pas de chemin complet → une seule stratégie = tous les nœuds
  if (allCandidates.length === 0) {
    return [{
      id: "strategy-1",
      nodes: nodes.map((n) => n.id),
      score: 0,
      impact: endsIds.size,
      length: nodes.length,
      color: STRATEGY_COLORS[0],
    }];
  }

  // Trier + sélectionner N chaînes diversifiées
  allCandidates.sort((a, b) => b.score - a.score || b.impact - a.impact);

  const selected = [];
  for (const c of allCandidates) {
    if (selected.length >= maxCount) break;
    if (!selected.some((s) => jaccardOverlap(s.nodes, c.nodes) > 0.65)) {
      selected.push(c);
    }
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

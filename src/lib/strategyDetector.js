/**
 * strategyDetector.js — v3 (sous-arbre complet)
 *
 * Approche :
 *   1. Pour chaque nœud "means", trouver le cluster de moyens connectés
 *      (BFS sur les nœuds means uniquement, sans traverser le central).
 *   2. Vérifier que le cluster atteint le nœud central.
 *   3. Collecter TOUS les ends accessibles depuis le central (BFS complet
 *      à travers les ends chaînés).
 *   4. Stratégie = cluster_means ∪ {central} ∪ all_reachable_ends
 *
 * La diversité est calculée sur la partie MEANS uniquement (car le central
 * et les ends sont partagés entre toutes les stratégies).
 *
 * Score : (ends_couverts / total_ends) + (validés / longueur) × 0.2
 */

/* ─── Palette ────────────────────────────────────────────────────────────── */
export const STRATEGY_COLORS = [
  { id: "s1", bg: "#7c3aed", border: "#4c1d95", text: "#ffffff", label: "Stratégie 1" },
  { id: "s2", bg: "#ea580c", border: "#7c2d12", text: "#ffffff", label: "Stratégie 2" },
  { id: "s3", bg: "#0891b2", border: "#164e63", text: "#ffffff", label: "Stratégie 3" },
];

/* ─── Adjacence non-dirigée ──────────────────────────────────────────────── */
function buildUndirectedAdj(nodes, connections) {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const c of connections) {
    if (nodeIds.has(c.fromId) && nodeIds.has(c.toId)) {
      adj[c.fromId].push(c.toId);
      adj[c.toId].push(c.fromId);
    }
  }
  return adj;
}

/**
 * Trouve le cluster de nœuds "means" connectés à startId,
 * sans jamais traverser le nœud central ni les ends.
 * Retourne l'ensemble des IDs de means du cluster.
 */
function getMeansCluster(startId, adj, meansSet) {
  const cluster = new Set();
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (cluster.has(id)) continue;
    if (!meansSet.has(id)) continue; // ne traverser que les means
    cluster.add(id);
    for (const neighbor of (adj[id] || [])) {
      if (!cluster.has(neighbor) && meansSet.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  return cluster;
}

/**
 * Collecte TOUS les ends accessibles depuis le central,
 * en traversant les ends chaînés (ends → ends).
 * Ne remonte pas vers les means.
 */
function getAllReachableEnds(centralId, adj, endsSet) {
  const found = new Set();
  const queue = [centralId];
  const visited = new Set([centralId]);
  while (queue.length > 0) {
    const id = queue.shift();
    for (const neighbor of (adj[id] || [])) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      if (endsSet.has(neighbor)) {
        found.add(neighbor);
        queue.push(neighbor); // continuer depuis cet end (ends chaînés)
      }
    }
  }
  return found;
}

/* ─── Score ──────────────────────────────────────────────────────────────── */
/**
 * Score basé sur la qualité des moyens, pas sur les fins (qui sont toujours 100%).
 * - faisabilité (50%) : ratio moyens validés / taille du cluster
 * - couverture  (30%) : ratio taille du cluster / total des moyens
 * - impact fixe (20%) : toutes les stratégies couvrent les mêmes fins
 * - tie-breaker       : hash déterministe sur les IDs du cluster
 */
function scoreStrategy(meansCluster, allEnds, validatedIds, totalEnds, totalMeans) {
  const clusterSize  = meansCluster.size;
  const validated    = [...meansCluster].filter((id) => validatedIds.has(id)).length;
  const feasibility  = clusterSize > 0 ? validated / clusterSize : 0;
  const coverage     = totalMeans  > 0 ? clusterSize / totalMeans : 0;
  const endsCovered  = allEnds.size;
  // Tie-breaker déterministe : évite les égalités parfaites entre clusters
  const idHash = [...meansCluster].sort().join("").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const tieBreaker = (idHash % 1000) / 100000; // 0.00000 – 0.00999
  const score = feasibility * 0.5 + coverage * 0.3 + 0.2 + tieBreaker;
  return { endsCovered, length: clusterSize + 1 + endsCovered, score: +score.toFixed(4) };
}

/* ─── Diversité Jaccard sur la partie MEANS ─────────────────────────────── */
function jaccardMeans(clusterA, clusterB) {
  const sa = clusterA instanceof Set ? clusterA : new Set(clusterA);
  const sb = clusterB instanceof Set ? clusterB : new Set(clusterB);
  const intersect = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 1 : intersect / union;
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

  const adj = buildUndirectedAdj(nodes, connections);

  const endsSet      = new Set(nodes.filter((n) => n.objectiveType === "ends").map((n) => n.id));
  const meansSet     = new Set(nodes.filter((n) => n.objectiveType === "means").map((n) => n.id));
  const validatedIds = new Set(nodes.filter((n) => n.validation?.status === "validated").map((n) => n.id));
  const centralNode  = nodes.find((n) => n.objectiveType === "central");
  const centralId    = centralNode?.id ?? null;

  // Fallback : arbre incomplet
  if (meansSet.size === 0 || endsSet.size === 0) {
    return centralNode ? [{
      id: "strategy-1",
      nodes: nodes.map((n) => n.id),
      score: 0, impact: endsSet.size, length: nodes.length,
      color: STRATEGY_COLORS[0],
    }] : [];
  }

  // Collecter tous les ends accessibles depuis le central
  const allReachableEnds = centralId
    ? getAllReachableEnds(centralId, adj, endsSet)
    : endsSet;

  // Si aucun end n'est relié au central, fallback
  if (allReachableEnds.size === 0) {
    return [{
      id: "strategy-1",
      nodes: nodes.map((n) => n.id),
      score: 0, impact: endsSet.size, length: nodes.length,
      color: STRATEGY_COLORS[0],
    }];
  }

  // Trouver les clusters de means
  const processedMeans = new Set();
  const allCandidates = [];

  for (const meansId of meansSet) {
    if (processedMeans.has(meansId)) continue;

    const cluster = getMeansCluster(meansId, adj, meansSet);
    // Marquer tous les membres du cluster comme traités
    for (const id of cluster) processedMeans.add(id);

    // Vérifier que le cluster est connecté au central
    const connectsToCentral = centralId
      ? [...cluster].some((id) => (adj[id] || []).includes(centralId))
      : true;

    if (!connectsToCentral) continue;

    const { endsCovered, length, score } = scoreStrategy(
      cluster, allReachableEnds, validatedIds, endsSet.size, meansSet.size
    );

    const strategyNodes = [
      ...cluster,
      ...(centralId ? [centralId] : []),
      ...allReachableEnds,
    ];

    allCandidates.push({ cluster, nodes: strategyNodes, endsCovered, length, score });
  }

  // Fallback : aucun cluster valide trouvé
  if (allCandidates.length === 0) {
    return [{
      id: "strategy-1",
      nodes: nodes.map((n) => n.id),
      score: 0, impact: endsSet.size, length: nodes.length,
      color: STRATEGY_COLORS[0],
    }];
  }

  // Trier par score décroissant
  allCandidates.sort((a, b) => b.score - a.score || b.endsCovered - a.endsCovered);

  // Sélectionner N stratégies diversifiées (diversité sur les means uniquement)
  const selected = [];
  for (const c of allCandidates) {
    if (selected.length >= maxCount) break;
    const tooSimilar = selected.some(
      (s) => jaccardMeans(s.cluster, c.cluster) > 0.65
    );
    if (!tooSimilar) selected.push(c);
  }

  return selected.map((s, i) => ({
    id: `strategy-${i + 1}`,
    nodes: s.nodes,
    score: s.score,
    impact: s.endsCovered,
    length: s.length,
    color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
  }));
}

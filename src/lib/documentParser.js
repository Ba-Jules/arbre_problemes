/**
 * documentParser.js — Extraction client-side de texte depuis des documents
 *
 * Toutes les bibliothèques lourdes sont chargées en lazy (import dynamique)
 * pour ne pas impacter le chargement initial de l'application.
 *
 * Exports publics :
 *   parseUploadedFile(file)         → Promise<string>  texte brut extrait
 *   extractTextFromPdf(file)        → Promise<string>
 *   extractTextFromDocx(file)       → Promise<string>
 *   extractTextFromExcel(file)      → Promise<string>
 *   extractTextFromCsv(file)        → Promise<string>
 *   buildWorkshopContext(params)    → WorkshopContext
 *
 * Contraintes :
 *   - aucun envoi automatique vers un service tiers
 *   - aucun log du contenu sensible
 *   - fallback si extraction échoue
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. EXTRACTION PDF
// ─────────────────────────────────────────────────────────────────────────────

let pdfjsWorkerConfigured = false;

/**
 * Extrait le texte d'un fichier PDF côté navigateur.
 * Limite à 50 pages pour les documents très longs.
 */
export async function extractTextFromPdf(file) {
  // Import dynamique : pdfjs + URL worker chargés uniquement à la demande.
  // L'import ?url en top-level causait un crash au démarrage sur Safari/iOS
  // (new URL(…, import.meta.url) évalué avant que le module soit prêt).
  const [{ getDocument, GlobalWorkerOptions }, { default: pdfjsWorkerUrl }] =
    await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);

  if (!pdfjsWorkerConfigured) {
    GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
    pdfjsWorkerConfigured = true;
  }

  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: buffer, useWorkerFetch: false });
  const pdf = await loadingTask.promise;

  const pages = [];
  const pageLimit = Math.min(pdf.numPages, 50);

  for (let i = 1; i <= pageLimit; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => item.str)
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pages.push(pageText);
  }

  const result = pages.join('\n\n');
  if (pdf.numPages > 50) {
    return result + `\n\n[… ${pdf.numPages - 50} page(s) supplémentaire(s) non extraite(s)]`;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXTRACTION DOCX (Word)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait le texte brut d'un fichier .docx via mammoth.
 */
export async function extractTextFromDocx(file) {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  // extractRawText ignore les styles et ne retourne que le texte pur
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result.value || '').replace(/\n{3,}/g, '\n\n').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EXTRACTION EXCEL (.xlsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait le contenu d'un fichier Excel en texte tabulaire par feuille.
 */
export async function extractTextFromExcel(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellText: true });

  const sections = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { skipHidden: true, blankrows: false });
    const cleaned = csv
      .split('\n')
      .filter((line) => line.replace(/,/g, '').trim())
      .join('\n');
    if (cleaned) {
      sections.push(`[Feuille : ${sheetName}]\n${cleaned}`);
    }
  }

  return sections.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXTRACTION CSV
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lit un fichier CSV comme texte brut (natif, aucune dépendance).
 */
export async function extractTextFromCsv(file) {
  const text = await file.text();
  return text
    .split('\n')
    .filter((line) => line.trim())
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DISPATCH PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const MIME_MAP = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

function detectFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.doc')) return 'docx';
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.txt')) return 'txt';
  return MIME_MAP[file.type] || null;
}

/**
 * Point d'entrée unifié : détecte le format et extrait le texte.
 * @param {File} file
 * @returns {Promise<string>} Texte extrait
 * @throws {Error} Si le format n'est pas supporté ou si l'extraction échoue
 */
export async function parseUploadedFile(file) {
  const type = detectFileType(file);

  switch (type) {
    case 'pdf':  return extractTextFromPdf(file);
    case 'docx': return extractTextFromDocx(file);
    case 'xlsx': return extractTextFromExcel(file);
    case 'csv':  return extractTextFromCsv(file);
    case 'txt':  return file.text();
    default:
      throw new Error(
        `Format non pris en charge. Formats acceptés : PDF, DOCX, XLSX, CSV, TXT.`
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CONSTRUCTION DU CONTEXTE ATELIER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Agrège tous les éléments de contexte en un objet structuré
 * utilisable par les composants de l'application et par une future IA.
 *
 * @param {{
 *   projectName: string,
 *   theme: string,
 *   manualContext: string,
 *   sessionObjective: string,
 *   uploadedDocuments: Array<{name, size, type, status, extractedText, errorMessage}>
 * }} params
 * @returns {WorkshopContext}
 */
export function buildWorkshopContext({
  projectName = '',
  theme = '',
  manualContext = '',
  sessionObjective = '',
  uploadedDocuments = [],
}) {
  const extractedDocs = uploadedDocuments.filter(
    (d) => d.status === 'extracted' && d.extractedText
  );

  const docsSection =
    extractedDocs.length > 0
      ? extractedDocs
          .map((d) => `=== Document : ${d.name} ===\n${d.extractedText}`)
          .join('\n\n---\n\n')
      : '';

  const parts = [
    projectName && `Projet : ${projectName}`,
    theme && `Thème : ${theme}`,
    manualContext && `Contexte :\n${manualContext}`,
    sessionObjective && `Question de départ / Objectif de séance :\n${sessionObjective}`,
    docsSection && `Documents de référence :\n\n${docsSection}`,
  ].filter(Boolean);

  return {
    projectName,
    theme,
    manualContext,
    sessionObjective,
    // Métadonnées des fichiers uniquement (pas le texte complet, pour légèreté)
    uploadedDocuments: uploadedDocuments.map((d) => ({
      name: d.name,
      size: d.size,
      type: d.type,
      status: d.status,
      errorMessage: d.errorMessage || null,
    })),
    // Texte complet agrégé pour usage IA futur
    fullContextText: parts.join('\n\n'),
    hasContent: parts.length > 0,
    documentCount: uploadedDocuments.length,
    extractedCount: extractedDocs.length,
    createdAt: new Date().toISOString(),
  };
}

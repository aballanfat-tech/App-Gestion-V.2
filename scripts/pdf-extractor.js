/**
 * PDF Extractor Module - Module Extraction Factures
 * 
 * Wrapper autour de PDF.js pour extraction texte et coordonnées XY
 * Nécessite PDF.js v3.11.174 chargé via CDN
 * 
 * @module pdf-extractor
 * @version 2.7.0
 * @requires pdf.js v3.11.174
 */

(function(window) {
  'use strict';

  /**
   * Vérifier si PDF.js est chargé et disponible
   * 
   * @returns {boolean} true si PDF.js disponible
   * @private
   */
  function isPDFjsAvailable() {
    return typeof window.pdfjsLib !== 'undefined';
  }

  /**
   * Attendre que PDF.js soit chargé
   * 
   * @param {number} [maxWait=5000] - Temps d'attente max en ms
   * @returns {Promise<boolean>} true si chargé, false si timeout
   * 
   * @example
   * const loaded = await waitForPDFjs();
   * if(loaded) {
   *   console.log("PDF.js prêt");
   * }
   */
  async function waitForPDFjs(maxWait) {
    maxWait = maxWait || 5000;
    const startTime = Date.now();
    
    while(!isPDFjsAvailable()) {
      if(Date.now() - startTime > maxWait) {
        return false;
      }
      await new Promise(function(resolve) { setTimeout(resolve, 100); });
    }
    
    return true;
  }

  /**
   * Initialiser PDF.js worker
   * Configure automatiquement le worker depuis CDN
   * 
   * @param {string} [workerSrc] - URL worker custom (optionnel)
   * 
   * @example
   * initPDFjsWorker();
   * // Utilise: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
   */
  function initPDFjsWorker(workerSrc) {
    if(!isPDFjsAvailable()) {
      console.error("PDF.js non disponible. Charger via CDN d'abord.");
      return;
    }
    
    if(!workerSrc) {
      workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  /**
   * Extraire texte complet depuis ArrayBuffer PDF
   * Concatène toutes les pages avec séparateurs
   * 
   * @param {ArrayBuffer} arrayBuffer - Données PDF binaires
   * @returns {Promise<string>} Texte complet extrait
   * 
   * @example
   * const file = event.target.files[0];
   * const arrayBuffer = await file.arrayBuffer();
   * const text = await extractPdfTextFromArrayBuffer(arrayBuffer);
   * console.log("Texte:", text);
   * 
   * @throws {Error} Si PDF.js non disponible ou PDF invalide
   */
  async function extractPdfTextFromArrayBuffer(arrayBuffer) {
    if(!isPDFjsAvailable()) {
      throw new Error("PDF.js non disponible. Initialiser d'abord.");
    }
    
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for(let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const text = content.items.map(function(it) { return it.str; }).join(" ");
      fullText += "\n\n=== PAGE " + p + " ===\n" + text;
    }
    
    return fullText.trim();
  }

  /**
   * Extraire items avec coordonnées XY depuis ArrayBuffer PDF
   * Permet détection structure tableau avec positions spatiales
   * 
   * @param {ArrayBuffer} arrayBuffer - Données PDF binaires
   * @returns {Promise<Array>} Pages [{page: number, items: [{str, x, y, w, h}, ...]}, ...]
   * 
   * @example
   * const pages = await extractPdfItemsXY(arrayBuffer);
   * pages.forEach(page => {
   *   console.log("Page", page.page, ":", page.items.length, "items");
   *   page.items.forEach(item => {
   *     console.log(`  "${item.str}" at (${item.x}, ${item.y})`);
   *   });
   * });
   * 
   * @throws {Error} Si PDF.js non disponible ou PDF invalide
   */
  async function extractPdfItemsXY(arrayBuffer) {
    if(!isPDFjsAvailable()) {
      throw new Error("PDF.js non disponible. Initialiser d'abord.");
    }
    
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];
    
    for(let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const textContent = await page.getTextContent();
      
      const items = textContent.items.map(function(it) {
        const tx = it.transform;
        return {
          str: it.str,
          x: tx[4],
          y: tx[5],
          w: it.width || 0,
          h: it.height || 0
        };
      });
      
      pages.push({ page: p, items: items });
    }
    
    return pages;
  }

  /**
   * Extraire métadonnées PDF (titre, auteur, etc.)
   * 
   * @param {ArrayBuffer} arrayBuffer - Données PDF binaires
   * @returns {Promise<Object>} Métadonnées {title, author, subject, keywords, creator, producer, creationDate, modDate}
   * 
   * @example
   * const metadata = await extractPdfMetadata(arrayBuffer);
   * console.log("Titre:", metadata.title);
   * console.log("Auteur:", metadata.author);
   * 
   * @throws {Error} Si PDF.js non disponible ou PDF invalide
   */
  async function extractPdfMetadata(arrayBuffer) {
    if(!isPDFjsAvailable()) {
      throw new Error("PDF.js non disponible. Initialiser d'abord.");
    }
    
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const metadata = await pdf.getMetadata();
    
    return {
      title: metadata.info.Title || null,
      author: metadata.info.Author || null,
      subject: metadata.info.Subject || null,
      keywords: metadata.info.Keywords || null,
      creator: metadata.info.Creator || null,
      producer: metadata.info.Producer || null,
      creationDate: metadata.info.CreationDate || null,
      modDate: metadata.info.ModDate || null
    };
  }

  /**
   * Obtenir nombre de pages PDF
   * 
   * @param {ArrayBuffer} arrayBuffer - Données PDF binaires
   * @returns {Promise<number>} Nombre de pages
   * 
   * @example
   * const numPages = await getPdfPageCount(arrayBuffer);
   * console.log("PDF contient", numPages, "pages");
   * 
   * @throws {Error} Si PDF.js non disponible ou PDF invalide
   */
  async function getPdfPageCount(arrayBuffer) {
    if(!isPDFjsAvailable()) {
      throw new Error("PDF.js non disponible. Initialiser d'abord.");
    }
    
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return pdf.numPages;
  }

  /**
   * Valider si ArrayBuffer est un PDF valide
   * 
   * @param {ArrayBuffer} arrayBuffer - Données à valider
   * @returns {Promise<boolean>} true si PDF valide
   * 
   * @example
   * const isValid = await validatePDF(arrayBuffer);
   * if(isValid) {
   *   console.log("PDF valide");
   * } else {
   *   console.error("Fichier corrompu ou non-PDF");
   * }
   */
  async function validatePDF(arrayBuffer) {
    if(!isPDFjsAvailable()) {
      return false;
    }
    
    try {
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      return pdf.numPages > 0;
    } catch(e) {
      console.error("PDF invalide:", e);
      return false;
    }
  }

  /**
   * Extraire texte depuis File (avec progress callback)
   * Wrapper pratique pour <input type="file">
   * 
   * @param {File} file - Fichier PDF depuis input
   * @param {Function} [onProgress] - Callback progression (percent: number)
   * @returns {Promise<string>} Texte complet extrait
   * 
   * @example
   * const file = document.getElementById("fileInput").files[0];
   * const text = await extractTextFromFile(file, (percent) => {
   *   console.log("Progression:", percent, "%");
   * });
   */
  async function extractTextFromFile(file, onProgress) {
    if(!file || !file.type.includes("pdf")) {
      throw new Error("Fichier non-PDF fourni");
    }
    
    if(onProgress) onProgress(10);
    
    const arrayBuffer = await file.arrayBuffer();
    
    if(onProgress) onProgress(30);
    
    const text = await extractPdfTextFromArrayBuffer(arrayBuffer);
    
    if(onProgress) onProgress(100);
    
    return text;
  }

  /**
   * Extraire items XY depuis File (avec progress callback)
   * 
   * @param {File} file - Fichier PDF depuis input
   * @param {Function} [onProgress] - Callback progression (percent: number)
   * @returns {Promise<Array>} Pages avec items XY
   * 
   * @example
   * const pages = await extractItemsXYFromFile(file, (percent) => {
   *   document.getElementById("progress").value = percent;
   * });
   */
  async function extractItemsXYFromFile(file, onProgress) {
    if(!file || !file.type.includes("pdf")) {
      throw new Error("Fichier non-PDF fourni");
    }
    
    if(onProgress) onProgress(10);
    
    const arrayBuffer = await file.arrayBuffer();
    
    if(onProgress) onProgress(30);
    
    const pages = await extractPdfItemsXY(arrayBuffer);
    
    if(onProgress) onProgress(100);
    
    return pages;
  }

  // Export API publique
  window.PDFExtractor = {
    // Init
    isPDFjsAvailable: isPDFjsAvailable,
    waitForPDFjs: waitForPDFjs,
    initPDFjsWorker: initPDFjsWorker,
    
    // Extraction ArrayBuffer
    extractPdfTextFromArrayBuffer: extractPdfTextFromArrayBuffer,
    extractPdfItemsXY: extractPdfItemsXY,
    extractPdfMetadata: extractPdfMetadata,
    getPdfPageCount: getPdfPageCount,
    validatePDF: validatePDF,
    
    // Extraction File (pratique)
    extractTextFromFile: extractTextFromFile,
    extractItemsXYFromFile: extractItemsXYFromFile
  };

})(window);

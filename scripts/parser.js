/**
 * Parser Module - Module Extraction Factures
 * 
 * Extraction automatique de données depuis texte OCR et positions XY PDF
 * - Parser regex pour champs principaux (numéro, date, client, totaux)
 * - Table detector v2 avec fallback headerless
 * - Extraction services et débours
 * 
 * @module parser
 * @version 2.7.0
 */

(function(window) {
  'use strict';

  /* ===========================
     UTILITAIRES
     =========================== */

  /**
   * Normaliser espaces multiples
   * 
   * @param {string} s - Chaîne à normaliser
   * @returns {string} Chaîne avec espaces simples
   * 
   * @example
   * normalizeSpaces("Hello    world"); // "Hello world"
   */
  function normalizeSpaces(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  /**
   * Normaliser un nombre depuis chaîne française (virgule)
   * 
   * @param {string|number} str - Nombre à normaliser
   * @returns {number|null} Nombre ou null si invalide
   * 
   * @example
   * normalizeNumber("1 250,50");  // 1250.50
   * normalizeNumber("1250.50");   // 1250.50
   */
  function normalizeNumber(str) {
    if(str === null || str === undefined) return null;
    const n = String(str).replace(/\s/g, "").replace(",", ".");
    const val = parseFloat(n.replace(/[^0-9.]/g, ""));
    return Number.isFinite(val) ? val : null;
  }

  /**
   * Convertir valeur en nombre safe (null si invalide)
   * 
   * @param {*} v - Valeur à convertir
   * @returns {number|null} Nombre ou null
   */
  function safeNum(v) {
    const n = normalizeNumber(v);
    return (n === null || n === undefined || Number.isNaN(n)) ? null : n;
  }

  /**
   * Parser date française (DD/MM/YYYY ou DD mois YYYY)
   * 
   * @param {string} dateStr - Date à parser
   * @returns {string|null} Date ISO (YYYY-MM-DD) ou null
   * 
   * @example
   * parseFrenchDateAny("08/02/2025");        // "2025-02-08"
   * parseFrenchDateAny("8 février 2025");    // "2025-02-08"
   */
  function parseFrenchDateAny(dateStr) {
    if(!dateStr) return null;
    const s = String(dateStr).trim();
    
    // Format numérique : DD/MM/YYYY ou DD-MM-YYYY
    const mNum = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if(mNum) {
      let d = parseInt(mNum[1], 10), mo = parseInt(mNum[2], 10), y = parseInt(mNum[3], 10);
      if(y < 100) y += 2000;
      return y.toString().padStart(4, "0") + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }
    
    // Format texte : DD mois YYYY
    const months = {
      "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
      "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
      "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12
    };
    const mTxt = s.toLowerCase().match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/);
    if(mTxt) {
      const d = parseInt(mTxt[1], 10), mo = months[mTxt[2]], y = parseInt(mTxt[3], 10);
      if(!mo) return null;
      return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }
    
    return null;
  }

  /**
   * Nettoyer nom client (retirer infos superflues)
   * 
   * @param {string} raw - Nom brut extrait
   * @returns {string|null} Nom nettoyé ou null
   * 
   * @example
   * cleanClientName("Association OVAL 74000 Annecy France"); // "Association OVAL"
   */
  function cleanClientName(raw) {
    if(!raw) return null;
    let s = normalizeSpaces(raw);
    
    // Couper aux mots-clés
    const stops = [" Conditions", " Détail", " Detail", " RIB", " IBAN", " BIC", " Titulaire", " Total", " TVA"];
    for(let i = 0; i < stops.length; i++) {
      const idx = s.indexOf(stops[i]);
      if(idx > 2) { s = s.slice(0, idx).trim(); break; }
    }
    
    // Retirer code postal + reste
    s = s.replace(/\b\d{5}\b[\s\S]*$/g, "").trim();
    
    // Retirer pays + reste
    s = s.replace(/\b(France|Belgique|Suisse|Luxembourg)\b[\s\S]*$/i, "").trim();
    
    // Retirer ponctuation finale
    s = s.replace(/[;,:-]+$/g, "").trim();
    
    // Détecter doublons (ex: "OVAL OVAL" → "OVAL")
    const parts = s.split(" ");
    if(parts.length >= 2) {
      const half = Math.floor(parts.length / 2);
      const left = parts.slice(0, half).join(" ");
      const right = parts.slice(half).join(" ");
      if(left && right && left.toLowerCase() === right.toLowerCase()) s = left;
    }
    
    return s || null;
  }

  /* ===========================
     PARSER CHAMPS PRINCIPAUX
     =========================== */

  /**
   * Parser champs principaux facture depuis texte OCR
   * Extrait : numéro, date, client, totaux HT/TVA/TTC
   * 
   * @param {string} fullText - Texte complet OCR
   * @returns {Object} Objet { fields: {...}, matches: [...], version, parsed_at }
   * 
   * @example
   * const result = parseFieldsRobust("FACTURE FACT-2025-001\n...");
   * console.log(result.fields.numero_facture); // "FACT-2025-001"
   * console.log(result.matches); // [{raw, label, value}, ...]
   */
  function parseFieldsRobust(fullText) {
    const out = {
      fields: {},
      matches: [],
      version: "parser_table_v267",
      parsed_at: new Date().toISOString()
    };
    
    const t = normalizeSpaces(fullText || "");
    
    // 1. Numéro facture
    // Formats : FACT-2025-001, AB-2025-123, Facture "FACT-2025-001"
    const mFact = t.match(/\bFacture\s+["']?\s*([A-Z]{2,6}-\d{3,4}-\d{2,}|FACT-\d{4}-\d{2,})\s*["']?/i)
                || t.match(/\b(FACT-\d{4}-\d{2,})\b/i);
    if(mFact) {
      const val = (mFact[1] || mFact[0]).replace(/Facture/i, "").replace(/["']/g, "").trim();
      out.fields.numero_facture = val;
      out.matches.push({ raw: mFact[0], label: "numero_facture", value: val });
    }
    
    // 2. Date facture
    // Formats : 08/02/2025, 8 février 2025, 08-02-2025
    const mDateTxt = t.match(/\b(\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/i);
    const mDateNum = t.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
    const rawDate = mDateTxt ? mDateTxt[1] : (mDateNum ? mDateNum[1] : null);
    if(rawDate) {
      const iso = parseFrenchDateAny(rawDate);
      if(iso) {
        out.fields.date_facture = iso;
        out.matches.push({ raw: rawDate, label: "date_facture", value: rawDate });
      }
    }
    
    // 3. Client / Destinataire
    const mDest = t.match(/Destinataire\s+([\s\S]+?)(Conditions|Détail|Detail|RIB|IBAN|BIC|Total\s*HT|Total\s*TTC)/i);
    if(mDest) {
      const rawBlock = normalizeSpaces(mDest[1] || "");
      const clean = cleanClientName(rawBlock);
      if(clean) {
        out.fields.client_nom = clean;
        out.matches.push({ raw: rawBlock, label: "client_nom", value: clean });
      }
    }
    
    // 4. Totaux HT / TVA / TTC
    const mTotals = t.match(/Total\s*HT[\s:]+([0-9\s.,]+)\s*€[\s\S]{0,80}?TVA[\s\S]{0,50}?([0-9\s.,]+)\s*€[\s\S]{0,80}?Total\s*TTC[\s:]+([0-9\s.,]+)\s*€/i);
    if(mTotals) {
      out.fields.total_ht = safeNum(mTotals[1]);
      out.fields.total_tva = safeNum(mTotals[2]);
      out.fields.total_ttc = safeNum(mTotals[3]);
      out.matches.push({ raw: mTotals[0], label: "total_ht", value: mTotals[1] });
      out.matches.push({ raw: mTotals[0], label: "total_tva", value: mTotals[2] });
      out.matches.push({ raw: mTotals[0], label: "total_ttc", value: mTotals[3] });
    }
    
    return out;
  }

  /* ===========================
     TABLE DETECTOR V2
     =========================== */

  /**
   * Colonnes par défaut si header introuvable
   * 
   * @returns {Object} Positions X colonnes + flags
   * @private
   */
  function defaultCols() {
    return {
      xType: 0,
      xDesc: 90,
      xPU: 360,
      xQty: 470,
      xTVA: 540,
      xReduc: 585,
      xTotal: 650,
      hasReduc: false,
      found: false
    };
  }

  /**
   * Grouper items PDF par ligne selon coordonnée Y
   * 
   * @param {Array} items - Items PDF [{str, x, y, w, h}, ...]
   * @param {number} [yTolerance=2.5] - Tolérance Y pour même ligne
   * @returns {Array} Lignes [{y, tokens: [...], text}, ...]
   * 
   * @example
   * const lines = groupByLine(items, 2.5);
   * console.log(lines[0].text); // "Service 1 220,00 € 1 22,00 € 242,00 €"
   */
  function groupByLine(items, yTolerance) {
    if(yTolerance === undefined) yTolerance = 2.5;
    const sorted = items.slice().sort(function(a, b) { return (b.y - a.y) || (a.x - b.x); });
    const lines = [];
    
    for(let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      if(!it.str || !it.str.trim()) continue;
      
      let line = null;
      for(let j = 0; j < lines.length; j++) {
        if(Math.abs(lines[j].y - it.y) <= yTolerance) { line = lines[j]; break; }
      }
      
      if(!line) { line = { y: it.y, tokens: [], text: "" }; lines.push(line); }
      line.tokens.push(it);
    }
    
    for(let i = 0; i < lines.length; i++) {
      const l = lines[i];
      l.tokens.sort(function(a, b) { return a.x - b.x; });
      l.text = l.tokens.map(function(t) { return t.str; }).join(" ");
    }
    
    lines.sort(function(a, b) { return b.y - a.y; });
    return lines;
  }

  /**
   * Détecter header tableau et positions colonnes
   * 
   * @param {Array} items - Items PDF
   * @returns {Object} { found, headerFound, headerY, cols, lines }
   * 
   * @example
   * const result = detectHeaderAndCols(items);
   * if(result.found) {
   *   console.log("Header trouvé à Y:", result.headerY);
   *   console.log("Colonnes:", result.cols);
   * }
   */
  function detectHeaderAndCols(items) {
    const lines = groupByLine(items, 2.5);
    let header = null;
    
    // Chercher ligne header (mots-clés: type, description, prix, quantité, tva, total)
    const keywords = ["type", "description", "prix", "unitaire", "quantité", "quantite", "tva", "total"];
    for(let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const txt = normalizeSpaces(line.text).toLowerCase();
      let score = 0;
      for(let k = 0; k < keywords.length; k++) {
        if(txt.includes(keywords[k])) score++;
      }
      if(score >= 5) { header = line; break; }
    }
    
    if(!header) {
      return { found: false, headerY: null, cols: defaultCols(), headerFound: false, lines: lines };
    }
    
    const tokens = header.tokens.slice().sort(function(a, b) { return a.x - b.x; });
    
    function findTokenX(word) {
      for(let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if(normalizeSpaces(t.str).toLowerCase().includes(word)) return t.x;
      }
      return null;
    }
    
    let xType = tokens[0] ? tokens[0].x : 0;
    let xDesc = findTokenX("description");
    let xPU = findTokenX("prix");
    let xQty = findTokenX("quant");
    let xTVA = findTokenX("tva");
    let xTotal = findTokenX("total");
    
    const xs = tokens.map(function(t) { return t.x; }).sort(function(a, b) { return a - b; });
    const minX = xs[0] || 0;
    const maxX = xs[xs.length - 1] || 700;
    
    // Fallback positions si colonnes introuvables
    if(xDesc === null) xDesc = minX + (maxX - minX) * 0.15;
    if(xPU === null) xPU = minX + (maxX - minX) * 0.58;
    if(xQty === null) xQty = minX + (maxX - minX) * 0.70;
    if(xTVA === null) xTVA = minX + (maxX - minX) * 0.78;
    if(xTotal === null) xTotal = minX + (maxX - minX) * 0.86;
    
    const hasReduc = normalizeSpaces(header.text).toLowerCase().includes("réduction") || normalizeSpaces(header.text).toLowerCase().includes("reduction");
    let xReduc = null;
    if(hasReduc) {
      xReduc = findTokenX("réduc") || findTokenX("reduc") || (minX + (maxX - minX) * 0.82);
      if(xTotal < xReduc) xTotal = xReduc + 40;
    } else {
      xReduc = xTVA + 40;
    }
    
    return {
      found: true,
      headerFound: true,
      headerY: header.y,
      cols: { xType, xDesc, xPU, xQty, xTVA, xReduc, xTotal, hasReduc, found: true },
      lines: lines
    };
  }

  /**
   * Extraire cellules depuis ligne selon positions colonnes
   * 
   * @param {Array} tokens - Tokens ligne [{str, x}, ...]
   * @param {Object} cols - Positions colonnes
   * @returns {Object} { type, desc, pu, qty, tva, reduc, total }
   * @private
   */
  function getCellsFromLine(tokens, cols) {
    const typeTokens = [], descTokens = [], puTokens = [], qtyTokens = [], tvaTokens = [], reducTokens = [], totalTokens = [];
    
    for(let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const x = t.x;
      const s = t.str;
      
      if(x < cols.xDesc) typeTokens.push(s);
      else if(x < cols.xPU) descTokens.push(s);
      else if(x < cols.xQty) puTokens.push(s);
      else if(x < cols.xTVA) qtyTokens.push(s);
      else if(cols.hasReduc && x < cols.xReduc) tvaTokens.push(s);
      else if(cols.hasReduc && x < cols.xTotal) reducTokens.push(s);
      else if(!cols.hasReduc && x < cols.xTotal) tvaTokens.push(s);
      else totalTokens.push(s);
    }
    
    return {
      type: typeTokens.join(" "),
      desc: descTokens.join(" "),
      pu: puTokens.join(" "),
      qty: qtyTokens.join(" "),
      tva: tvaTokens.join(" "),
      reduc: reducTokens.join(" "),
      total: totalTokens.join(" ")
    };
  }

  /**
   * Vérifier si token contient montant (ex: "220,00 €")
   * 
   * @param {string} s - Token à vérifier
   * @returns {boolean} true si ressemble à montant
   * @private
   */
  function isMoneyToken(s) {
    return /[0-9][0-9\s]*[,\.]\d{2}\s*€?/.test(s);
  }

  /**
   * Extraire tableau depuis items PDF (Table Detector V2)
   * Mode robuste : header si trouvé, sinon headerless
   * 
   * @param {Array} pageItems - Items PDF page
   * @param {string} fullTextForFallback - Texte complet (fallback OCR)
   * @returns {Object} { cols, debug, services: [...], debours: [...] }
   * 
   * @example
   * const table = extractTableFromXY(items, fullText);
   * console.log("Services:", table.services);
   * console.log("Debug:", table.debug);
   */
  function extractTableFromXY(pageItems, fullTextForFallback) {
    const head = detectHeaderAndCols(pageItems);
    const cols = head.cols || defaultCols();
    let headerY = head.headerY;
    const lines = head.lines || groupByLine(pageItems, 2.5);
    
    // ✅ Mode headerless : si header introuvable, repérer 1ère ligne Service + €
    let startY = headerY;
    if(startY === null || startY === undefined) {
      for(let i = 0; i < lines.length; i++) {
        const txt = normalizeSpaces(lines[i].text).toLowerCase();
        if(txt.includes("service") && (txt.includes("€") || /[0-9][0-9\s]*[,\.]\d{2}/.test(txt))) {
          startY = lines[i].y;
          break;
        }
      }
    }
    
    const tableLines = [];
    let inTable = false;
    
    for(let i = 0; i < lines.length; i++) {
      const l = lines[i];
      
      if(startY !== null && startY !== undefined && l.y <= startY + 1) {
        inTable = true;
      }
      if(!inTable) continue;
      
      const txt = normalizeSpaces(l.text).toLowerCase();
      
      // Stop conditions (moins agressives)
      if(txt.includes("total ht") && txt.includes("total ttc")) break;
      if(txt.includes("sas au capital") || txt.includes("sarl au capital")) break;
      if(txt.match(/\b(conditions|modalités|paiement|iban|bic|siret)\b/) && !isMoneyToken(txt)) break;
      
      tableLines.push(l);
    }
    
    const services = [];
    const debours = [];
    
    for(let i = 0; i < tableLines.length; i++) {
      const l = tableLines[i];
      const cells = getCellsFromLine(l.tokens, cols);
      
      if(!cells.desc || !cells.total) continue;
      if(!isMoneyToken(cells.total)) continue;
      
      const row = {
        type: normalizeSpaces(cells.type),
        desc: normalizeSpaces(cells.desc),
        pu: normalizeSpaces(cells.pu),
        qty: normalizeSpaces(cells.qty),
        tva: normalizeSpaces(cells.tva),
        reduc: normalizeSpaces(cells.reduc),
        total: normalizeSpaces(cells.total)
      };
      
      const typeLC = row.type.toLowerCase();
      if(typeLC.includes("débour") || typeLC.includes("debour")) {
        debours.push(row);
      } else {
        services.push(row);
      }
    }
    
    return {
      cols: cols,
      debug: {
        headerFound: head.headerFound,
        headerY: headerY,
        hasReduc: cols.hasReduc,
        tableLines: tableLines.length,
        servicesDetected: services.length,
        totalLines: lines.length
      },
      services: services,
      debours: debours
    };
  }

  /**
   * Fallback : Extraire tableau depuis texte OCR (si table XY vide)
   * Cherche blocs "Service" + montants €
   * 
   * @param {string} fullText - Texte complet OCR
   * @returns {Object} { cols, debug, services: [...], debours: [] }
   * 
   * @example
   * const table = fallbackTableFromOCRText(fullText);
   * console.log("Services extraits:", table.services);
   */
  function fallbackTableFromOCRText(fullText) {
    const t = normalizeSpaces(fullText || "");
    const services = [];
    
    const chunks = t.split(/\bService\b/i);
    if(chunks.length > 1) {
      for(let i = 1; i < chunks.length; i++) {
        const c = normalizeSpaces(chunks[i]);
        const moneyRe = /([0-9][0-9\s]*[,\.]\d{2})\s*€/g;
        const moneys = Array.from(c.matchAll(moneyRe)).map(function(m) {
          return (m[1] + " €").replace(/\s+/g, " ").trim();
        });
        
        if(moneys.length < 2) continue;
        
        const total = moneys[moneys.length - 1];
        const pu = moneys[0];
        
        const mTVA = c.match(/\b(\d{1,3})\s*%\b/);
        const tva = mTVA ? (mTVA[1] + "%") : "10%";
        
        let qty = "1";
        const idx = c.indexOf(pu.replace(" €", ""));
        if(idx >= 0) {
          const after = c.slice(idx);
          const mQty = after.match(/\b(\d{1,3})\b/);
          if(mQty) qty = mQty[1];
        }
        
        let desc = c;
        const cut = c.indexOf(pu.replace(" €", ""));
        if(cut > 0) desc = c.slice(0, cut).trim();
        desc = normalizeSpaces(desc);
        
        services.push({
          type: "Service",
          desc: desc,
          pu: pu,
          qty: qty,
          tva: tva,
          reduc: "",
          total: total
        });
      }
    }
    
    return {
      cols: defaultCols(),
      debug: {
        headerFound: false,
        headerY: null,
        hasReduc: false,
        tableLines: 0,
        servicesDetected: services.length,
        totalLines: 0,
        fallback: true
      },
      services: services,
      debours: []
    };
  }

  // Export API publique
  window.ParserModule = {
    // Champs principaux
    parseFieldsRobust: parseFieldsRobust,
    
    // Table detector
    extractTableFromXY: extractTableFromXY,
    fallbackTableFromOCRText: fallbackTableFromOCRText,
    groupByLine: groupByLine,
    detectHeaderAndCols: detectHeaderAndCols,
    
    // Utilitaires
    normalizeSpaces: normalizeSpaces,
    normalizeNumber: normalizeNumber,
    safeNum: safeNum,
    parseFrenchDateAny: parseFrenchDateAny,
    cleanClientName: cleanClientName
  };

})(window);

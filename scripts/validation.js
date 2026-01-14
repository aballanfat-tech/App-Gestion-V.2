/**
 * Validation Module - Module Extraction Factures
 * 
 * Validation côté client des données de factures
 * Empêche la sauvegarde de données incohérentes
 * 
 * @module validation
 * @version 2.7.0
 */

(function(window) {
  'use strict';

  /**
   * Valider une date au format YYYY-MM-DD ou DD/MM/YYYY
   * 
   * @param {string} dateStr - Date à valider
   * @returns {boolean} true si date valide
   * 
   * @example
   * isValidDate("2025-01-05");  // true
   * isValidDate("05/01/2025");  // true
   * isValidDate("invalid");     // false
   */
  function isValidDate(dateStr) {
    if(!dateStr || typeof dateStr !== 'string') return false;
    
    // Normaliser vers YYYY-MM-DD
    let normalized = dateStr;
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const parts = dateStr.split('/');
      normalized = parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    
    const date = new Date(normalized);
    return date instanceof Date && !isNaN(date.getTime());
  }

  /**
   * Valider un montant (doit être un nombre positif ou négatif)
   * 
   * @param {string|number} amount - Montant à valider
   * @returns {boolean} true si montant valide
   * 
   * @example
   * isValidAmount("220.50");   // true
   * isValidAmount(220.50);     // true
   * isValidAmount("220,50");   // true (virgule acceptée)
   * isValidAmount("invalid");  // false
   */
  function isValidAmount(amount) {
    if(amount === null || amount === undefined || amount === '') return false;
    
    const str = String(amount).replace(',', '.');
    const num = parseFloat(str);
    
    return !isNaN(num) && isFinite(num);
  }

  /**
   * Valider format numéro de facture
   * Formats acceptés: 2025-001, FACT-2025-001, F2025001, etc.
   * 
   * @param {string} numero - Numéro de facture
   * @returns {Object} Objet { valid: boolean, reason: string }
   * 
   * @example
   * validateNumeroFacture("2025-001");       // { valid: true, reason: "" }
   * validateNumeroFacture("");               // { valid: false, reason: "..." }
   */
  function validateNumeroFacture(numero) {
    if(!numero || typeof numero !== 'string') {
      return { valid: false, reason: "Numéro de facture obligatoire" };
    }
    
    const trimmed = numero.trim();
    if(trimmed.length < 3) {
      return { valid: false, reason: "Numéro trop court (min 3 caractères)" };
    }
    
    // Accepter formats: YYYY-XXX, FACT-XXX, FXXXX, etc.
    const validFormat = /^[A-Z0-9\-\/]{3,}$/i.test(trimmed);
    if(!validFormat) {
      return { valid: false, reason: "Format invalide (caractères alphanumériques, - et / acceptés)" };
    }
    
    return { valid: true, reason: "" };
  }

  /**
   * Valider cohérence HT/TVA/TTC
   * 
   * @param {number} ht - Montant HT
   * @param {number} tva - Montant TVA
   * @param {number} ttc - Montant TTC
   * @param {number} tolerance - Tolérance en euros (défaut: 0.02€)
   * @returns {Object} Objet { valid: boolean, reason: string, expected: number }
   * 
   * @example
   * validateHTTVATTC(220, 22, 242);   // { valid: true, reason: "", expected: 242 }
   * validateHTTVATTC(220, 22, 250);   // { valid: false, reason: "...", expected: 242 }
   */
  function validateHTTVATTC(ht, tva, ttc, tolerance) {
    tolerance = tolerance || 0.02;
    
    if(!ht || ht <= 0) {
      return { valid: true, reason: "", expected: 0 }; // HT non renseigné = pas de validation
    }
    
    const expectedTTC = ht + (tva || 0);
    const diff = Math.abs(ttc - expectedTTC);
    
    if(diff > tolerance) {
      return {
        valid: false,
        reason: "Incohérence HT/TVA/TTC: " + ht.toFixed(2) + "€ + " + (tva || 0).toFixed(2) + "€ ≠ " + ttc.toFixed(2) + "€",
        expected: expectedTTC
      };
    }
    
    return { valid: true, reason: "", expected: expectedTTC };
  }

  /**
   * Valider données complètes d'une facture
   * 
   * @param {Object} data - Données facture à valider
   * @param {Object} data.fields - Champs principaux (numero_facture, date_facture, etc.)
   * @param {Array} [data.lines] - Lignes de services (optionnel)
   * @returns {Object} Objet { valid: boolean, errors: Array<string>, warnings: Array<string> }
   * 
   * @example
   * const result = validateFactureData({
   *   fields: {
   *     numero_facture: "2025-001",
   *     date_facture: "2025-01-05",
   *     total_ht: 220,
   *     total_tva: 22,
   *     total_ttc: 242
   *   }
   * });
   * 
   * if(result.valid) {
   *   console.log("Données valides");
   * } else {
   *   console.error("Erreurs:", result.errors);
   * }
   */
  function validateFactureData(data) {
    const errors = [];
    const warnings = [];
    
    if(!data || !data.fields) {
      errors.push("❌ Structure de données invalide");
      return { valid: false, errors: errors, warnings: warnings };
    }
    
    const fields = data.fields;
    
    // 1. Numéro facture (OBLIGATOIRE)
    const numeroValidation = validateNumeroFacture(fields.numero_facture);
    if(!numeroValidation.valid) {
      errors.push("❌ Numéro facture: " + numeroValidation.reason);
    }
    
    // 2. Date facture (RECOMMANDÉ)
    if(fields.date_facture) {
      if(!isValidDate(fields.date_facture)) {
        errors.push("❌ Date facture invalide: " + fields.date_facture);
      }
    } else {
      warnings.push("⚠️ Date facture non renseignée");
    }
    
    // 3. Client (RECOMMANDÉ)
    if(!fields.client_nom || fields.client_nom.trim() === '') {
      warnings.push("⚠️ Nom client non renseigné");
    }
    
    // 4. Montants (RECOMMANDÉ)
    const ht = parseFloat(String(fields.total_ht || 0).replace(',', '.'));
    const tva = parseFloat(String(fields.total_tva || 0).replace(',', '.'));
    const ttc = parseFloat(String(fields.total_ttc || 0).replace(',', '.'));
    
    if(ht <= 0 && ttc <= 0) {
      warnings.push("⚠️ Aucun montant renseigné");
    } else {
      // Valider cohérence HT/TVA/TTC
      const coherence = validateHTTVATTC(ht, tva, ttc);
      if(!coherence.valid) {
        errors.push("❌ " + coherence.reason);
      }
    }
    
    // 5. Lignes services (optionnel)
    if(data.lines && Array.isArray(data.lines)) {
      if(data.lines.length === 0) {
        warnings.push("⚠️ Aucune ligne de service");
      } else {
        // Vérifier chaque ligne
        data.lines.forEach(function(line, index) {
          if(!line.destination || line.destination.trim() === '') {
            warnings.push("⚠️ Ligne " + (index + 1) + ": Destination vide");
          }
          
          if(!line.prix_ht || parseFloat(line.prix_ht) <= 0) {
            warnings.push("⚠️ Ligne " + (index + 1) + ": Prix HT manquant");
          }
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  /**
   * Valider données avant sauvegarde (version stricte)
   * Bloque la sauvegarde si erreurs critiques
   * 
   * @param {Object} data - Données facture
   * @returns {Object} Objet { canSave: boolean, message: string }
   */
  function validateBeforeSave(data) {
    const validation = validateFactureData(data);
    
    if(!validation.valid) {
      return {
        canSave: false,
        message: "❌ Impossible de sauvegarder:\n" + validation.errors.join("\n")
      };
    }
    
    if(validation.warnings.length > 0) {
      return {
        canSave: true,
        message: "⚠️ Avertissements:\n" + validation.warnings.join("\n") + "\n\n✅ Sauvegarde possible mais données incomplètes"
      };
    }
    
    return {
      canSave: true,
      message: "✅ Données valides"
    };
  }

  /**
   * Formater les erreurs de validation pour affichage utilisateur
   * 
   * @param {Object} validation - Résultat de validateFactureData
   * @returns {string} Message HTML formaté
   */
  function formatValidationErrors(validation) {
    let html = '';
    
    if(validation.errors.length > 0) {
      html += '<div style="color:#b91c1c;font-weight:700;margin-bottom:8px;">ERREURS :</div>';
      html += '<ul style="margin:0;padding-left:20px;">';
      validation.errors.forEach(function(err) {
        html += '<li>' + err + '</li>';
      });
      html += '</ul>';
    }
    
    if(validation.warnings.length > 0) {
      html += '<div style="color:#92400e;font-weight:700;margin:8px 0;">AVERTISSEMENTS :</div>';
      html += '<ul style="margin:0;padding-left:20px;">';
      validation.warnings.forEach(function(warn) {
        html += '<li>' + warn + '</li>';
      });
      html += '</ul>';
    }
    
    return html;
  }

  // Export API publique
  window.ValidationModule = {
    isValidDate: isValidDate,
    isValidAmount: isValidAmount,
    validateNumeroFacture: validateNumeroFacture,
    validateHTTVATTC: validateHTTVATTC,
    validateFactureData: validateFactureData,
    validateBeforeSave: validateBeforeSave,
    formatValidationErrors: formatValidationErrors
  };

})(window);

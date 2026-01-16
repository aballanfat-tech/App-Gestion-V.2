/**
 * UI Renderer Module - Module Extraction Factures
 * 
 * Responsable de tout le rendu DOM de l'application
 * Séparation stricte logique/affichage
 * 
 * @module ui-renderer
 * @version 2.7.0
 */

(function(window) {
  'use strict';

  /* ===========================
     HELPERS DOM
     =========================== */

  /**
   * Échapper HTML pour sécurité XSS
   * 
   * @param {string} s - Chaîne à échapper
   * @returns {string} Chaîne sécurisée
   * @private
   */
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, function(c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}[c];
    });
  }

  /**
   * Formater taille fichier (bytes → KB/MB)
   * 
   * @param {number} bytes - Taille en bytes
   * @returns {string} Taille formatée
   * 
   * @example
   * formatBytes(1024);      // "1.0 KB"
   * formatBytes(10485760);  // "10.0 MB"
   */
  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if(b < 1024) return b + " B";
    const kb = b / 1024;
    if(kb < 1024) return kb.toFixed(1) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }

  /* ===========================
     MESSAGES
     =========================== */

  /**
   * Afficher message utilisateur (success/warning/error)
   * 
   * @param {string} type - Type message ('ok', 'warn', 'err', '')
   * @param {string} text - Texte message
   * @param {HTMLElement} [container] - Conteneur custom (défaut: #msg)
   * 
   * @example
   * UIRenderer.showMessage('ok', '✅ Fichier uploadé avec succès');
   * UIRenderer.showMessage('err', '❌ Erreur lors du traitement');
   */
  function showMessage(type, text, container) {
    container = container || document.getElementById("msg");
    if(!container) return;
    
    container.className = "msg " + (type || "warn");
    container.textContent = text || "";
    container.style.display = text ? "block" : "none";
  }

  /**
   * Afficher message temporaire (auto-disparition)
   * 
   * @param {string} type - Type message
   * @param {string} text - Texte
   * @param {number} [duration=3000] - Durée en ms
   */
  function showTempMessage(type, text, duration) {
    showMessage(type, text);
    setTimeout(function() {
      showMessage("", "");
    }, duration || 3000);
  }

  /* ===========================
     LISTE FICHIERS
     =========================== */

  /**
   * Rendre liste des fichiers dans tableau
   * 
   * @param {Array} files - Liste fichiers depuis StateManager
   * @param {HTMLElement} [tbody] - Élément tbody (défaut: #tbody)
   * @param {HTMLElement} [countEl] - Élément compteur (défaut: #count)
   * 
   * @example
   * const files = StateManager.getFiles();
   * UIRenderer.renderFileList(files);
   */
  function renderFileList(files, tbody, countEl) {
    tbody = tbody || document.getElementById("tbody");
    countEl = countEl || document.getElementById("count");
    
    if(!tbody) return;
    
    if(countEl) {
      countEl.textContent = String(files.length);
    }
    
    tbody.innerHTML = "";
    
    if(files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">Aucun fichier</td></tr>';
      return;
    }
    
    const anyBusy = files.some(function(f) {
      return ["uploading", "extracting"].includes(f.status);
    });
    
    for(let i = 0; i < files.length; i++) {
      const it = files[i];
      const fileName = it.kind === "local" ? it.file.name : it.fileName;
      const size = it.kind === "local" ? it.file.size : it.size;
      
      let pill = '<span class="pill">' + escapeHtml(it.status || "—") + '</span>';
      if(it.status === "extracted") pill = '<span class="pill ok">Extrait</span>';
      if(it.status === "done") pill = '<span class="pill ok">Terminé</span>';
      if(it.status === "error") pill = '<span class="pill err">Erreur</span>';
      if(it.status === "uploading" || it.status === "extracting") {
        pill = '<span class="pill wait">' + escapeHtml(it.status) + '</span>';
      }
      
      // Formater date
      let dateDisplay = '—';
      if (it.createdAt) {
        const d = new Date(it.createdAt);
        dateDisplay = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      } else if (it.date_facture) {
        const d = new Date(it.date_facture);
        dateDisplay = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      }
      
      tbody.insertAdjacentHTML("beforeend", `
        <tr>
          <td>
            <div style="font-weight:900;">${escapeHtml(fileName)}</div>
            ${it.error ? `<div class="muted" style="color:#b91c1c; font-weight:800;">${escapeHtml(it.error)}</div>` : ""}
          </td>
          <td>${formatBytes(size)}</td>
          <td>${pill}</td>
          <td>${dateDisplay}</td>
          <td>${it.factureId || it.id ? `<span class="mono small">${escapeHtml(String(it.factureId || it.id).substring(0, 12))}...</span>` : `<span class="muted">—</span>`}</td>
          <td>
            <div class="actions">
              <button class="btn small" data-action="remove" data-i="${i}" ${anyBusy ? "disabled" : ""}>Retirer</button>
              <button class="btn small" data-action="view" data-i="${i}" ${(!it.factureId || it.status !== "extracted") ? "disabled" : ""}>👁 Voir</button>
            </div>
          </td>
        </tr>
      `);
    }
  }
      
  /**
   * Mettre à jour boutons selon état
   * 
   * @param {Array} files - Liste fichiers
   * @param {boolean} sessionOk - Session Supabase valide
   */
  function updateButtons(files, sessionOk) {
    const startBtn = document.getElementById("startBtn");
    const clearBtn = document.getElementById("clearBtn");
    
    if(!startBtn || !clearBtn) return;
    
    const anyBusy = files.some(function(f) {
      return ["uploading", "extracting"].includes(f.status);
    });
    
    const hasReady = files.filter(function(f) {
      return f.kind === "local" && f.status === "ready";
    }).length > 0;
    
    startBtn.disabled = !sessionOk || anyBusy || !hasReady;
    clearBtn.disabled = anyBusy;
  }

  /* ===========================
     MODAL VIEWER
     =========================== */

  /**
   * Ouvrir modal viewer
   * 
   * @param {HTMLElement} [modal] - Élément modal (défaut: #modal)
   */
  function openModal(modal) {
    modal = modal || document.getElementById("modal");
    if(!modal) return;
    modal.classList.add("open");
  }

  /**
   * Fermer modal viewer
   * 
   * @param {HTMLElement} [modal] - Élément modal (défaut: #modal)
   */
  function closeModal(modal) {
    modal = modal || document.getElementById("modal");
    if(!modal) return;
    modal.classList.remove("open");
  }

  /**
   * Changer onglet actif modal
   * 
   * @param {string} tabName - Nom onglet ('edit', 'table', 'text', 'debug')
   */
  function setActiveTab(tabName) {
    const tabButtons = Array.from(document.querySelectorAll(".tab"));
    const tabEdit = document.getElementById("tab-edit");
    const tabTable = document.getElementById("tab-table");
    const tabText = document.getElementById("tab-text");
    const tabDebug = document.getElementById("tab-debug");
    
    tabButtons.forEach(function(b) {
      b.classList.toggle("active", b.dataset.tab === tabName);
    });
    
    if(tabEdit) tabEdit.classList.toggle("active", tabName === "edit");
    if(tabTable) tabTable.classList.toggle("active", tabName === "table");
    if(tabText) tabText.classList.toggle("active", tabName === "text");
    if(tabDebug) tabDebug.classList.toggle("active", tabName === "debug");
  }

  /**
   * Rendre header édition facture (champs principaux)
   * 
   * @param {Object} fields - Champs facture
   * @param {HTMLElement} [container] - Conteneur (défaut: #editHeader)
   */
  function renderEditHeader(fields, container) {
    container = container || document.getElementById("editHeader");
    if(!container) return;
    
    fields = fields || {};
    
    container.innerHTML = `
      <div>
        <div class="label">Numéro facture</div>
        <input data-h="numero_facture" value="${escapeHtml(fields.numero_facture || "")}">
      </div>
      <div>
        <div class="label">Date facture (YYYY-MM-DD)</div>
        <input data-h="date_facture" value="${escapeHtml(fields.date_facture || "")}">
      </div>
      <div class="full">
        <div class="label">Client (nom seul)</div>
        <input data-h="client_nom" value="${escapeHtml(fields.client_nom || "")}">
      </div>
      <div>
        <div class="label">Total HT</div>
        <input data-h="total_ht" value="${escapeHtml(fields.total_ht != null ? String(fields.total_ht) : "")}">
      </div>
      <div>
        <div class="label">Total TVA</div>
        <input data-h="total_tva" value="${escapeHtml(fields.total_tva != null ? String(fields.total_tva) : "")}">
      </div>
      <div>
        <div class="label">Total TTC</div>
        <input data-h="total_ttc" value="${escapeHtml(fields.total_ttc != null ? String(fields.total_ttc) : "")}">
      </div>
    `;
  }

  /**
   * Rendre tableau édition lignes services
   * 
   * @param {Array} lines - Lignes [{type, desc, pu, qty, tva, reduc, total}, ...]
   * @param {HTMLElement} [container] - Conteneur (défaut: #editLines)
   */
  function renderEditLines(lines, container) {
    container = container || document.getElementById("editLines");
    if(!container) return;
    
    lines = lines || [];
    if(lines.length === 0) {
      lines = [{type: "Service", desc: "", pu: "", qty: "1", tva: "10%", reduc: "", total: ""}];
    }
    
    const hasReduc = lines.some(function(r) { return (r.reduc || "").trim().length > 0; });
    
    container.innerHTML = `
      <table class="editTable">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th>PU</th>
            <th>Qté</th>
            <th>TVA</th>
            ${hasReduc ? "<th>Réduc</th>" : ""}
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(function(r, idx) {
            return `
              <tr data-line="${idx}">
                <td>
                  <select data-k="type">
                    <option ${r.type === "Service" ? "selected" : ""}>Service</option>
                    <option ${String(r.type || "").toLowerCase().includes("débours") ? "selected" : ""}>Débours</option>
                  </select>
                </td>
                <td><input data-k="desc" value="${escapeHtml(r.desc || "")}"></td>
                <td><input data-k="pu" value="${escapeHtml(r.pu || "")}"></td>
                <td><input data-k="qty" value="${escapeHtml(r.qty || "1")}"></td>
                <td><input data-k="tva" value="${escapeHtml(r.tva || "10%")}"></td>
                ${hasReduc ? `<td><input data-k="reduc" value="${escapeHtml(r.reduc || "")}"></td>` : ""}
                <td><input data-k="total" value="${escapeHtml(r.total || "")}"></td>
                <td>
                  <div class="actions">
                    <button class="btn small" data-action="dup-line" data-idx="${idx}">Dupliquer</button>
                    <button class="btn small" data-action="del-line" data-idx="${idx}">Supprimer</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      <div class="muted small" style="margin-top:8px;">
        ✅ Tu peux modifier chaque cellule. Les changements sont autosave (toutes les 5s).
      </div>
    `;
  }

  /**
   * Rendre tableau extrait (onglet Table)
   * 
   * @param {Array} services - Services extraits
   * @param {HTMLElement} [container] - Conteneur (défaut: #tableHtml)
   */
  function renderExtractedTable(services, container) {
    container = container || document.getElementById("tableHtml");
    if(!container) return;
    
    services = services || [];
    
    if(services.length === 0) {
      container.innerHTML = '<div class="muted">Aucun tableau détecté. Vérifie le texte extrait.</div>';
      return;
    }
    
    const hasReduc = services.some(function(r) { return (r.reduc || "").trim().length > 0; });
    
    container.innerHTML = `
      <table class="editTable">
        <thead>
          <tr>
            <th>Type</th>
            <th>Description</th>
            <th>PU HT</th>
            <th>Qté</th>
            <th>TVA</th>
            ${hasReduc ? "<th>Réduc</th>" : ""}
            <th>Total HT</th>
          </tr>
        </thead>
        <tbody>
          ${services.map(function(r) {
            return `
              <tr>
                <td>${escapeHtml(r.type || "Service")}</td>
                <td>${escapeHtml(r.desc || "")}</td>
                <td>${escapeHtml(r.pu || "")}</td>
                <td>${escapeHtml(r.qty || "")}</td>
                <td>${escapeHtml(r.tva || "")}</td>
                ${hasReduc ? `<td>${escapeHtml(r.reduc || "")}</td>` : ""}
                <td>${escapeHtml(r.total || "")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  /**
   * Rendre texte surligné (onglet Text)
   * 
   * @param {string} rawText - Texte brut OCR
   * @param {Array} valuesToHighlight - Valeurs à surligner
   * @param {HTMLElement} [container] - Conteneur (défaut: #textHtml)
   */
  function renderHighlightedText(rawText, valuesToHighlight, container) {
    container = container || document.getElementById("textHtml");
    if(!container) return;
    
    let html = escapeHtml(rawText || "");
    
    valuesToHighlight = valuesToHighlight || [];
    for(let i = 0; i < valuesToHighlight.length; i++) {
      const v = valuesToHighlight[i];
      const escaped = escapeHtml(v);
      const re = new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      html = html.replace(re, '<mark class="hl">' + escaped + '</mark>');
    }
    
    container.innerHTML = html;
  }

  /**
   * Rendre JSON debug (onglet Debug)
   * 
   * @param {Object} data - Données complètes facture
   * @param {HTMLElement} [container] - Conteneur (défaut: #debugJson)
   */
  function renderDebugJson(data, container) {
    container = container || document.getElementById("debugJson");
    if(!container) return;
    
    container.textContent = JSON.stringify(data, null, 2);
  }

  /**
   * Mettre à jour métadonnées modal (header)
   * 
   * @param {Object} info - Infos {fileName, factureId, status, etc.}
   * @param {HTMLElement} [container] - Conteneur (défaut: #meta)
   */
  function updateModalMeta(info, container) {
    container = container || document.getElementById("meta");
    if(!container) return;
    
    let html = '<span class="mono">' + escapeHtml(info.fileName || "Facture") + '</span>';
    if(info.factureId) {
      html += ' <span class="muted">• ID: ' + escapeHtml(info.factureId) + '</span>';
    }
    
    container.innerHTML = html;
  }

  /**
   * Afficher tags statut modal
   * 
   * @param {Array} tags - Liste tags ['✅ Extracted', '🔍 Validé', etc.]
   * @param {HTMLElement} [container] - Conteneur (défaut: #tags)
   */
  function showModalTags(tags, container) {
    container = container || document.getElementById("tags");
    if(!container) return;
    
    container.innerHTML = tags.map(function(tag) {
      return '<span class="pill">' + escapeHtml(tag) + '</span>';
    }).join(" ");
  }

  /**
   * Afficher info autosave
   * 
   * @param {string} message - Message ('✅ Sauvegardé', '⏳ Sauvegarde...', etc.)
   * @param {HTMLElement} [container] - Conteneur (défaut: #autosaveInfo)
   */
  function showAutosaveInfo(message, container) {
    container = container || document.getElementById("autosaveInfo");
    if(!container) return;
    
    container.textContent = message;
    container.style.display = message ? "inline" : "none";
  }

  /* ===========================
     AUTH UI
     =========================== */

  /**
   * Mettre à jour UI auth (connecté/déconnecté)
   * 
   * @param {Object|null} user - Utilisateur Supabase ou null
   */
  function updateAuthUI(user) {
    const authStatus = document.getElementById("authStatus");
    const email = document.getElementById("email");
    const pass = document.getElementById("pass");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    
    if(!authStatus) return;
    
    if(user) {
      authStatus.textContent = "Connecté: " + (user.email || user.id);
      if(logoutBtn) logoutBtn.disabled = false;
      if(email) email.style.display = "none";
      if(pass) pass.style.display = "none";
      if(loginBtn) loginBtn.style.display = "none";
    } else {
      authStatus.textContent = "Non connecté";
      if(logoutBtn) logoutBtn.disabled = true;
      if(email) email.style.display = "";
      if(pass) pass.style.display = "";
      if(loginBtn) loginBtn.style.display = "";
    }
  }

  // Export API publique
  window.UIRenderer = {
    // Helpers
    escapeHtml: escapeHtml,
    formatBytes: formatBytes,
    
    // Messages
    showMessage: showMessage,
    showTempMessage: showTempMessage,
    
    // Liste fichiers
    renderFileList: renderFileList,
    updateButtons: updateButtons,
    
    // Modal
    openModal: openModal,
    closeModal: closeModal,
    setActiveTab: setActiveTab,
    renderEditHeader: renderEditHeader,
    renderEditLines: renderEditLines,
    renderExtractedTable: renderExtractedTable,
    renderHighlightedText: renderHighlightedText,
    renderDebugJson: renderDebugJson,
    updateModalMeta: updateModalMeta,
    showModalTags: showModalTags,
    showAutosaveInfo: showAutosaveInfo,
    
    // Auth
    updateAuthUI: updateAuthUI
  };

})(window);

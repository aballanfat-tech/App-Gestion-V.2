/**
 * Main Module - Module Extraction Factures
 * 
 * Point d'entrée de l'application
 * Orchestre tous les modules et gère les events
 * 
 * @module main
 * @version 2.7.0
 */

(function() {
  'use strict';

  /* ===========================
     CONFIGURATION & ÉTAT
     =========================== */

  const APP_VERSION = "v270_refacto";
  const LS_KEY = "import_factures_state_" + APP_VERSION;

  let autosaveTimer = null;
  let autosaveDirty = false;
  let lastAutosaveAt = 0;

  /* ===========================
     INITIALISATION
     =========================== */

  /**
   * Initialiser l'application
   * - Charger configuration
   * - Initialiser Supabase
   * - Initialiser PDF.js
   * - Restaurer session
   * - Setup event listeners
   */
  async function initApp() {
    console.log("🚀 Initialisation App Extraction Factures", APP_VERSION);

    try {
      // 1. Init PDF.js
      if(window.PDFJS_CONFIG) {
        PDFExtractor.initPDFjsWorker(window.PDFJS_CONFIG.workerSrc);
      }

      // 2. Init Supabase
      await SupabaseClient.init();

      // 3. Vérifier session
      const { user } = await SupabaseClient.getUser();
      StateManager.setUser(user);

      if(user) {
        UIRenderer.updateAuthUI(user);
        SupabaseClient.startKeepAlive();
      }

      // 4. Restaurer liste fichiers localStorage
      restoreListFromLocalStorage();

      // 5. Rendre UI initiale
      renderApp();

      // 6. Setup event listeners
      setupEventListeners();

      console.log("✅ App initialisée");

    } catch(e) {
      console.error("❌ Erreur initialisation:", e);
      UIRenderer.showMessage("err", "❌ Erreur initialisation: " + e.message);
    }
  }

  /**
   * Setup tous les event listeners
   */
  function setupEventListeners() {
    // Auth
    document.getElementById("loginBtn")?.addEventListener("click", handleLogin);
    document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);

    // Upload
    document.getElementById("fileInput")?.addEventListener("change", handleFileSelect);
    document.getElementById("startBtn")?.addEventListener("click", handleStartProcessing);
    document.getElementById("clearBtn")?.addEventListener("click", handleClearLocal);
    document.getElementById("reloadBtn")?.addEventListener("click", handleReload);

    // Bouton retour dashboard
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
    backBtn.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
    });
    }

    // Drag & Drop
    const drop = document.getElementById("drop");
    if(drop) {
      drop.addEventListener("dragover", function(e) {
        e.preventDefault();
        drop.classList.add("drag");
      });
      drop.addEventListener("dragleave", function() {
        drop.classList.remove("drag");
      });
      drop.addEventListener("drop", function(e) {
        e.preventDefault();
        drop.classList.remove("drag");
        if(e.dataTransfer && e.dataTransfer.files) {
          handleFileSelect({ target: { files: e.dataTransfer.files } });
        }
      });
    }

    // Liste actions (via delegation)
    document.getElementById("tbody")?.addEventListener("click", handleTableAction);

    // Modal
    document.getElementById("closeBtn")?.addEventListener("click", closeViewer);
    document.getElementById("modal")?.addEventListener("click", function(e) {
      if(e.target.id === "modal") closeViewer();
    });

    // Tabs modal
    document.querySelectorAll(".tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        UIRenderer.setActiveTab(btn.dataset.tab);
      });
    });

    // Édition modal
    document.getElementById("editHeader")?.addEventListener("input", markDirty);
    document.getElementById("editLines")?.addEventListener("input", markDirty);
    document.getElementById("editLines")?.addEventListener("click", handleLineAction);
    document.getElementById("addLineBtn")?.addEventListener("click", handleAddLine);

    // Sauvegarde
    document.getElementById("saveBtn")?.addEventListener("click", handleSaveViewer);
    document.getElementById("reparseBtn")?.addEventListener("click", handleReparse);

    // State events
    StateManager.on("filesChange", function(files) {
      UIRenderer.renderFileList(files);
      UIRenderer.updateButtons(files, StateManager.isSessionOk());
      saveListToLocalStorage();
    });

    StateManager.on("userChange", function(user) {
      UIRenderer.updateAuthUI(user);
      UIRenderer.updateButtons(StateManager.getFiles(), !!user);
    });
  }

  /* ===========================
     HANDLERS AUTH
     =========================== */

  async function handleLogin() {
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("pass").value;

    if(!email || !pass) {
      UIRenderer.showMessage("warn", "⚠️ Email et mot de passe requis");
      return;
    }

    UIRenderer.showMessage("warn", "⏳ Connexion en cours...");

    const result = await SupabaseClient.signIn(email, pass);

    if(result.error) {
      UIRenderer.showMessage("err", "❌ Erreur: " + result.error.message);
    } else {
      StateManager.setUser(result.user);
      SupabaseClient.startKeepAlive();
      UIRenderer.showTempMessage("ok", "✅ Connecté: " + result.user.email);
    }
  }

  async function handleLogout() {
    await SupabaseClient.signOut();
    SupabaseClient.stopKeepAlive();
    StateManager.setUser(null);
    UIRenderer.showTempMessage("ok", "✅ Déconnecté");
  }

  /* ===========================
     HANDLERS FICHIERS
     =========================== */

  function handleFileSelect(e) {
    const fileList = e.target.files;
    if(!fileList || fileList.length === 0) return;

    const APP_CONFIG = window.APP_CONFIG || {};
    const MAX_FILES = APP_CONFIG.MAX_FILES || 20;
    const MAX_SIZE = APP_CONFIG.MAX_FILE_SIZE || 10 * 1024 * 1024;

    const currentFiles = StateManager.getFiles();
    const newFiles = [];

    for(let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if(currentFiles.length + newFiles.length >= MAX_FILES) {
        UIRenderer.showMessage("warn", "⚠️ Maximum " + MAX_FILES + " fichiers");
        break;
      }

      if(file.type !== "application/pdf") {
        newFiles.push({
          kind: "local",
          file: file,
          status: "error",
          error: "PDF uniquement"
        });
        continue;
      }

      if(file.size > MAX_SIZE) {
        newFiles.push({
          kind: "local",
          file: file,
          status: "error",
          error: "Max 10MB"
        });
        continue;
      }

      newFiles.push({
        kind: "local",
        file: file,
        status: "ready",
        error: null,
        factureId: null
      });
    }

    StateManager.addFiles(newFiles);
  }

  async function handleStartProcessing() {
    const files = StateManager.getFiles();
    const toProcess = files.filter(function(f) {
      return f.kind === "local" && f.status === "ready";
    });

    if(toProcess.length === 0) {
      UIRenderer.showMessage("warn", "⚠️ Aucun fichier à traiter");
      return;
    }

    UIRenderer.showMessage("warn", "⏳ Traitement de " + toProcess.length + " fichier(s)...");

    for(let i = 0; i < toProcess.length; i++) {
      await processFile(toProcess[i]);
    }

    UIRenderer.showTempMessage("ok", "✅ Traitement terminé");
  }

  async function processFile(fileEntry) {
    const file = fileEntry.file;
    const fileName = file.name;

    try {
      // 1. Update status: uploading
      StateManager.updateFile(fileName, { status: "uploading" });

      // 2. Upload fichier
      const timestamp = Date.now();
      const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const storagePath = "2025/" + timestamp + "_" + sanitized;

      const uploadResult = await SupabaseClient.uploadFile(file, storagePath);
      if(uploadResult.error) throw new Error("Upload failed: " + uploadResult.error.message);

      // 3. Créer facture DB
      const { data: { user } } = await window.supabaseClient.auth.getUser();

      const createResult = await SupabaseClient.createFacture({
        fichier_url: storagePath,
        fichier_nom: fileName,
        statut: "pending",
        user_id: user?.id
      });
      if(createResult.error) throw new Error("Create failed: " + createResult.error.message);

      const factureId = createResult.data.id;

      // 4. Update status: extracting
      StateManager.updateFile(fileName, { status: "extracting", factureId: factureId });

      // 5. Extraire texte + items XY (créer copies pour éviter detached buffer)
      const arrayBuffer = await file.arrayBuffer();
      const arrayBufferCopy1 = arrayBuffer.slice(0); // Copie pour texte
      const arrayBufferCopy2 = arrayBuffer.slice(0); // Copie pour items XY
      
      const fullText = await PDFExtractor.extractPdfTextFromArrayBuffer(arrayBufferCopy1);
      const pagesXY = await PDFExtractor.extractPdfItemsXY(arrayBufferCopy2);

      // 6. Parser champs + table
      const fields = ParserModule.parseFieldsRobust(fullText);

      const table = [];
      for(let p = 0; p < pagesXY.length; p++) {
        const pageItems = pagesXY[p].items;
        const extracted = ParserModule.extractTableFromXY(pageItems, fullText);

        if(extracted.services.length > 0) {
          table.push(extracted);
        }
      }

      // Fallback si aucun service
      if(table.length === 0 || table.every(function(t) { return t.services.length === 0; })) {
        const fallback = ParserModule.fallbackTableFromOCRText(fullText);
        if(fallback.services.length > 0) {
          table.push(fallback);
        }
      }

      // 7. Sauvegarder données extraites
      const donneesBrutes = {
        fields: fields.fields,
        matches: fields.matches,
        table: table,
        version: fields.version,
        parsed_at: fields.parsed_at
      };

      await SupabaseClient.updateFacture(factureId, {
        statut: "extracted",
        texte_ocr: fullText,
        donnees_brutes: donneesBrutes,
        numero_facture: fields.fields.numero_facture || null,
        date_facture: fields.fields.date_facture || null,
        client_nom: fields.fields.client_nom || null,
        total_ht: fields.fields.total_ht || null,
        total_tva: fields.fields.total_tva || null,
        total_ttc: fields.fields.total_ttc || null
      });

      // 8. Update status: extracted
      StateManager.updateFile(fileName, {
        status: "extracted",
        kind: "saved",
        factureId: factureId,
        createdAt: new Date().toISOString()
      });

    } catch(e) {
      console.error("Erreur traitement", fileName, ":", e);
      StateManager.updateFile(fileName, {
        status: "error",
        error: e.message || "Erreur inconnue"
      });
    }
  }

  function handleClearLocal() {
    const files = StateManager.getFiles();
    const filtered = files.filter(function(f) { return f.kind === "saved"; });
    StateManager.setFiles(filtered);
    UIRenderer.showTempMessage("ok", "✅ Fichiers locaux retirés");
  }

async function handleReload() {
  console.log("🔄 Rechargement factures...");
  
  // 1. Essayer Supabase d'abord
  try {
    const { data, error } = await SupabaseClient.getFactures();
    
    if (!error && data && data.length > 0) {
      console.log(`✅ ${data.length} factures depuis Supabase`);
      
      // Vider état actuel
      StateManager.clearFiles();
      
      // Convertir format Supabase → State
      data.forEach(factureDB => {
        StateManager.addFile({
          id: factureDB.id,
          name: factureDB.fichier_nom,
          size: 0, // Pas stocké en DB
          status: factureDB.statut || "done",
          url: factureDB.fichier_url,
          // Ajouter autres champs si nécessaire
        });
      });
      
      // Sauvegarder aussi en localStorage
      saveCurrentListToLocalStorage();
      
      UIRenderer.showTempMessage("ok", `✅ ${data.length} factures chargées depuis Supabase`);
      return;
    }
    
    // Si Supabase vide, essayer localStorage
    if (!error && data.length === 0) {
      console.log("ℹ️ Aucune facture Supabase, essai localStorage");
    } else if (error) {
      console.warn("⚠️ Erreur Supabase:", error);
    }
  } catch (err) {
    console.error("❌ Erreur chargement Supabase:", err);
  }
  
  // 2. Fallback localStorage
  StateManager.clearFiles();
  restoreListFromLocalStorage();
  
  const count = StateManager.getFiles().length;
  if (count > 0) {
    UIRenderer.showTempMessage("ok", `✅ ${count} factures depuis localStorage`);
  } else {
    UIRenderer.showTempMessage("info", "ℹ️ Aucune facture trouvée");
  }
}

  function handleTableAction(e) {
    const btn = e.target.closest("button[data-action]");
    if(!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-i"));

    if(Number.isNaN(idx)) return;

    if(action === "remove") {
      StateManager.removeFile(StateManager.getFiles()[idx].fileName || StateManager.getFiles()[idx].file.name);
    }

    if(action === "view") {
      openViewerByIndex(idx);
    }
  }

  /* ===========================
     HANDLERS MODAL VIEWER
     =========================== */

  async function openViewerByIndex(idx) {
    const files = StateManager.getFiles();
    const fileEntry = files[idx];

    if(!fileEntry || !fileEntry.factureId) {
      UIRenderer.showMessage("err", "❌ Facture introuvable");
      return;
    }

    UIRenderer.showMessage("warn", "⏳ Chargement facture...");

    const result = await SupabaseClient.getFacture(fileEntry.factureId);

    if(result.error || !result.data) {
      UIRenderer.showMessage("err", "❌ Erreur chargement: " + (result.error?.message || "Introuvable"));
      return;
    }

    const facture = result.data;

    // Charger dans state
    StateManager.setViewerData(facture.donnees_brutes || {}, facture.id, facture.texte_ocr || "");

    // Extraire lignes pour édition
    const lines = extractLinesFromData(facture.donnees_brutes);
    StateManager.setViewerLines(lines);

    // Render modal
    UIRenderer.openModal();
    UIRenderer.setActiveTab("edit");
    UIRenderer.updateModalMeta({ fileName: facture.fichier_nom, factureId: facture.id });
    UIRenderer.showModalTags(["✅ Extracted", "🔍 " + (lines.length) + " lignes"]);

    renderViewerContent();

    UIRenderer.showMessage("", "");

    // Start autosave
    startAutosave();
  }

  function renderViewerContent() {
    const { data, rawText } = StateManager.getViewerData();
    const lines = StateManager.getViewerLines();

    // Tab Edit
    UIRenderer.renderEditHeader(data.fields || {});
    UIRenderer.renderEditLines(lines);

    // Tab Table
    const services = [];
    if(data.table) {
      data.table.forEach(function(t) {
        if(t.services) services.push(...t.services);
      });
    }
    UIRenderer.renderExtractedTable(services);

    // Tab Text
    const highlights = extractHighlightValues(data);
    UIRenderer.renderHighlightedText(rawText, highlights);

    // Tab Debug
    UIRenderer.renderDebugJson(data);
  }

  function extractLinesFromData(data) {
    const lines = [];
    if(data && data.table) {
      data.table.forEach(function(t) {
        if(t.services) {
          t.services.forEach(function(s) {
            lines.push({
              type: s.type || "Service",
              desc: s.desc || "",
              pu: s.pu || "",
              qty: s.qty || "1",
              tva: s.tva || "10%",
              reduc: s.reduc || "",
              total: s.total || ""
            });
          });
        }
      });
    }
    return lines.length > 0 ? lines : [{type: "Service", desc: "", pu: "", qty: "1", tva: "10%", reduc: "", total: ""}];
  }

  function extractHighlightValues(data) {
    const values = [];
    if(data && data.matches) {
      data.matches.forEach(function(m) {
        if(m.value && m.value.length >= 3 && m.value.length <= 220) {
          values.push(m.value);
        }
      });
    }
    return values;
  }

  function closeViewer() {
    stopAutosave();
    StateManager.clearViewer();
    UIRenderer.closeModal();
  }

  function handleLineAction(e) {
    const btn = e.target.closest("button[data-action]");
    if(!btn) return;

    const action = btn.getAttribute("data-action");
    const idx = Number(btn.getAttribute("data-idx"));

    const lines = StateManager.getViewerLines();

    if(action === "dup-line") {
      const copy = Object.assign({}, lines[idx]);
      lines.splice(idx + 1, 0, copy);
      StateManager.setViewerLines(lines);
      renderViewerContent();
      markDirty();
    }

    if(action === "del-line" && lines.length > 1) {
      lines.splice(idx, 1);
      StateManager.setViewerLines(lines);
      renderViewerContent();
      markDirty();
    }
  }

  function handleAddLine() {
    const lines = StateManager.getViewerLines();
    lines.push({type: "Service", desc: "", pu: "", qty: "1", tva: "10%", reduc: "", total: ""});
    StateManager.setViewerLines(lines);
    renderViewerContent();
    markDirty();
  }

  async function handleSaveViewer() {
    await saveViewerData();
    UIRenderer.showTempMessage("ok", "✅ Sauvegardé manuellement");
  }

  async function handleReparse() {
    UIRenderer.showMessage("warn", "⏳ Re-parsing...");
    // TODO: Re-extraire données depuis texte OCR
    UIRenderer.showTempMessage("ok", "✅ Re-parsing terminé");
  }

  /* ===========================
     AUTOSAVE
     =========================== */

  function markDirty() {
    autosaveDirty = true;
  }

  function startAutosave() {
    const DELAY = window.APP_CONFIG?.AUTOSAVE_DELAY || 5000;

    if(autosaveTimer) clearInterval(autosaveTimer);

    autosaveTimer = setInterval(function() {
      if(autosaveDirty) {
        saveViewerData();
      }
    }, DELAY);
  }

  function stopAutosave() {
    if(autosaveTimer) {
      clearInterval(autosaveTimer);
      autosaveTimer = null;
    }
    autosaveDirty = false;
  }

  async function saveViewerData() {
    const { data, factureId } = StateManager.getViewerData();
    if(!factureId) return;

    UIRenderer.showAutosaveInfo("⏳ Sauvegarde...");

    try {
      // Collecter données depuis inputs
      const fields = {};
      document.querySelectorAll("#editHeader input[data-h]").forEach(function(inp) {
        fields[inp.getAttribute("data-h")] = inp.value.trim();
      });

      // Collecter lignes depuis inputs
      const lines = [];
      document.querySelectorAll("#editLines tr[data-line]").forEach(function(tr) {
        const line = {};
        tr.querySelectorAll("input[data-k]").forEach(function(inp) {
          line[inp.getAttribute("data-k")] = inp.value.trim();
        });
        tr.querySelectorAll("select[data-k]").forEach(function(sel) {
          line[sel.getAttribute("data-k")] = sel.value;
        });
        lines.push(line);
      });

      StateManager.setViewerLines(lines);

      // Valider avant sauvegarde
      const validation = ValidationModule.validateBeforeSave({
        fields: fields,
        lines: lines
      });

      if(!validation.canSave) {
        UIRenderer.showAutosaveInfo("❌ Erreurs");
        UIRenderer.showMessage("err", validation.message);
        autosaveDirty = false;
        return;
      }

      // Update data
      data.fields = fields;
      data.table = [{
        page: 0,
        services: lines,
        debours: []
      }];

      // Sauvegarder Supabase
      await SupabaseClient.updateFacture(factureId, {
        donnees_brutes: data,
        numero_facture: fields.numero_facture || null,
        date_facture: fields.date_facture || null,
        client_nom: fields.client_nom || null,
        total_ht: ParserModule.safeNum(fields.total_ht),
        total_tva: ParserModule.safeNum(fields.total_tva),
        total_ttc: ParserModule.safeNum(fields.total_ttc)
      });

      lastAutosaveAt = Date.now();
      autosaveDirty = false;
      UIRenderer.showAutosaveInfo("✅ Sauvegardé " + new Date().toLocaleTimeString());

      setTimeout(function() {
        UIRenderer.showAutosaveInfo("");
      }, 2000);

    } catch(e) {
      console.error("Erreur autosave:", e);
      UIRenderer.showAutosaveInfo("❌ Erreur");
    }
  }

  /* ===========================
     LOCALSTORAGE
     =========================== */

  function saveListToLocalStorage() {
    try {
      const files = StateManager.getFiles();
      const compact = files
        .filter(function(f) { return f.kind === "saved" || (f.kind === "local" && f.factureId); })
        .map(function(f) {
          return {
            kind: "saved",
            fileName: f.kind === "local" ? f.file.name : f.fileName,
            size: f.kind === "local" ? f.file.size : f.size,
            status: f.status || "extracted",
            factureId: f.factureId || null,
            createdAt: f.createdAt || new Date().toISOString()
          };
        });

      localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: Date.now(), files: compact }));
    } catch(e) {
      console.warn("Erreur save localStorage:", e);
    }
  }

  function restoreListFromLocalStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return;

      const data = JSON.parse(raw);
      if(!data || !data.files || data.files.length === 0) return;

      const files = data.files.map(function(f) {
        return {
          kind: "saved",
          fileName: f.fileName || "Facture.pdf",
          size: f.size || 0,
          status: f.status || "extracted",
          factureId: f.factureId || null,
          createdAt: f.createdAt || null,
          error: null
        };
      });

      StateManager.setFiles(files);
    } catch(e) {
      console.warn("Erreur restore localStorage:", e);
    }
  }

  /* ===========================
     RENDER APP
     =========================== */

  function renderApp() {
    const files = StateManager.getFiles();
    const user = StateManager.getUser();

    UIRenderer.renderFileList(files);
    UIRenderer.updateButtons(files, !!user);
    UIRenderer.updateAuthUI(user);
  }

  /* ===========================
     BOOTSTRAP
     =========================== */

  // Init au chargement DOM
  if(document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }

})();

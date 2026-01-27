/**
 * MAIN - Page Gestion Factures Unifiée
 * @version 1.0.0
 * 
 * Orchestration: Upload + Extraction + Validation + Export
 * Réutilise modules existants: state.js, supabase-client.js, pdf-extractor.js, parser.js
 */

(function(window) {
  'use strict';

  console.log('🚀 Initialisation Gestion Factures v1.0');

  // ===== ÉTAT LOCAL =====
  let queueData = [];
  let selectedFiles = [];
  let supabaseClient = null;

  // ===== INITIALISATION =====
  async function init() {
    try {
      // 1. Init Supabase
      if (!window.SUPABASE_CONFIG) {
        throw new Error('Configuration Supabase manquante');
      }

      supabaseClient = supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey,
        window.SUPABASE_CONFIG.options
      );

      // Exposer globalement pour modal-facture.js
      window.supabaseClient = supabaseClient;

      console.log('✅ Supabase initialisé');

      // 2. Vérifier session
      const { data: { user }, error } = await supabaseClient.auth.getUser();
      
      if (error || !user) {
        console.error('❌ Non authentifié, redirection...');
        window.location.href = 'login.html';
        return;
      }

      StateManager.setUser(user);
      console.log('✅ Utilisateur:', user.email);

      // Afficher email utilisateur
      document.getElementById('userInfo').textContent = user.email;

      // 3. Init PDF.js
      if (window.PDFJS_CONFIG) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDFJS_CONFIG.workerSrc;
        console.log('✅ PDF.js configuré');
      }

      // 4. Charger queue existante
      await loadQueue();

      // 5. Setup event listeners
      setupEventListeners();

      console.log('✅ Application prête');

    } catch (err) {
      console.error('❌ Erreur initialisation:', err);
      showMessage('error', 'Erreur initialisation: ' + err.message);
    }
  }

  // ===== CHARGEMENT QUEUE =====
  async function loadQueue() {
    console.log('📥 Chargement queue factures...');
    
    showLoading(true);

    try {
      const { data, error } = await supabaseClient
        .from('v_queue_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      queueData = data || [];
      console.log(`✅ ${queueData.length} factures chargées`);

      renderQueue();
      updateStats();

    } catch (err) {
      console.error('❌ Erreur chargement queue:', err);
      showMessage('error', 'Erreur chargement: ' + err.message);
    } finally {
      showLoading(false);
    }
  }

  // ===== UI - AFFICHAGE =====
  function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'block' : 'none';
    document.getElementById('queueList').style.display = show ? 'none' : 'block';
  }

  function showMessage(type, text, duration = 5000) {
    const container = document.getElementById('messageContainer');
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.textContent = text;

    container.appendChild(msg);

    if (duration > 0) {
      setTimeout(() => msg.remove(), duration);
    }
  }

  function updateStats() {
    const stats = {
      total: queueData.length,
      pending: queueData.filter(q => q.status === 'pending').length,
      ready: queueData.filter(q => q.status === 'validated' || q.status === 'ready').length,
      exported: queueData.filter(q => q.status === 'exported').length
    };

    document.getElementById('totalCount').textContent = stats.total;
    document.getElementById('statPending').textContent = stats.pending;
    document.getElementById('statReady').textContent = stats.ready;
    document.getElementById('statExported').textContent = stats.exported;
  }

  function renderQueue() {
    const container = document.getElementById('queueList');
    const emptyState = document.getElementById('emptyState');

    // Filtres
    const filterStatus = document.getElementById('filterStatus').value;
    const filterYear = document.getElementById('filterYear').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();

    let filtered = queueData;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(q => q.status === filterStatus);
    }

    if (filterYear !== 'all') {
      filtered = filtered.filter(q => q.annee === parseInt(filterYear));
    }

    if (searchQuery) {
      filtered = filtered.filter(q =>
        q.fichier_nom?.toLowerCase().includes(searchQuery) ||
        q.client_detecte?.toLowerCase().includes(searchQuery) ||
        q.client_valide?.toLowerCase().includes(searchQuery)
      );
    }

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
      container.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';

    container.innerHTML = filtered.map(item => `
      <div class="queue-card status-${item.status}">
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(item.fichier_nom || 'Facture sans nom')}</div>
            <div class="card-meta">
              <span>📁 ${escapeHtml(item.client_detecte || item.client_valide || 'Client inconnu')}</span>
              ${item.etablissement_valide ? `<span>🏢 ${escapeHtml(item.etablissement_valide)}</span>` : ''}
              <span>📅 ${item.annee || '—'}</span>
              <span>📄 ${item.services_count || 0} services</span>
            </div>
          </div>
          <span class="badge ${item.status}">
            ${getStatusLabel(item.status)}
          </span>
        </div>

        ${item.status === 'pending' ? `
          <div class="card-stats">
            ✅ ${item.services_auto || 0} détectés auto •
            ⚠️ ${item.services_manual || 0} à valider •
            ❌ ${item.services_excluded || 0} exclus
          </div>
        ` : ''}

        ${item.status === 'exported' ? `
          <div class="card-stats" style="background: #c6f6d5;">
            ✅ Exporté le ${formatDate(item.exported_at)}
          </div>
        ` : ''}

        <div class="card-actions">
          <button class="btn small" onclick="viewFacture('${item.facture_id}')">
            👁️ Voir & Exporter
          </button>

          ${item.status === 'exported' ? `
            <button class="btn small" onclick="openGrid('${item.client_id}', ${item.annee})">
              🔗 Voir grille
            </button>
          ` : ''}

          <button class="btn danger small" onclick="deleteQueue(${item.id})" style="margin-left: auto;">
            🗑️
          </button>
        </div>
      </div>
    `).join('');
  }

  // ===== GESTION FICHIERS =====
  function setupEventListeners() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const btnExtract = document.getElementById('btnExtract');
    const btnRefresh = document.getElementById('btnRefresh');

    // Dropzone click
    dropzone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });

    // Drag & drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    // Bouton extraction
    btnExtract.addEventListener('click', startExtraction);

    // Bouton refresh
    btnRefresh.addEventListener('click', loadQueue);

    // Filtres
    document.getElementById('filterStatus').addEventListener('change', renderQueue);
    document.getElementById('filterYear').addEventListener('change', renderQueue);
    document.getElementById('searchInput').addEventListener('input', renderQueue);
  }

  function handleFiles(files) {
    const filesArray = Array.from(files);

    // Validation
    const validFiles = filesArray.filter(file => {
      if (file.type !== 'application/pdf') {
        showMessage('error', `${file.name}: Format invalide (PDF uniquement)`);
        return false;
      }
      if (file.size > window.APP_CONFIG.MAX_FILE_SIZE) {
        showMessage('error', `${file.name}: Trop volumineux (max 10 MB)`);
        return false;
      }
      return true;
    });

    // LIMITE SUPPRIMÉE - Upload illimité
    // Traitement séquentiel, pas de problème performance

    selectedFiles = selectedFiles.concat(validFiles.map(file => ({
      file: file,
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      status: 'ready',
      progress: 0
    })));

    renderFilesList();
    updateExtractButton();
  }

  function renderFilesList() {
    const container = document.getElementById('filesList');

    if (selectedFiles.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = selectedFiles.map(file => `
      <div class="file-item ${file.status}" id="file-${file.id}">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-status">${getFileStatusIcon(file.status)}</div>
        ${file.status === 'ready' ? `
          <button class="file-remove" onclick="removeFile('${file.id}')">×</button>
        ` : ''}
        ${file.status === 'uploading' || file.status === 'extracting' ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${file.progress}%"></div>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  function updateExtractButton() {
    const btn = document.getElementById('btnExtract');
    const count = selectedFiles.filter(f => f.status === 'ready').length;

    btn.disabled = count === 0;
    document.getElementById('fileCount').textContent = count;
  }

  // ===== EXTRACTION =====
  async function startExtraction() {
    const filesToProcess = selectedFiles.filter(f => f.status === 'ready');

    if (filesToProcess.length === 0) return;

    console.log(`🚀 Extraction ${filesToProcess.length} fichiers...`);
    document.getElementById('btnExtract').disabled = true;

    for (const fileItem of filesToProcess) {
      await extractFile(fileItem);
    }

    // Recharger queue
    await loadQueue();

    // Clear files
    selectedFiles = [];
    renderFilesList();
    updateExtractButton();

    showMessage('success', `✅ ${filesToProcess.length} factures extraites !`);
  }

  async function extractFile(fileItem) {
    console.log(`📄 Extraction: ${fileItem.name}`);

    try {
      // Update status
      updateFileItem(fileItem.id, 'uploading', 10);

      // Upload Supabase Storage
      const timestamp = Date.now();
      const sanitized = fileItem.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `2025/${timestamp}_${sanitized}`;

      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('factures')
        .upload(storagePath, fileItem.file);

      if (uploadError) throw uploadError;

      updateFileItem(fileItem.id, 'uploading', 30);

      // Créer entrée facture
      const { data: { user } } = await supabaseClient.auth.getUser();

      const { data: factureData, error: factureError } = await supabaseClient
        .from('factures')
        .insert({
          fichier_nom: fileItem.name,
          fichier_url: storagePath,
          statut: 'pending',
          user_id: user.id
        })
        .select()
        .single();

      if (factureError) throw factureError;

      updateFileItem(fileItem.id, 'extracting', 50);

      // Extraction PDF
      const arrayBuffer = await fileItem.file.arrayBuffer();
      const fullText = await PDFExtractor.extractPdfTextFromArrayBuffer(arrayBuffer.slice(0));

      updateFileItem(fileItem.id, 'extracting', 70);

      // Parsing
      const fields = ParserModule.parseFieldsRobust(fullText);
      
      // AJOUT : Extraction date_service depuis texte
      // Chercher patterns comme "Décembre 2025", "Service du mois de janvier 2024", etc.
      if (!fields.fields.date_service) {
        const servicePatterns = [
          /(?:prestation|service|transport).*?(?:du|de|le)\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/gi,
          /(?:mois\s+de|période)\s+(\w+\s+\d{4})/gi,
          /(\w+\s+\d{4})\s*(?:L-M-J-V|Lundi|Mardi|Mercredi)/gi, // Ex: "Décembre 2025 L-M-J-V"
          /(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi
        ];
        
        let serviceDate = null;
        for (const pattern of servicePatterns) {
          const match = fullText.match(pattern);
          if (match) {
            serviceDate = match[0];
            // Extraire juste l'année si c'est un mois + année
            const yearMatch = serviceDate.match(/(\d{4})/);
            if (yearMatch) {
              fields.fields.date_service = yearMatch[1]; // Stocker l'année
              console.log(`📅 Date service détectée: "${serviceDate}" → année ${yearMatch[1]}`);
            }
            break;
          }
        }
      }

      const arrayBuffer2 = await fileItem.file.arrayBuffer();
      const pagesXY = await PDFExtractor.extractPdfItemsXY(arrayBuffer2);

      const table = [];
      for (let p = 0; p < pagesXY.length; p++) {
        const extracted = ParserModule.extractTableFromXY(pagesXY[p].items, fullText);
        if (extracted.services.length > 0) {
          table.push(extracted);
        }
      }

      updateFileItem(fileItem.id, 'extracting', 90);

      // Sauvegarder
      await supabaseClient
        .from('factures')
        .update({
          statut: 'extracted',
          texte_ocr: fullText,
          donnees_brutes: {
            fullText,
            fields,
            table
          }
        })
        .eq('id', factureData.id);

      // NOUVEAU : Créer entrée dans queue
      console.log('📥 Création entrée queue...');
      
      const clientDetecte = fields.client_nom || fields.destinataire || 'Client inconnu';
      
      // ===== DÉTECTION ANNÉE - LOGIQUE HIÉRARCHIQUE =====
      let anneeDetectee = null;
      let sourceAnnee = '';
      
      // 1. PRIORITÉ ABSOLUE : Date de service dans les champs parsés
      if (fields.date_service) {
        const yearMatch = fields.date_service.match(/(\d{4})/);
        if (yearMatch) {
          anneeDetectee = parseInt(yearMatch[1]);
          sourceAnnee = 'date_service';
          console.log(`📅 Année depuis DATE SERVICE: ${fields.date_service} → ${anneeDetectee}`);
        }
      }
      
      // 2. SI PAS DE DATE SERVICE : Chercher année dans le texte complet
      if (!anneeDetectee && fullText) {
        // Patterns courants dans factures
        const patterns = [
          /(?:année|annee|exercice|période|periode)\s*:?\s*(\d{4})/gi,
          /(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/gi,
          /(?:prestation|service|transport).*?(\d{4})/gi,
          /\b(20\d{2})\b/g  // Année format 20XX isolée
        ];
        
        let foundYears = [];
        patterns.forEach(pattern => {
          let match;
          const regex = new RegExp(pattern);
          while ((match = regex.exec(fullText)) !== null) {
            const year = parseInt(match[1]);
            if (year >= 2020 && year <= 2030) {  // Années plausibles
              foundYears.push(year);
            }
          }
        });
        
        if (foundYears.length > 0) {
          // Prendre l'année la plus fréquente
          const yearCounts = {};
          foundYears.forEach(y => yearCounts[y] = (yearCounts[y] || 0) + 1);
          const mostFrequent = Object.keys(yearCounts).sort((a, b) => 
            yearCounts[b] - yearCounts[a]
          )[0];
          
          anneeDetectee = parseInt(mostFrequent);
          sourceAnnee = 'texte_facture';
          console.log(`📅 Année depuis TEXTE FACTURE: ${anneeDetectee} (trouvée ${yearCounts[mostFrequent]}x)`);
        }
      }
      
      // 3. FALLBACK : Numéro de facture format FACT-YYMM-XXX
      if (!anneeDetectee && fields.numero_facture) {
        const factMatch = fields.numero_facture.match(/FACT-(\d{2})(\d{2})/i);
        if (factMatch) {
          const yy = parseInt(factMatch[1]);
          // Si yy > 50, supposer 19XX, sinon 20XX
          anneeDetectee = yy > 50 ? 1900 + yy : 2000 + yy;
          sourceAnnee = 'numero_facture';
          console.log(`📅 Année depuis NUMÉRO FACTURE: ${fields.numero_facture} → YY=${yy} → ${anneeDetectee}`);
        }
      }
      
      // 4. DERNIER RECOURS : Année courante
      if (!anneeDetectee) {
        anneeDetectee = new Date().getFullYear();
        sourceAnnee = 'par_defaut';
        console.log(`⚠️ Année PAR DÉFAUT: ${anneeDetectee}`);
      }
      
      console.log(`✅ Année finale: ${anneeDetectee} (source: ${sourceAnnee})`);

      // Compter services
      let servicesCount = 0;
      if (table && Array.isArray(table)) {
        table.forEach(page => {
          if (page.services) servicesCount += page.services.length;
        });
      }

      const { data: queueData, error: queueError } = await supabaseClient
        .from('factures_export_queue')
        .insert({
          facture_id: factureData.id,
          client_detecte: clientDetecte,
          annee: anneeDetectee,
          status: 'pending',
          services_count: servicesCount
        })
        .select()
        .single();

      if (queueError) {
        console.warn('⚠️ Erreur création queue:', queueError);
      } else {
        console.log('✅ Queue créée:', queueData.id);

        // Créer services_mapping
        if (servicesCount > 0 && table) {
          let serviceIndex = 0;
          for (const page of table) {
            if (page.services) {
              for (const service of page.services) {
                serviceIndex++;
                await supabaseClient
                  .from('services_mapping')
                  .insert({
                    queue_id: queueData.id,
                    service_index: serviceIndex,
                    description_orig: service.desc || service.description || '',
                    prix_ht: parseFloat(service.total || service.prix || 0),
                    quantite: parseInt(service.qty || service.quantite || 1),
                    tva: parseFloat(service.tva || 10),
                    status: 'pending',
                    needs_validation: true
                  });
              }
            }
          }
          console.log(`✅ ${serviceIndex} services mappés`);
        }
      }

      updateFileItem(fileItem.id, 'success', 100);

      console.log(`✅ ${fileItem.name} extrait`);

    } catch (err) {
      console.error(`❌ Erreur ${fileItem.name}:`, err);
      updateFileItem(fileItem.id, 'error', 0);
      showMessage('error', `Erreur ${fileItem.name}: ${err.message}`);
    }
  }

  function updateFileItem(fileId, status, progress) {
    const file = selectedFiles.find(f => f.id === fileId);
    if (file) {
      file.status = status;
      file.progress = progress;
      renderFilesList();
    }
  }

  // ===== ACTIONS FACTURES =====
  window.viewFacture = async function(factureId) {
    console.log('👁️ Voir facture:', factureId);
    // Ouvrir modale intégrée
    ModalFacture.open(factureId);
  };

  window.openGrid = function(clientId, year) {
    window.location.href = `tarification.html?client=${clientId}&year=${year}`;
  };

  window.deleteQueue = async function(queueId) {
    if (!confirm('Supprimer cette facture de la file ?')) return;

    try {
      const { error } = await supabaseClient
        .from('factures_export_queue')
        .delete()
        .eq('id', queueId);

      if (error) throw error;

      showMessage('success', '✅ Facture supprimée');
      await loadQueue();

    } catch (err) {
      console.error('❌ Erreur suppression:', err);
      showMessage('error', 'Erreur: ' + err.message);
    }
  };

  window.removeFile = function(fileId) {
    selectedFiles = selectedFiles.filter(f => f.id !== fileId);
    renderFilesList();
    updateExtractButton();
  };

  // ===== HELPERS =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getStatusLabel(status) {
    const labels = {
      'pending': '⏳ En attente',
      'validated': '✅ Validée',
      'ready': '✅ Prête',
      'exported': '📤 Exportée',
      'rejected': '❌ Rejetée'
    };
    return labels[status] || status;
  }

  function getFileStatusIcon(status) {
    const icons = {
      'ready': '📄',
      'uploading': '⏳',
      'extracting': '🔍',
      'success': '✅',
      'error': '❌'
    };
    return icons[status] || '';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // ===== DÉMARRAGE =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

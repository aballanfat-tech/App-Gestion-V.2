/**
 * MODAL FACTURE - Visualisation et édition
 * @version 1.0.0
 * 
 * Modal complète avec 4 onglets réutilisant la logique import-factures
 */

(function(window) {
  'use strict';

  // Variable globale pour sélection services
  window.servicesSelection = window.servicesSelection || new Set();

  let currentFactureId = null;
  let currentData = null;

  // ===== OUVRIR MODALE =====
  async function openFactureModal(factureId) {
    console.log('📄 Ouverture modale facture:', factureId);
    
    currentFactureId = factureId;

    const modal = document.getElementById('modalFacture');
    const overlay = document.getElementById('modalOverlay');

    if (!modal || !overlay) {
      console.error('❌ Éléments modale introuvables');
      return;
    }

    // Afficher modale
    overlay.classList.add('open');
    modal.style.display = 'block';

    // Charger données
    await loadFactureData(factureId);
  }

  // ===== FERMER MODALE =====
  function closeFactureModal() {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalFacture');

    if (overlay) overlay.classList.remove('open');
    if (modal) modal.style.display = 'none';

    currentFactureId = null;
    currentData = null;
  }

  // ===== CHARGER DONNÉES =====
  async function loadFactureData(factureId) {
    try {
      showModalLoading(true);

      const { data, error } = await window.supabaseClient
        .from('factures')
        .select('*')
        .eq('id', factureId)
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error('Facture introuvable');
      }

      currentData = data;

      // Afficher dans modale
      renderFactureModal(data);

    } catch (err) {
      console.error('❌ Erreur chargement facture:', err);
      alert('Erreur chargement: ' + err.message);
      closeFactureModal();
    } finally {
      showModalLoading(false);
    }
  }

  // ===== RENDU MODALE =====
  function renderFactureModal(facture) {
    console.log('🎨 Rendu modal, données facture:', facture);
    
    // Titre
    document.getElementById('modalTitle').textContent = facture.fichier_nom || 'Facture';

    // Onglets - Rendre tous les onglets
    console.log('📝 Rendu onglet Édition...');
    renderEditTab(facture);
    
    console.log('📊 Rendu onglet Tableau...');
    renderTableTab(facture);
    
    console.log('📄 Rendu onglet Texte...');
    renderTextTab(facture);
    
    console.log('🐛 Rendu onglet Debug...');
    renderDebugTab(facture);

    // Activer premier onglet
    console.log('✅ Activation onglet Édition');
    activateTab('edit');
  }

  // ===== ONGLET ÉDITION =====
  function renderEditTab(facture) {
    const container = document.getElementById('tab-edit');  // ID avec tiret
    
    if (!container) {
      console.error('❌ Élément tab-edit introuvable');
      return;
    }
    
    const donneesBrutes = facture.donnees_brutes || {};
    const fields = donneesBrutes.fields || {};

    console.log('📝 Données fields:', fields);
    console.log('📊 Données table:', donneesBrutes.table);

    container.innerHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">📝 Informations Facture</h3>
        
        <div style="display: grid; gap: 16px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Numéro de facture</label>
            <input type="text" class="field" value="${escapeHtml(fields.numero_facture || '')}" />
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Date</label>
            <input type="text" class="field" value="${escapeHtml(fields.date || '')}" />
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Client</label>
            <input type="text" class="field" value="${escapeHtml(fields.client_nom || fields.destinataire || '')}" />
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 600;">Total HT</label>
              <input type="text" class="field" value="${escapeHtml(fields.total_ht || '')}" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 600;">TVA</label>
              <input type="text" class="field" value="${escapeHtml(fields.total_tva || '')}" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 600;">Total TTC</label>
              <input type="text" class="field" value="${escapeHtml(fields.total_ttc || '')}" />
            </div>
          </div>
        </div>

        <h3 style="margin: 24px 0 16px;">📋 Services / Prestations</h3>
        
        <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center;">
          <button class="btn" onclick="ModalFacture.close()">
            ❌ Annuler
          </button>
          <button class="btn success" onclick="ModalFacture.validateAndExport()" style="
            background: var(--success);
            color: white;
            border-color: var(--success);
            font-weight: 600;
          ">
            ✅ Valider & Exporter vers Grille
          </button>
        </div>
      </div>
    `;
    `;
    
    // ===== SYSTÈME SÉLECTION SERVICES =====
    const servicesContainer = document.getElementById('servicesContainer');
    if (servicesContainer && donneesBrutes.table && donneesBrutes.table.length > 0) {
      // Extraire tous les services de toutes les pages
      const allServices = [];
      donneesBrutes.table.forEach(page => {
        if (page.services && Array.isArray(page.services)) {
          page.services.forEach(service => allServices.push(service));
        }
      });
      
      console.log(`📋 ${allServices.length} services extraits`);
      
      // Initialiser sélection
      if (typeof initializeServiceSelection === 'function') {
        initializeServiceSelection(allServices);
      } else {
        console.warn('⚠️ initializeServiceSelection non disponible');
      }
      
      // Générer HTML avec checkboxes
      let servicesHTML = '';
      allServices.forEach((service, index) => {
        if (typeof renderServiceWithCheckbox === 'function') {
          servicesHTML += renderServiceWithCheckbox(service, index);
        } else {
          // Fallback si fonction pas dispo
          servicesHTML += `<div class="service-item">${service.desc || service.description}</div>`;
        }
      });
      
      servicesContainer.innerHTML = servicesHTML;
      
      // Afficher barre de contrôle
      const controlsBar = document.getElementById('selectionControlsBar');
      if (controlsBar) {
        controlsBar.style.display = 'flex';
      }
      
      console.log('✅ Services affichés avec sélection');
    } else {
      console.log('ℹ️ Pas de services à afficher');
    }
  }  // ← Fin de renderEditTab

  function renderServicesTable(tableData) {
    if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
      return '<p style="color: #718096;">Aucun service détecté</p>';
    }

    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
    html += `
      <thead>
        <tr style="background: #f7fafc; border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 8px; text-align: left;">Description</th>
          <th style="padding: 8px; text-align: right;">PU HT</th>
          <th style="padding: 8px; text-align: right;">Qté</th>
          <th style="padding: 8px; text-align: right;">TVA</th>
          <th style="padding: 8px; text-align: right;">Total HT</th>
        </tr>
      </thead>
      <tbody>
    `;

    tableData.forEach(page => {
      if (page.services && Array.isArray(page.services)) {
        page.services.forEach(service => {
          html += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 8px;">${escapeHtml(service.desc || service.description || '')}</td>
              <td style="padding: 8px; text-align: right;">${escapeHtml(service.pu || service.prix || '—')}</td>
              <td style="padding: 8px; text-align: right;">${escapeHtml(service.qty || service.quantite || '1')}</td>
              <td style="padding: 8px; text-align: right;">${escapeHtml(service.tva || '10')}%</td>
              <td style="padding: 8px; text-align: right;">${escapeHtml(service.total || '—')}</td>
            </tr>
          `;
        });
      }
    });

    html += '</tbody></table>';
    return html;
  }

  // ===== ONGLET TABLEAU =====
  function renderTableTab(facture) {
    const container = document.getElementById('tab-table');  // ID avec tiret
    
    if (!container) {
      console.error('❌ Élément tab-table introuvable');
      return;
    }
    
    container.innerHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">📊 Tableau Extrait</h3>
        ${renderServicesTable(facture.donnees_brutes?.table)}
      </div>
    `;
  }

  // ===== ONGLET TEXTE =====
  function renderTextTab(facture) {
    const container = document.getElementById('tab-text');  // ID avec tiret
    
    if (!container) {
      console.error('❌ Élément tab-text introuvable');
      return;
    }
    
    const texte = facture.texte_ocr || facture.donnees_brutes?.fullText || 'Aucun texte disponible';

    container.innerHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">📄 Texte OCR Brut</h3>
        <pre style="
          background: #f7fafc; 
          padding: 16px; 
          border-radius: 6px; 
          overflow: auto; 
          max-height: 500px;
          font-size: 13px;
          line-height: 1.5;
          font-family: 'Courier New', monospace;
          white-space: pre-wrap;
          word-wrap: break-word;
        ">${escapeHtml(texte)}</pre>
      </div>
    `;
  }

  // ===== ONGLET DEBUG =====
  function renderDebugTab(facture) {
    const container = document.getElementById('tab-debug');  // ID avec tiret
    
    if (!container) {
      console.error('❌ Élément tab-debug introuvable');
      return;
    }
    
    const jsonData = {
      id: facture.id,
      fichier_nom: facture.fichier_nom,
      statut: facture.statut,
      donnees_brutes: facture.donnees_brutes,
      created_at: facture.created_at
    };

    container.innerHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">🐛 Debug JSON</h3>
        <pre style="
          background: #1a202c; 
          color: #48bb78;
          padding: 16px; 
          border-radius: 6px; 
          overflow: auto; 
          max-height: 500px;
          font-size: 13px;
          line-height: 1.5;
          font-family: 'Courier New', monospace;
          white-space: pre-wrap;
          word-wrap: break-word;
        ">${JSON.stringify(jsonData, null, 2)}</pre>
      </div>
    `;
  }

  // ===== GESTION ONGLETS =====
  function activateTab(tabName) {
    console.log('🔄 Activation onglet:', tabName);
    
    // Désactiver tous les boutons onglets
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Masquer tous les contenus
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
      content.classList.remove('active');
    });

    // Activer le bouton sélectionné
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      console.log('✅ Bouton activé:', tabName);
    } else {
      console.error('❌ Bouton introuvable:', tabName);
    }

    // Afficher le contenu correspondant
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
      activeContent.style.display = 'block';
      activeContent.classList.add('active');
      console.log('✅ Contenu affiché:', tabName);
    } else {
      console.error('❌ Contenu introuvable:', tabName);
    }
  }

  // Setup listeners onglets
  function setupTabListeners() {
    const buttons = document.querySelectorAll('[data-tab]');
    console.log('🎯 Setup listeners onglets, boutons trouvés:', buttons.length);
    
    buttons.forEach(btn => {
      const tabName = btn.getAttribute('data-tab');
      console.log('📌 Listener ajouté sur onglet:', tabName);
      
      btn.addEventListener('click', () => {
        console.log('🖱️ Clic onglet:', tabName);
        activateTab(tabName);
      });
    });
  }

  // ===== LOADING =====
  function showModalLoading(show) {
    const loader = document.getElementById('modalLoading');
    if (loader) {
      loader.style.display = show ? 'block' : 'none';
    }
  }

  // ===== HELPER =====
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ===== INIT =====
  function init() {
    setupTabListeners();
    console.log('✅ ModalFacture initialisé');
  }

  // ===== VALIDATION & EXPORT =====
  async function validateAndExport() {
    console.log('✅ Validation & Export facture:', currentFactureId);

    try {
      // 1. Récupérer queue_id depuis facture_id
      const { data: queue, error: queueError } = await window.supabaseClient
        .from('factures_export_queue')
        .select('*')
        .eq('facture_id', currentFactureId)
        .single();

      if (queueError || !queue) {
        alert('❌ Cette facture n\'est pas dans la file d\'export');
        return;
      }

      // 2. Récupérer services validés
      const { data: services, error: servicesError } = await window.supabaseClient
        .from('services_mapping')
        .select('*')
        .eq('queue_id', queue.id);

      if (servicesError) throw servicesError;

      if (!services || services.length === 0) {
        alert('❌ Aucun service trouvé pour cette facture');
        return;
      }

      console.log(`📋 ${services.length} services à exporter`);

      // 3. Ouvrir modal sélection client/année
      const selection = await showClientYearSelector(queue.client_detecte, queue.annee);
      
      if (!selection) {
        console.log('❌ Export annulé par utilisateur');
        return;
      }

      const { clientId, year } = selection;

      // 4. Charger grille
      const { data: grille, error: grilleError } = await window.supabaseClient
        .from('grilles')
        .select('*')
        .eq('client_id', clientId)
        .eq('year', year)
        .single();

      if (grilleError || !grille) {
        alert('❌ Grille introuvable pour ce client/année');
        return;
      }

      // 5. Préparer données
      const gridData = grille.data || { destinations: {}, destinations_importees: [] };
      gridData.destinations_importees = gridData.destinations_importees || [];

      // 6. Filtrer services sélectionnés uniquement
      const servicesSelected = [];
      
      // Récupérer sélection depuis variable globale
      if (typeof window.servicesSelection !== 'undefined' && window.servicesSelection.size > 0) {
        console.log(`🔍 Sélection active: ${window.servicesSelection.size} services`);
        
        services.forEach((service, index) => {
          const serviceId = `service-${index}`;
          if (window.servicesSelection.has(serviceId)) {
            servicesSelected.push(service);
          }
        });
      } else {
        console.warn('⚠️ Pas de sélection active, export de tous les services');
        // Sécurité : si pas de sélection, prendre tous
        servicesSelected.push(...services);
      }
      
      // Vérifier qu'au moins 1 service est sélectionné
      if (servicesSelected.length === 0) {
        alert('❌ Aucun service sélectionné.\n\nVeuillez cocher au moins un service à exporter.');
        return;
      }
      
      console.log(`📤 Export de ${servicesSelected.length} / ${services.length} service(s) sélectionné(s)`);
      
      // 7. Ajouter UNIQUEMENT les services sélectionnés dans destinations_importees
      servicesSelected.forEach(service => {
        gridData.destinations_importees.push({
          id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          description: service.description_orig,
          prix_ht: parseFloat(service.prix_ht) || 0,
          quantite: service.quantite || 1,
          tva: service.tva || 10,
          facture: currentData.fichier_nom,
          facture_id: currentFactureId,
          date_import: new Date().toISOString(),
          suggestions: {
            destination: service.destination_detectee || service.destination_validee,
            vehicule: service.vehicule_detecte || service.vehicule_valide,
            confidence: service.confidence_score || 0
          }
        });
      });
      
      console.log('💾 Sauvegarde grille avec imports...');

      // 7. Sauvegarder grille
      const { error: updateError } = await window.supabaseClient
        .from('grilles')
        .update({ 
          data: gridData,
          updated_at: new Date().toISOString()
        })
        .eq('id', grille.id);

      if (updateError) throw updateError;

      // 8. Marquer queue comme exportée
      await window.supabaseClient
        .from('factures_export_queue')
        .update({ 
          status: 'exported',
          exported_at: new Date().toISOString()
        })
        .eq('id', queue.id);

      console.log('✅ Export terminé !');

      // 9. Fermer modal
      closeFactureModal();

      // 10. Confirmation + proposition ouvrir grille
      const message = `✅ ${services.length} services exportés vers la grille !\n\nOuvrir la grille tarifaire maintenant ?`;
      
      if (confirm(message)) {
        window.location.href = `tarification.html?client=${clientId}&year=${year}`;
      } else {
        // Recharger liste pour montrer status "exportée"
        if (window.loadQueue) window.loadQueue();
      }

    } catch (err) {
      console.error('❌ Erreur export:', err);
      alert('Erreur lors de l\'export : ' + err.message);
    }
  }

  // Modal sélection client/année
  async function showClientYearSelector(detectedClient, detectedYear) {
    return new Promise((resolve) => {
      // Créer overlay modal
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 12px;
        width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      `;

      modal.innerHTML = `
        <h3 style="margin: 0 0 16px 0;">📤 Exporter vers Grille Tarifaire</h3>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 600;">Client</label>
          <select id="selectClient" class="field" style="width: 100%;">
            <option value="">Chargement...</option>
          </select>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 4px; font-weight: 600;">Année</label>
          <select id="selectYear" class="field" style="width: 100%;">
            <option value="2024">2024</option>
            <option value="2025" ${detectedYear === 2025 ? 'selected' : ''}>2025</option>
            <option value="2026">2026</option>
          </select>
        </div>

        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn" id="btnCancel">Annuler</button>
          <button class="btn success" id="btnConfirm">✅ Confirmer</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Charger clients
      window.supabaseClient
        .from('clients')
        .select('id, name')
        .order('name')
        .then(({ data: clients }) => {
          const select = document.getElementById('selectClient');
          select.innerHTML = clients.map(c => 
            `<option value="${c.id}" ${c.name === detectedClient ? 'selected' : ''}>${c.name}</option>`
          ).join('');
        });

      // Handlers
      document.getElementById('btnCancel').onclick = () => {
        overlay.remove();
        resolve(null);
      };

      document.getElementById('btnConfirm').onclick = () => {
        const clientId = document.getElementById('selectClient').value;
        const year = parseInt(document.getElementById('selectYear').value);

        if (!clientId) {
          alert('Veuillez sélectionner un client');
          return;
        }

        overlay.remove();
        resolve({ clientId, year });
      };
    });
  }

  // Export global
  window.ModalFacture = {
    open: openFactureModal,
    close: closeFactureModal,
    validateAndExport: validateAndExport,
    init: init
  };

  // Init auto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

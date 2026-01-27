/**
 * MODAL FACTURE - Visualisation et édition
 * @version 1.0.0
 * 
 * Modal complète avec 4 onglets réutilisant la logique import-factures
 */

(function(window) {
  'use strict';

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
    // Titre
    document.getElementById('modalTitle').textContent = facture.fichier_nom || 'Facture';

    // Onglets
    renderEditTab(facture);
    renderTableTab(facture);
    renderTextTab(facture);
    renderDebugTab(facture);

    // Activer premier onglet
    activateTab('edit');
  }

  // ===== ONGLET ÉDITION =====
  function renderEditTab(facture) {
    const container = document.getElementById('tabEdit');
    
    const donneesBrutes = facture.donnees_brutes || {};
    const fields = donneesBrutes.fields || {};

    container.innerHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">📝 Informations Facture</h3>
        
        <div style="display: grid; gap: 16px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Numéro de facture</label>
            <input type="text" class="field" value="${escapeHtml(fields.numero_facture || '')}" readonly />
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Date</label>
            <input type="text" class="field" value="${escapeHtml(fields.date || '')}" readonly />
          </div>

          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 600;">Client</label>
            <input type="text" class="field" value="${escapeHtml(fields.client_nom || fields.destinataire || '')}" readonly />
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 600;">Total HT</label>
              <input type="text" class="field" value="${escapeHtml(fields.total_ht || '')}" readonly />
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 600;">TVA</label>
              <input type="text" class="field" value="${escapeHtml(fields.total_tva || '')}" readonly />
            </div>
            <div>
              <label style="display: block; margin-bottom: 4px; font-weight: 600;">Total TTC</label>
              <input type="text" class="field" value="${escapeHtml(fields.total_ttc || '')}" readonly />
            </div>
          </div>
        </div>

        <h3 style="margin: 24px 0 16px;">📋 Services / Prestations</h3>
        
        <div id="servicesTable">
          ${renderServicesTable(donneesBrutes.table)}
        </div>

        <div style="margin-top: 20px; text-align: right;">
          <button class="btn" onclick="ModalFacture.close()">Fermer</button>
        </div>
      </div>
    `;
  }

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
    const container = document.getElementById('tabTable');
    container.innerHTML = `
      <div style="padding: 20px;">
        <h3 style="margin-bottom: 16px;">📊 Tableau Extrait</h3>
        ${renderServicesTable(facture.donnees_brutes?.table)}
      </div>
    `;
  }

  // ===== ONGLET TEXTE =====
  function renderTextTab(facture) {
    const container = document.getElementById('tabText');
    const texte = facture.texte_ocr || facture.donnees_brutes?.fullText || '';

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
        ">${escapeHtml(texte)}</pre>
      </div>
    `;
  }

  // ===== ONGLET DEBUG =====
  function renderDebugTab(facture) {
    const container = document.getElementById('tabDebug');
    
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
        ">${JSON.stringify(jsonData, null, 2)}</pre>
      </div>
    `;
  }

  // ===== GESTION ONGLETS =====
  function activateTab(tabName) {
    // Désactiver tous
    ['edit', 'table', 'text', 'debug'].forEach(name => {
      const btn = document.querySelector(`[data-tab="${name}"]`);
      const content = document.getElementById(`tab-${name}`);
      
      if (btn) btn.classList.remove('active');
      if (content) content.classList.remove('active');
    });

    // Activer sélectionné
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    const content = document.getElementById(`tab-${tabName}`);
    
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  }

  // Setup listeners onglets
  function setupTabListeners() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
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

  // Export global
  window.ModalFacture = {
    open: openFactureModal,
    close: closeFactureModal,
    init: init
  };

  // Init auto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

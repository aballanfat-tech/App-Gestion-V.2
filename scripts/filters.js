/**
 * Filter Manager - Gestion tri, filtres et pagination
 * @version 1.0.0
 */

(function(window) {
  'use strict';

  const state = {
    // Filtres
    searchText: '',
    statusFilter: 'all',
    dateFrom: null,
    dateTo: null,
    clientFilter: '',
    
    // Tri
    sortBy: 'created_at',
    sortOrder: 'desc',
    
    // Pagination
    currentPage: 1,
    perPage: 20
  };

  /**
   * Appliquer tous les filtres
   */
  function applyFilters(factures) {
    let filtered = [...factures];
    
    // 1. Recherche texte (nom fichier)
    if (state.searchText) {
      const search = state.searchText.toLowerCase();
      filtered = filtered.filter(f => 
        (f.fileName && f.fileName.toLowerCase().includes(search)) ||
        (f.name && f.name.toLowerCase().includes(search))
      );
    }
    
    // 2. Filtre statut
    if (state.statusFilter && state.statusFilter !== 'all') {
      filtered = filtered.filter(f => f.status === state.statusFilter);
    }
    
    // 3. Filtre dates (si disponible dans données)
    if (state.dateFrom) {
      filtered = filtered.filter(f => {
        const factureDate = f.date_facture || f.createdAt;
        return factureDate && new Date(factureDate) >= new Date(state.dateFrom);
      });
    }
    
    if (state.dateTo) {
      filtered = filtered.filter(f => {
        const factureDate = f.date_facture || f.createdAt;
        return factureDate && new Date(factureDate) <= new Date(state.dateTo);
      });
    }
    
    // 4. Filtre client (si disponible)
    if (state.clientFilter) {
      const client = state.clientFilter.toLowerCase();
      filtered = filtered.filter(f => 
        f.client_nom && f.client_nom.toLowerCase().includes(client)
      );
    }
    
    return filtered;
  }

  /**
   * Trier factures
   */
  function sortFactures(factures) {
    const sorted = [...factures];
    const order = state.sortOrder === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
      let valA, valB;
      
      switch(state.sortBy) {
        case 'fileName':
          valA = (a.fileName || a.name || '').toLowerCase();
          valB = (b.fileName || b.name || '').toLowerCase();
          break;
        case 'status':
          valA = a.status || '';
          valB = b.status || '';
          break;
        case 'size':
          valA = a.size || 0;
          valB = b.size || 0;
          break;
        case 'date_facture':
          valA = new Date(a.date_facture || a.createdAt || 0);
          valB = new Date(b.date_facture || b.createdAt || 0);
          break;
        case 'created_at':
        default:
          valA = new Date(a.createdAt || 0);
          valB = new Date(b.createdAt || 0);
      }
      
      if (valA < valB) return -1 * order;
      if (valA > valB) return 1 * order;
      return 0;
    });
    
    return sorted;
  }

  /**
   * Paginer factures
   */
  function paginateFactures(factures) {
    const start = (state.currentPage - 1) * state.perPage;
    const end = start + state.perPage;
    
    return {
      items: factures.slice(start, end),
      totalItems: factures.length,
      totalPages: Math.ceil(factures.length / state.perPage),
      currentPage: state.currentPage,
      perPage: state.perPage,
      start: start + 1,
      end: Math.min(end, factures.length)
    };
  }

  /**
   * Traiter factures (filtre + tri + pagination)
   */
  function processFactures(factures) {
    let result = applyFilters(factures);
    result = sortFactures(result);
    return paginateFactures(result);
  }

  /**
   * Mettre à jour un filtre
   */
  function setFilter(key, value) {
    if (state.hasOwnProperty(key)) {
      state[key] = value;
      
      // Reset page si changement filtre
      if (key !== 'currentPage' && key !== 'sortBy' && key !== 'sortOrder') {
        state.currentPage = 1;
      }
    }
  }

  /**
   * Réinitialiser tous les filtres
   */
  function resetFilters() {
    state.searchText = '';
    state.statusFilter = 'all';
    state.dateFrom = null;
    state.dateTo = null;
    state.clientFilter = '';
    state.currentPage = 1;
  }

  /**
   * Export CSV des factures filtrées
   */
  function exportToCSV(factures) {
    const headers = ['Nom', 'Statut', 'Date', 'Client', 'Montant TTC', 'ID'];
    const rows = factures.map(f => [
      f.fileName || f.name || '',
      f.status || '',
      f.date_facture || f.createdAt || '',
      f.client_nom || '',
      f.total_ttc || '',
      f.id || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `factures_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }

  /**
   * Obtenir état actuel
   */
  function getState() {
    return { ...state };
  }

  // Export API publique
  window.FilterManager = {
    processFactures,
    setFilter,
    resetFilters,
    exportToCSV,
    getState
  };

})(window);

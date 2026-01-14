/**
 * State Management - Module Extraction Factures
 * 
 * Gestion centralisée de l'état de l'application
 * Pattern: Single source of truth
 * 
 * @module state
 * @version 2.7.0
 */

(function(window) {
  'use strict';

  /**
   * État global de l'application
   * 
   * @type {Object}
   * @property {Array} files - Liste des fichiers (locaux + cloud)
   * @property {Object|null} user - Utilisateur connecté
   * @property {boolean} sessionOk - Session Supabase valide
   * @property {Object|null} viewerData - Données facture actuellement visualisée
   * @property {string|null} viewerFactureId - ID facture en cours d'édition
   */
  const state = {
    files: [],
    user: null,
    sessionOk: false,
    viewerData: null,
    viewerFactureId: null,
    viewerRawText: '',
    viewerLines: []
  };

  /**
   * Listeners pour changements d'état
   * Pattern: Observer
   */
  const listeners = {
    filesChange: [],
    userChange: [],
    viewerChange: []
  };

  /**
   * Ajouter un listener pour changements
   * 
   * @param {string} event - Nom de l'événement ('filesChange', 'userChange', 'viewerChange')
   * @param {Function} callback - Fonction à appeler lors du changement
   * 
   * @example
   * StateManager.on('filesChange', function(files) {
   *   console.log('Files updated:', files);
   * });
   */
  function on(event, callback) {
    if(listeners[event]) {
      listeners[event].push(callback);
    }
  }

  /**
   * Notifier tous les listeners d'un événement
   * 
   * @param {string} event - Nom de l'événement
   * @param {*} data - Données à passer aux listeners
   * @private
   */
  function notify(event, data) {
    if(listeners[event]) {
      listeners[event].forEach(function(callback) {
        try {
          callback(data);
        } catch(e) {
          console.error('Listener error:', e);
        }
      });
    }
  }

  /**
   * Mettre à jour la liste des fichiers
   * 
   * @param {Array} newFiles - Nouvelle liste de fichiers
   */
  function setFiles(newFiles) {
    state.files = newFiles;
    notify('filesChange', state.files);
  }

  /**
   * Ajouter des fichiers à la liste
   * 
   * @param {Array} filesToAdd - Fichiers à ajouter
   */
  function addFiles(filesToAdd) {
    state.files = state.files.concat(filesToAdd);
    notify('filesChange', state.files);
  }

  /**
   * Mettre à jour un fichier dans la liste
   * 
   * @param {string} fileName - Nom du fichier à mettre à jour
   * @param {Object} updates - Propriétés à mettre à jour
   */
  function updateFile(fileName, updates) {
    state.files = state.files.map(function(f) {
      if(f.fileName === fileName) {
        return Object.assign({}, f, updates);
      }
      return f;
    });
    notify('filesChange', state.files);
  }

  /**
   * Supprimer un fichier de la liste
   * 
   * @param {string} fileName - Nom du fichier à supprimer
   */
  function removeFile(fileName) {
    state.files = state.files.filter(function(f) {
      return f.fileName !== fileName;
    });
    notify('filesChange', state.files);
  }

  /**
   * Vider la liste des fichiers
   */
  function clearFiles() {
    state.files = [];
    notify('filesChange', state.files);
  }

  /**
   * Récupérer la liste des fichiers
   * 
   * @returns {Array} Liste des fichiers
   */
  function getFiles() {
    return state.files;
  }

  /**
   * Mettre à jour l'utilisateur connecté
   * 
   * @param {Object|null} user - Objet utilisateur Supabase ou null
   */
  function setUser(user) {
    state.user = user;
    state.sessionOk = !!user;
    notify('userChange', user);
  }

  /**
   * Récupérer l'utilisateur connecté
   * 
   * @returns {Object|null} Utilisateur ou null si non connecté
   */
  function getUser() {
    return state.user;
  }

  /**
   * Vérifier si la session est valide
   * 
   * @returns {boolean} true si session valide
   */
  function isSessionOk() {
    return state.sessionOk;
  }

  /**
   * Mettre à jour les données du viewer
   * 
   * @param {Object} data - Données facture
   * @param {string} factureId - ID facture
   * @param {string} rawText - Texte brut OCR
   */
  function setViewerData(data, factureId, rawText) {
    state.viewerData = data;
    state.viewerFactureId = factureId;
    state.viewerRawText = rawText || '';
    notify('viewerChange', {
      data: data,
      factureId: factureId,
      rawText: rawText
    });
  }

  /**
   * Récupérer les données du viewer
   * 
   * @returns {Object} Objet contenant data, factureId, rawText
   */
  function getViewerData() {
    return {
      data: state.viewerData,
      factureId: state.viewerFactureId,
      rawText: state.viewerRawText
    };
  }

  /**
   * Mettre à jour les lignes du viewer
   * 
   * @param {Array} lines - Lignes éditées
   */
  function setViewerLines(lines) {
    state.viewerLines = lines;
  }

  /**
   * Récupérer les lignes du viewer
   * 
   * @returns {Array} Lignes éditées
   */
  function getViewerLines() {
    return state.viewerLines;
  }

  /**
   * Réinitialiser le viewer
   */
  function clearViewer() {
    state.viewerData = null;
    state.viewerFactureId = null;
    state.viewerRawText = '';
    state.viewerLines = [];
    notify('viewerChange', null);
  }

  /**
   * Exporter l'état complet (pour debug)
   * 
   * @returns {Object} État complet
   */
  function exportState() {
    return {
      files: state.files,
      user: state.user ? { id: state.user.id, email: state.user.email } : null,
      sessionOk: state.sessionOk,
      viewerFactureId: state.viewerFactureId,
      viewerLinesCount: state.viewerLines.length
    };
  }

  // Export API publique
  window.StateManager = {
    // Files
    setFiles: setFiles,
    addFiles: addFiles,
    updateFile: updateFile,
    removeFile: removeFile,
    clearFiles: clearFiles,
    getFiles: getFiles,
    
    // User
    setUser: setUser,
    getUser: getUser,
    isSessionOk: isSessionOk,
    
    // Viewer
    setViewerData: setViewerData,
    getViewerData: getViewerData,
    setViewerLines: setViewerLines,
    getViewerLines: getViewerLines,
    clearViewer: clearViewer,
    
    // Events
    on: on,
    
    // Debug
    exportState: exportState
  };

})(window);

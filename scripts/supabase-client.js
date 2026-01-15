/**
 * Supabase Client Module - Module Extraction Factures
 * 
 * Wrapper autour de Supabase JS Client
 * Gère : Auth, Storage (factures), Database (CRUD factures)
 * 
 * @module supabase-client
 * @version 2.7.0
 * @requires @supabase/supabase-js
 */

(function(window) {
  'use strict';

  let supabaseClient = null;
  let keepAliveTimer = null;

  /**
   * Initialiser le client Supabase
   * Utilise configuration depuis window.SUPABASE_CONFIG
   * 
   * @returns {Promise<Object>} Client Supabase initialisé
   * 
   * @example
   * const client = await SupabaseClient.init();
   * console.log("Supabase prêt");
   * 
   * @throws {Error} Si config manquante ou supabase.createClient indisponible
   */
  async function init() {
    if(supabaseClient) return supabaseClient;
    
    if(!window.SUPABASE_CONFIG) {
      throw new Error("SUPABASE_CONFIG manquant. Charger config.js d'abord.");
    }
    
    if(typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      throw new Error("Supabase JS Client non chargé. Inclure CDN script.");
    }
    
    const config = window.SUPABASE_CONFIG;
    supabaseClient = window.supabase.createClient(config.url, config.anonKey, config.options || {});
    
    return supabaseClient;
  }

  /**
   * Récupérer le client Supabase (doit être initialisé)
   * 
   * @returns {Object} Client Supabase
   * @throws {Error} Si non initialisé
   */
  function getClient() {
    if(!supabaseClient) {
      throw new Error("Supabase non initialisé. Appeler init() d'abord.");
    }
    return supabaseClient;
  }

  /* ===========================
     AUTHENTIFICATION
     =========================== */

  /**
   * Connexion utilisateur (email + password)
   * 
   * @param {string} email - Email utilisateur
   * @param {string} password - Mot de passe
   * @returns {Promise<Object>} { user, session, error }
   * 
   * @example
   * const result = await SupabaseClient.signIn("user@example.com", "password123");
   * if(result.error) {
   *   console.error("Erreur connexion:", result.error.message);
   * } else {
   *   console.log("Connecté:", result.user.email);
   * }
   */
  async function signIn(email, password) {
    const client = getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    
    return {
      user: data?.user || null,
      session: data?.session || null,
      error: error
    };
  }

  /**
   * Déconnexion utilisateur
   * 
   * @returns {Promise<Object>} { error }
   */
  async function signOut() {
    const client = getClient();
    const { error } = await client.auth.signOut();
    
    return { error };
  }

  /**
   * Récupérer utilisateur actuellement connecté
   * 
   * @returns {Promise<Object>} { user, error }
   * 
   * @example
   * const result = await SupabaseClient.getUser();
   * if(result.user) {
   *   console.log("Connecté:", result.user.email);
   * } else {
   *   console.log("Non connecté");
   * }
   */
  async function getUser() {
    const client = getClient();
    const { data, error } = await client.auth.getUser();
    
    return {
      user: data?.user || null,
      error: error
    };
  }

  /**
   * S'abonner aux changements d'état auth
   * 
   * @param {Function} callback - Fonction appelée lors changement (event, session)
   * @returns {Object} Subscription object (pour unsubscribe)
   * 
   * @example
   * const subscription = SupabaseClient.onAuthChange((event, session) => {
   *   console.log("Auth event:", event, session?.user?.email);
   * });
   * 
   * // Plus tard : subscription.unsubscribe()
   */
  function onAuthChange(callback) {
    const client = getClient();
    const { data } = client.auth.onAuthStateChange(callback);
    return data;
  }

  /**
   * Démarrer keep-alive session (refresh toutes les 4 minutes)
   * Empêche timeout session Supabase
   * 
   * @param {number} [interval=240000] - Intervalle en ms (défaut: 4 min)
   * 
   * @example
   * SupabaseClient.startKeepAlive();
   */
  function startKeepAlive(interval) {
    interval = interval || (window.APP_CONFIG?.KEEPALIVE_INTERVAL || 240000);
    
    if(keepAliveTimer) clearInterval(keepAliveTimer);
    
    keepAliveTimer = setInterval(async function() {
      try {
        const client = getClient();
        await client.auth.getUser();
      } catch(e) {
        console.warn("Keep-alive error:", e);
      }
    }, interval);
  }

  /**
   * Arrêter keep-alive
   */
  function stopKeepAlive() {
    if(keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  /* ===========================
     STORAGE (Factures PDFs)
     =========================== */

  /**
   * Uploader fichier PDF dans Storage
   * 
   * @param {File} file - Fichier PDF
   * @param {string} path - Chemin destination (ex: "2025/facture_001.pdf")
   * @param {Object} [options] - Options upload { upsert, cacheControl, contentType }
   * @returns {Promise<Object>} { data: { path }, error }
   * 
   * @example
   * const file = document.getElementById("fileInput").files[0];
   * const path = "2025/" + Date.now() + "_" + file.name;
   * const result = await SupabaseClient.uploadFile(file, path);
   * 
   * if(result.error) {
   *   console.error("Erreur upload:", result.error.message);
   * } else {
   *   console.log("Uploadé:", result.data.path);
   * }
   */
  async function uploadFile(file, path, options) {
    const client = getClient();
    const bucket = window.APP_CONFIG?.STORAGE_BUCKET || "factures";
    
    options = options || {
      upsert: false,
      cacheControl: "3600",
      contentType: "application/pdf"
    };
    
    const { data, error } = await client.storage.from(bucket).upload(path, file, options);
    
    return { data, error };
  }

  /**
   * Créer URL signée temporaire pour accès fichier
   * 
   * @param {string} path - Chemin fichier
   * @param {number} [expiresIn=600] - Durée validité en secondes (défaut: 10 min)
   * @returns {Promise<Object>} { signedUrl, error }
   * 
   * @example
   * const result = await SupabaseClient.createSignedUrl("2025/facture.pdf", 600);
   * if(result.signedUrl) {
   *   window.open(result.signedUrl);
   * }
   */
  async function createSignedUrl(path, expiresIn) {
    const client = getClient();
    const bucket = window.APP_CONFIG?.STORAGE_BUCKET || "factures";
    expiresIn = expiresIn || 600;
    
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
    
    return {
      signedUrl: data?.signedUrl || null,
      error: error
    };
  }

  /**
   * Supprimer fichier du Storage
   * 
   * @param {string} path - Chemin fichier
   * @returns {Promise<Object>} { data, error }
   */
  async function deleteFile(path) {
    const client = getClient();
    const bucket = window.APP_CONFIG?.STORAGE_BUCKET || "factures";
    
    const { data, error } = await client.storage.from(bucket).remove([path]);
    
    return { data, error };
  }

  /* ===========================
     DATABASE (Table factures)
     =========================== */

  /**
   * Créer nouvelle facture en base
   * 
   * @param {Object} facture - Données facture
   * @param {string} facture.fichier_url - Path Storage
   * @param {string} facture.fichier_nom - Nom fichier original
   * @param {string} [facture.statut='pending'] - Statut initial
   * @param {string} [facture.format_facture='auto'] - Format détecté
   * @returns {Promise<Object>} { data: facture, error }
   * 
   * @example
   * const result = await SupabaseClient.createFacture({
   *   fichier_url: "2025/facture.pdf",
   *   fichier_nom: "facture.pdf",
   *   statut: "pending"
   * });
   * console.log("ID:", result.data.id);
   */
  async function createFacture(facture) {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
  const { data, error } = await client
  .from(table)
  .upsert(facture, {
    onConflict: 'fichier_nom,user_id',
    ignoreDuplicates: false
  })
  .select("id,created_at")
  .single();
    return { data, error };
  }

  /**
   * Mettre à jour facture existante
   * 
   * @param {string} id - UUID facture
   * @param {Object} updates - Champs à mettre à jour
   * @returns {Promise<Object>} { data, error }
   * 
   * @example
   * await SupabaseClient.updateFacture(factureId, {
   *   statut: "extracted",
   *   texte_ocr: "...",
   *   donnees_brutes: { fields: {...}, table: [...] }
   * });
   */
  async function updateFacture(id, updates) {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
    const { data, error } = await client.from(table).update(updates).eq("id", id);
    
    return { data, error };
  }

  /**
   * Récupérer facture par ID
   * 
   * @param {string} id - UUID facture
   * @returns {Promise<Object>} { data: facture, error }
   * 
   * @example
   * const result = await SupabaseClient.getFacture(factureId);
   * if(result.data) {
   *   console.log("Numéro:", result.data.numero_facture);
   * }
   */
  async function getFacture(id) {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
    const { data, error } = await client.from(table).select("*").eq("id", id).single();
    
    return { data, error };
  }

  /**
   * Lister toutes les factures (avec pagination)
   * 
   * @param {Object} [options] - Options { limit, offset, orderBy, order }
   * @returns {Promise<Object>} { data: factures[], count, error }
   * 
   * @example
   * const result = await SupabaseClient.listFactures({
   *   limit: 50,
   *   offset: 0,
   *   orderBy: "created_at",
   *   order: "desc"
   * });
   * console.log("Factures:", result.data.length);
   */
  async function listFactures(options) {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
    options = options || {};
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const orderBy = options.orderBy || "created_at";
    const order = options.order || "desc";
    
    let query = client.from(table).select("*", { count: "exact" });
    
    query = query.order(orderBy, { ascending: order === "asc" });
    query = query.range(offset, offset + limit - 1);
    
    const { data, error, count } = await query;
    
    return { data, count, error };
  }

  /**
   * Supprimer facture (soft delete recommandé)
   * 
   * @param {string} id - UUID facture
   * @returns {Promise<Object>} { data, error }
   */
  async function deleteFacture(id) {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
    // Soft delete (recommandé)
    const { data, error } = await client.from(table).update({ statut: "deleted" }).eq("id", id);
    
    // Hard delete (décommenter si besoin)
    // const { data, error } = await client.from(table).delete().eq("id", id);
    
    return { data, error };
  }

  /**
   * Rechercher factures par critères
   * 
   * @param {Object} filters - Filtres { statut, client_nom, date_min, date_max }
   * @returns {Promise<Object>} { data: factures[], error }
   * 
   * @example
   * const result = await SupabaseClient.searchFactures({
   *   statut: "extracted",
   *   client_nom: "OVAL"
   * });
   */
  async function searchFactures(filters) {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
    let query = client.from(table).select("*");
    
    if(filters.statut) {
      query = query.eq("statut", filters.statut);
    }
    
    if(filters.client_nom) {
      query = query.ilike("client_nom", "%" + filters.client_nom + "%");
    }
    
    if(filters.date_min) {
      query = query.gte("date_facture", filters.date_min);
    }
    
    if(filters.date_max) {
      query = query.lte("date_facture", filters.date_max);
    }
    
    query = query.order("created_at", { ascending: false });
    
    const { data, error } = await query;
    
    return { data, error };
  }

  /**
   * Récupérer toutes les factures de l'utilisateur connecté
   */
  async function getFactures() {
    const client = getClient();
    const table = window.APP_CONFIG?.TABLE_FACTURES || "factures";
    
    // Récupérer user actuel
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      return { data: [], error: new Error("Non connecté") };
    }
    
    console.log("📥 Chargement factures user:", user.id);
    
    // Charger factures de cet user
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    console.log(`📊 ${data?.length || 0} factures trouvées`);
    
    return { data: data || [], error };
  }
  
  // Export API publique
  window.SupabaseClient = {
    // Init
    init: init,
    getClient: getClient,
    
    // Auth
    signIn: signIn,
    signOut: signOut,
    getUser: getUser,
    onAuthChange: onAuthChange,
    startKeepAlive: startKeepAlive,
    stopKeepAlive: stopKeepAlive,
    
    // Storage
    uploadFile: uploadFile,
    createSignedUrl: createSignedUrl,
    deleteFile: deleteFile,
    
    // Database
    createFacture: createFacture,
    updateFacture: updateFacture,
    getFacture: getFacture,
    listFactures: listFactures,
    deleteFacture: deleteFacture,
    searchFactures: searchFactures,
    getFactures: getFactures 
  };

})(window);

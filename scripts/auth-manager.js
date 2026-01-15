/**
 * Auth Manager - Gestion centralisée authentification et redirections
 * Module Plateforme Ballanfat v2.7.0
 * 
 * Fonctionnalités :
 * - Vérification session
 * - Gestion redirections (login ↔ dashboard)
 * - Gestion permissions utilisateurs
 * - Keep-alive session
 */

const AuthManager = {
  // État
  currentUser: null,
  userPermissions: [],
  keepAliveInterval: null,
  
  /**
   * Initialiser Auth Manager
   * @returns {Promise<Object>} User ou null
   */
  async init() {
    console.log("🔐 Initialisation Auth Manager");
    
    // Vérifier si Supabase chargé
    if (!window.supabaseClient) {
      console.error("❌ Supabase client non disponible");
      return null;
    }
    
    // Récupérer session actuelle
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    
    if (error) {
      console.error("❌ Erreur récupération session:", error);
      return null;
    }
    
    if (session) {
      this.currentUser = session.user;
      await this.loadUserPermissions();
      this.startKeepAlive();
      console.log("✅ Utilisateur connecté:", this.currentUser.email);
      return this.currentUser;
    }
    
    console.log("ℹ️ Pas de session active");
    return null;
  },
  
  /**
   * Connexion utilisateur
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async signIn(email, password) {
    console.log("🔑 Tentative connexion:", email);
    
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      console.error("❌ Erreur connexion:", error.message);
      return { success: false, error: error.message };
    }
    
    this.currentUser = data.user;
    await this.loadUserPermissions();
    this.startKeepAlive();
    
    console.log("✅ Connexion réussie:", this.currentUser.email);
    return { success: true, user: this.currentUser };
  },
  
  /**
   * Déconnexion utilisateur
   */
  async signOut() {
    console.log("🚪 Déconnexion...");
    
    this.stopKeepAlive();
    
    await window.supabaseClient.auth.signOut();
    
    this.currentUser = null;
    this.userPermissions = [];
    
    // Rediriger vers login
    window.location.href = "login.html";
  },
  
  /**
   * Charger permissions utilisateur depuis DB
   */
  async loadUserPermissions() {
    if (!this.currentUser) return;
    
    try {
      // Récupérer profil utilisateur avec rôle
      const { data, error } = await window.supabaseClient
        .from('user_profiles')
        .select('role, permissions')
        .eq('user_id', this.currentUser.id)
        .single();
      
      if (error) {
        // Si table user_profiles n'existe pas encore, utiliser rôle par défaut
        console.warn("⚠️ Table user_profiles non trouvée, rôle par défaut: editor");
        this.userPermissions = this.getDefaultPermissions('editor');
        return;
      }
      
      if (data) {
        this.userPermissions = data.permissions || this.getDefaultPermissions(data.role || 'viewer');
      }
    } catch (err) {
      console.warn("⚠️ Erreur chargement permissions, utilisation défaut:", err);
      this.userPermissions = this.getDefaultPermissions('editor');
    }
  },
  
  /**
   * Obtenir permissions par défaut selon rôle
   * @param {string} role - admin, editor, viewer
   * @returns {Array<string>}
   */
  getDefaultPermissions(role) {
    const permissions = {
      admin: [
        'extraction_factures.view',
        'extraction_factures.edit',
        'extraction_factures.delete',
        'grille_tarifaire.view',
        'grille_tarifaire.edit',
        'paye_chauffeurs.view',
        'paye_chauffeurs.edit',
        'tresorerie.view',
        'tresorerie.edit',
        'admin.users',
        'admin.settings'
      ],
      editor: [
        'extraction_factures.view',
        'extraction_factures.edit',
        'grille_tarifaire.view',
        'grille_tarifaire.edit',
        'paye_chauffeurs.view',
        'paye_chauffeurs.edit',
        'tresorerie.view',
        'tresorerie.edit'
      ],
      viewer: [
        'extraction_factures.view',
        'grille_tarifaire.view',
        'paye_chauffeurs.view',
        'tresorerie.view'
      ]
    };
    
    return permissions[role] || permissions.viewer;
  },
  
  /**
   * Vérifier si utilisateur a permission
   * @param {string} permission - ex: 'extraction_factures.edit'
   * @returns {boolean}
   */
  hasPermission(permission) {
    if (!this.currentUser) return false;
    
    // Admin a toutes les permissions
    if (this.userPermissions.includes('admin.users')) return true;
    
    return this.userPermissions.includes(permission);
  },
  
  /**
   * Vérifier si utilisateur a accès à un module
   * @param {string} module - ex: 'extraction_factures'
   * @returns {boolean}
   */
  canAccessModule(module) {
    const viewPermission = `${module}.view`;
    return this.hasPermission(viewPermission);
  },
  
  /**
   * Protéger une page (rediriger si non connecté)
   * @param {string} requiredPermission - Permission requise (optionnel)
   */
  async protectPage(requiredPermission = null) {
    const user = await this.init();
    
    if (!user) {
      console.warn("⚠️ Utilisateur non connecté, redirection login");
      window.location.href = "login.html";
      return false;
    }
    
    if (requiredPermission && !this.hasPermission(requiredPermission)) {
      console.error("❌ Permission refusée:", requiredPermission);
      alert("Vous n'avez pas accès à cette page.");
      window.location.href = "dashboard.html";
      return false;
    }
    
    return true;
  },
  
  /**
   * Rediriger vers dashboard si déjà connecté (pour page login)
   */
  async redirectIfAuthenticated() {
    const user = await this.init();
    
    if (user) {
      console.log("✅ Déjà connecté, redirection dashboard");
      window.location.href = "dashboard.html";
      return true;
    }
    
    return false;
  },
  
  /**
   * Keep-alive session (refresh token toutes les 4 min)
   */
  startKeepAlive() {
    if (this.keepAliveInterval) return;
    
    this.keepAliveInterval = setInterval(async () => {
      const { data, error } = await window.supabaseClient.auth.refreshSession();
      if (error) {
        console.error("⚠️ Erreur refresh session:", error);
        this.signOut();
      } else {
        console.log("🔄 Session rafraîchie");
      }
    }, 4 * 60 * 1000); // 4 minutes
  },
  
  /**
   * Arrêter keep-alive
   */
  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  },
  
  /**
   * Obtenir informations utilisateur
   * @returns {Object|null}
   */
  getUser() {
    return this.currentUser;
  },
  
  /**
   * Obtenir email utilisateur
   * @returns {string}
   */
  getUserEmail() {
    return this.currentUser?.email || '';
  },
  
  /**
   * Obtenir rôle utilisateur
   * @returns {string}
   */
  getUserRole() {
    if (this.hasPermission('admin.users')) return 'admin';
    if (this.hasPermission('extraction_factures.edit')) return 'editor';
    return 'viewer';
  }
};

// Export global
window.AuthManager = AuthManager;

console.log("✅ Auth Manager chargé");

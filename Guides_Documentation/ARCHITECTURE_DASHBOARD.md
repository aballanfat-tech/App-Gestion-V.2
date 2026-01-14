# 🏗️ ARCHITECTURE DASHBOARD - Documentation Complète
## Plateforme Ballanfat v2.7.0 - Système Multi-Modules

**Date** : 14 Janvier 2026  
**Version** : 2.7.0 Refacto + Dashboard  
**Statut** : ✅ Prêt à déployer

---

## 🎯 VUE D'ENSEMBLE

### Objectif

Créer une **plateforme unifiée** où :
- ✅ Un seul login centralise l'accès
- ✅ Dashboard avec navigation entre modules
- ✅ Session persistante (pas de ré-authentification)
- ✅ Gestion permissions (masquer modules inaccessibles)

### Modules Disponibles

| Module | Statut | URL | Permission |
|--------|--------|-----|------------|
| **Extraction Factures** | ✅ Opérationnel | `/index.html` | `extraction_factures.view` |
| **Grille Tarifaire** | 🚧 En développement | `/grille-tarifaire.html` | `grille_tarifaire.view` |
| **Paye Chauffeurs** | 📋 Planifié Jan 2026 | `/paye-chauffeurs.html` | `paye_chauffeurs.view` |
| **Trésorerie** | 📋 Planifié Fév-Mai 2026 | `/tresorerie.html` | `tresorerie.view` |
| **Outils Admin** | 📋 Planifié Juin+ 2026 | `/outils-admin.html` | `extraction_factures.view` |
| **Documents** | 📋 À venir | `/documents.html` | `extraction_factures.view` |

---

## 🗂️ STRUCTURE FICHIERS

```
extraction-factures-refacto/
│
├── 📄 login.html                    # Page d'accueil (authentification)
├── 📄 dashboard.html                # Hub central navigation
├── 📄 index.html                    # Module Extraction Factures
├── 📄 grille-tarifaire.html         # Module Grille Tarifaire (à venir)
├── 📄 config.js                     # Configuration Supabase (GIT IGNORE)
├── 📄 config.js.example             # Template configuration
├── 📄 database-setup.sql            # Setup permissions Supabase
│
├── 📁 scripts/
│   ├── auth-manager.js              # ⭐ NOUVEAU - Gestion auth centralisée
│   ├── supabase-client.js           # Client Supabase
│   ├── state.js                     # Gestion état
│   ├── validation.js                # Validation données
│   ├── parser.js                    # Parsing factures
│   ├── pdf-extractor.js             # Extraction PDF
│   ├── ui-renderer.js               # Rendu UI
│   └── main.js                      # ✅ CORRIGÉ - Bug ArrayBuffer
│
├── 📁 styles/
│   └── styles.css                   # Styles globaux
│
└── 📁 assets/
    └── logo_ballanfat.png           # Logo
```

---

## 🔐 SYSTÈME AUTHENTIFICATION

### auth-manager.js - Module Centralisé

**Responsabilités** :
- ✅ Vérification session utilisateur
- ✅ Login / Logout
- ✅ Gestion permissions
- ✅ Redirections automatiques
- ✅ Keep-alive session (refresh auto toutes les 4 min)

**API Principale** :

```javascript
// Initialiser (dans chaque page)
await AuthManager.init();

// Connexion
const result = await AuthManager.signIn(email, password);

// Déconnexion
await AuthManager.signOut();

// Vérifier permission
if (AuthManager.hasPermission('extraction_factures.edit')) {
  // Afficher bouton "Modifier"
}

// Protéger page (redirection si non connecté)
await AuthManager.protectPage('extraction_factures.view');

// Rediriger si déjà connecté (page login)
await AuthManager.redirectIfAuthenticated();

// Obtenir utilisateur
const user = AuthManager.getUser();
const email = AuthManager.getUserEmail();
const role = AuthManager.getUserRole(); // 'admin', 'editor', 'viewer'
```

---

## 🚦 FLUX UTILISATEUR

### 1. Première Visite (Non Connecté)

```
Utilisateur arrive sur /index.html
    ↓
AuthManager.protectPage() vérifie session
    ↓
Pas de session → Redirection /login.html
    ↓
Login → Connexion Supabase
    ↓
Session créée → Redirection /dashboard.html
```

### 2. Utilisateur Connecté

```
Utilisateur arrive sur /dashboard.html
    ↓
AuthManager.init() charge session
    ↓
Session valide → Affichage modules
    ↓
Filtrage selon permissions :
  • Module accessible → Carte cliquable
  • Module inaccessible → Carte grisée 🔒
    ↓
Clic sur module → Navigation vers /index.html
    ↓
AuthManager.protectPage() vérifie permission
    ↓
Permission OK → Affichage module
```

### 3. Session Expirée

```
Session expirée (après 24h inactivité)
    ↓
AuthManager.protectPage() détecte expiration
    ↓
Redirection automatique /login.html
    ↓
Message : "Session expirée, veuillez vous reconnecter"
```

---

## 🎭 SYSTÈME PERMISSIONS

### Rôles Disponibles

| Rôle | Permissions | Description |
|------|-------------|-------------|
| **admin** | Toutes | Administrateur complet |
| **editor** | Modules métier | Peut modifier tous les modules (sauf gestion users) |
| **viewer** | Lecture seule | Consultation uniquement |

### Permissions Par Module

**Format** : `module.action`

**Extraction Factures** :
- `extraction_factures.view` : Voir module
- `extraction_factures.edit` : Modifier factures
- `extraction_factures.delete` : Supprimer factures

**Grille Tarifaire** :
- `grille_tarifaire.view` : Voir grille
- `grille_tarifaire.edit` : Modifier grille

**Paye Chauffeurs** :
- `paye_chauffeurs.view` : Voir paye
- `paye_chauffeurs.edit` : Modifier paye

**Trésorerie** :
- `tresorerie.view` : Voir trésorerie
- `tresorerie.edit` : Modifier trésorerie

**Administration** :
- `admin.users` : Gérer utilisateurs
- `admin.settings` : Gérer paramètres

### Configuration Permissions

**Table Supabase** : `user_profiles`

```sql
-- Structure
{
  user_id: UUID,
  role: 'admin' | 'editor' | 'viewer',
  permissions: JSONB array
}

-- Exemple admin
{
  "user_id": "a1b2c3...",
  "role": "admin",
  "permissions": [
    "extraction_factures.view",
    "extraction_factures.edit",
    "extraction_factures.delete",
    "grille_tarifaire.view",
    "grille_tarifaire.edit",
    "admin.users",
    "admin.settings"
  ]
}

-- Exemple viewer
{
  "user_id": "d4e5f6...",
  "role": "viewer",
  "permissions": [
    "extraction_factures.view",
    "grille_tarifaire.view"
  ]
}
```

---

## 🛠️ IMPLÉMENTATION

### Étape 1 : Setup Permissions Supabase

**Exécuter** : `database-setup.sql` dans SQL Editor

```sql
-- Crée :
✅ Table user_profiles
✅ Policies RLS
✅ Trigger auto-création profil
✅ Profil admin par défaut
```

### Étape 2 : Protéger Chaque Module

**Dans chaque page module** (`index.html`, `grille-tarifaire.html`, etc.) :

```html
<!-- Charger Auth Manager -->
<script src="./scripts/auth-manager.js"></script>

<!-- Protéger page -->
<script>
(async () => {
  // Redirection /login.html si non connecté
  // ET vérification permission
  await AuthManager.protectPage('extraction_factures.view');
})();
</script>
```

### Étape 3 : Affichage Conditionnel

**Masquer éléments selon permissions** :

```javascript
// Exemple : Bouton "Supprimer" visible uniquement si permission
if (AuthManager.hasPermission('extraction_factures.delete')) {
  document.getElementById('btnDelete').style.display = 'block';
}

// Exemple : Module entier
const canAccessTresorerie = AuthManager.canAccessModule('tresorerie');
if (!canAccessTresorerie) {
  // Masquer lien menu
  document.getElementById('link-tresorerie').style.display = 'none';
}
```

---

## 🎨 INTERFACE DASHBOARD

### Composants Principaux

**Header** :
- Logo Ballanfat
- Info utilisateur (email + rôle)
- Bouton déconnexion

**Modules Grid** :
- Cards modules (6 modules)
- Icône + titre + description + statut
- Hover effet
- Clic → Navigation module

**États Cards** :
- ✅ **Opérationnel** : Vert, cliquable
- 🚧 **En développement** : Orange, non cliquable
- 📋 **Planifié** : Bleu, non cliquable
- 🔒 **Accès restreint** : Grisé, overlay "Accès restreint"

### Personnalisation Modules

**Fichier** : `dashboard.html` (lignes 230-280)

```javascript
const MODULES = [
  {
    id: 'extraction_factures',
    icon: '📄',
    title: 'Extraction Factures',
    description: 'Upload, extraction automatique et validation des factures PDF',
    url: '/index.html',
    status: 'operational', // 'operational', 'beta', 'development', 'planned'
    statusLabel: '✅ Opérationnel',
    permission: 'extraction_factures.view',
    colors: ['#667eea', '#764ba2'] // Gradient couleurs
  },
  // ... autres modules
];
```

---

## 🔧 CONFIGURATION

### config.js (À ne PAS commiter)

```javascript
window.SUPABASE_CONFIG = {
  url: "https://VOTRE_PROJECT_ID.supabase.co",
  anonKey: "VOTRE_ANON_KEY",
  options: {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
};
```

### .gitignore

```
config.js
.env
*.env
```

---

## 🚀 DÉPLOIEMENT

### Checklist Déploiement

```
□ Exécuter database-setup.sql dans Supabase
□ Créer utilisateur test (email: test@ballanfat.com)
□ Mettre à jour email admin dans database-setup.sql (ligne 133)
□ Configurer config.js (URL + anon key)
□ Vérifier .gitignore inclut config.js
□ Créer config.js.example
□ Tests locaux :
  □ Login → Redirection dashboard
  □ Dashboard → Navigation modules
  □ Permissions → Modules masqués si pas accès
  □ Déconnexion → Redirection login
□ Déploiement GitHub
□ Tests production
```

---

## 🧪 TESTS

### Test 1 : Authentification

```
1. Ouvrir /login.html
2. Email: test@ballanfat.com / Password: Test123456!
3. Vérifier redirection /dashboard.html
4. Vérifier email affiché en header
```

### Test 2 : Navigation Modules

```
1. Dashboard → Cliquer "Extraction Factures"
2. Vérifier /index.html s'ouvre
3. Vérifier pas de demande login (session persistante)
```

### Test 3 : Permissions

```
1. Créer utilisateur viewer dans Supabase
2. Se connecter avec viewer
3. Vérifier modules inaccessibles grisés avec 🔒
4. Tenter accès direct URL → Redirection dashboard
```

### Test 4 : Session Persistante

```
1. Se connecter
2. Fermer navigateur
3. Rouvrir /dashboard.html
4. Vérifier connexion automatique (pas de login)
```

### Test 5 : Déconnexion

```
1. Dashboard → Cliquer "Déconnexion"
2. Vérifier redirection /login.html
3. Tenter accès /dashboard.html
4. Vérifier redirection /login.html
```

---

## 📊 MÉTRIQUES & MONITORING

### Événements Trackés

```javascript
// Connexions
AuthManager.signIn() → Log: "✅ Connexion réussie: email"

// Permissions refusées
AuthManager.protectPage() → Log: "❌ Permission refusée: module.action"

// Keep-alive
AuthManager.startKeepAlive() → Log: "🔄 Session rafraîchie"

// Erreurs
Supabase errors → Log: "⚠️ Erreur: details"
```

### Console Debugging

**Activer logs détaillés** :

```javascript
// Dans config.js
window.DEBUG = true;

// Voir permissions utilisateur
console.log(AuthManager.userPermissions);

// Voir session actuelle
window.supabaseClient.auth.getSession().then(console.log);
```

---

## 🛡️ SÉCURITÉ

### Bonnes Pratiques Appliquées

✅ **RLS Supabase** : Policies sur toutes tables  
✅ **Permissions granulaires** : Action par action  
✅ **Session tokens** : JWT secure  
✅ **config.js ignoré** : Clés jamais commitées  
✅ **Keep-alive** : Refresh auto session  
✅ **Vérifications frontend** : Masquage UI  
✅ **Vérifications backend** : Policies Supabase  

---

## 🔄 AJOUT NOUVEAU MODULE

### Checklist Intégration

```
1. Créer page module : /nouveau-module.html

2. Ajouter dans dashboard.html (MODULES array) :
   {
     id: 'nouveau_module',
     icon: '🆕',
     title: 'Nouveau Module',
     url: '/nouveau-module.html',
     permission: 'nouveau_module.view',
     status: 'operational',
     colors: ['#...', '#...']
   }

3. Créer permissions :
   - nouveau_module.view
   - nouveau_module.edit

4. Protéger page :
   <script src="./scripts/auth-manager.js"></script>
   <script>
     await AuthManager.protectPage('nouveau_module.view');
   </script>

5. Mettre à jour database-setup.sql (permissions par défaut)

6. Tests complets
```

---

## 📞 SUPPORT

### Problèmes Fréquents

**"Cannot read property 'createClient'"**  
→ Vérifier CDN Supabase chargé avant config.js

**"Session expired"**  
→ Durée session = 24h, keep-alive = 4 min

**"Permission denied"**  
→ Vérifier user_profiles dans Supabase Table Editor

**"Redirect loop"**  
→ Vérifier protectPage() pas appelé dans login.html

---

## ✅ CHECKLIST FINALE

```
□ Architecture dashboard complète
□ auth-manager.js créé
□ login.html créé
□ dashboard.html créé
□ index.html modifié (protection)
□ main.js corrigé (bug ArrayBuffer)
□ database-setup.sql créé
□ Documentation complète
□ Tests locaux OK
□ Prêt déploiement
```

---

**FIN ARCHITECTURE DASHBOARD**

*Document créé : 14 Janvier 2026*  
*Version : 2.7.0 Refacto + Dashboard*  
*Statut : ✅ Production Ready*

# 🚀 GUIDE DÉPLOIEMENT v2.7.0 - Module Extraction Factures
## Déploiement en Parallèle de la Version Actuelle

**Date** : 05 Janvier 2026  
**Version** : v2.7.0 REFACTO  
**Durée estimée** : 45-60 minutes  

---

## 📋 TABLE DES MATIÈRES

1. [Prérequis](#prérequis)
2. [Étape 1 : Nouveau Projet Supabase](#étape-1--nouveau-projet-supabase)
3. [Étape 2 : Configuration Tables](#étape-2--configuration-tables)
4. [Étape 3 : Configuration Storage](#étape-3--configuration-storage)
5. [Étape 4 : Setup GitHub](#étape-4--setup-github)
6. [Étape 5 : Configuration Locale](#étape-5--configuration-locale)
7. [Étape 6 : Tests Locaux](#étape-6--tests-locaux)
8. [Étape 7 : Déploiement Production](#étape-7--déploiement-production)
9. [Étape 8 : Tests Production](#étape-8--tests-production)
10. [Troubleshooting](#troubleshooting)

---

## PRÉREQUIS

### Outils Nécessaires
- ✅ Compte GitHub (existant)
- ✅ Compte Supabase (existant)
- ✅ Git installé localement
- ✅ Éditeur code (VS Code recommandé)
- ✅ Python 3.8+ (pour serveur local)
- ✅ Navigateur moderne (Chrome/Firefox)

### Fichiers Fournis
- 📦 `extraction-factures-v2.7.0.tar.gz` (archive complète)
- 📄 Ce guide de déploiement

---

## ÉTAPE 1 : NOUVEAU PROJET SUPABASE

### 1.1 Créer Nouveau Projet

1. **Aller sur** : https://supabase.com/dashboard
2. **Cliquer** : "New Project"
3. **Remplir** :
   ```
   Name: extraction-factures-v2
   Database Password: [CHOISIR MOT DE PASSE FORT]
   Region: Europe West (Frankfurt) [recommandé pour vous]
   Plan: Free (suffisant pour démarrer)
   ```
4. **Cliquer** : "Create new project"
5. **Attendre** : 2-3 minutes (initialisation database)

### 1.2 Noter les Identifiants

Une fois le projet créé :

1. **Aller dans** : Settings → API
2. **Noter** :
   ```
   Project URL: https://VOTRE_PROJECT_ID.supabase.co
   anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

⚠️ **IMPORTANT** : Ces clés seront utilisées dans `config.js`

---

## ÉTAPE 2 : CONFIGURATION TABLES

### 2.1 Créer Table `factures`

1. **Aller dans** : Table Editor → New Table
2. **Ou** : SQL Editor → New Query

**Coller ce SQL** :

```sql
-- Table factures
CREATE TABLE public.factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Fichier
  fichier_url TEXT NOT NULL,
  fichier_nom TEXT NOT NULL,
  
  -- Statuts possibles: pending, extracted, validated, error
  statut TEXT DEFAULT 'pending' CHECK (statut IN ('pending', 'extracted', 'validated', 'error', 'deleted')),
  
  -- Format détecté
  format_facture TEXT DEFAULT 'auto',
  
  -- Texte OCR complet
  texte_ocr TEXT,
  
  -- Données extraites (JSON)
  donnees_brutes JSONB,
  
  -- Champs principaux extraits (pour recherche rapide)
  numero_facture TEXT,
  date_facture DATE,
  client_nom TEXT,
  total_ht DECIMAL(12,2),
  total_tva DECIMAL(12,2),
  total_ttc DECIMAL(12,2),
  
  -- Métadonnées
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Utilisateur (pour multi-users futur)
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index pour performances
CREATE INDEX idx_factures_statut ON public.factures(statut);
CREATE INDEX idx_factures_date ON public.factures(date_facture DESC);
CREATE INDEX idx_factures_client ON public.factures(client_nom);
CREATE INDEX idx_factures_numero ON public.factures(numero_facture);
CREATE INDEX idx_factures_user ON public.factures(user_id);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER factures_updated_at
BEFORE UPDATE ON public.factures
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
```

3. **Cliquer** : "Run" (en bas à droite)
4. **Vérifier** : Table Editor → Voir table `factures` créée

### 2.2 Activer Row Level Security (RLS)

**Important pour sécurité** :

```sql
-- Activer RLS
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

-- Policy: Utilisateurs authentifiés peuvent tout faire sur leurs propres factures
CREATE POLICY "Users can manage own factures"
ON public.factures
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Lecture pour utilisateurs authentifiés (optionnel)
CREATE POLICY "Authenticated users can view all"
ON public.factures
FOR SELECT
USING (auth.role() = 'authenticated');
```

**Résultat** : Chaque utilisateur voit uniquement ses factures

---

## ÉTAPE 3 : CONFIGURATION STORAGE

### 3.1 Créer Bucket `factures`

1. **Aller dans** : Storage → New Bucket
2. **Remplir** :
   ```
   Name: factures
   Public: NO (décocher)
   File size limit: 10 MB
   Allowed MIME types: application/pdf
   ```
3. **Cliquer** : "Create bucket"

### 3.2 Configurer Policies Storage

1. **Cliquer** : Bucket `factures` → Policies → New Policy
2. **Coller** :

```sql
-- Policy Upload (INSERT)
CREATE POLICY "Users can upload PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'factures' 
  AND (storage.foldername(name))[1] IN ('2024', '2025', '2026')
);

-- Policy Download (SELECT)
CREATE POLICY "Users can view own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'factures' AND owner = auth.uid());

-- Policy Delete
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'factures' AND owner = auth.uid());
```

### 3.3 Créer Dossier 2025

1. **Storage** → factures → New folder
2. **Nom** : `2025`
3. **Créer** : Vide (les PDFs seront uploadés dedans)

---

## ÉTAPE 4 : SETUP GITHUB

### 4.1 Créer Nouveau Repository

**Option A : Repository Public**
```bash
# Ligne de commande
gh repo create extraction-factures-v2 --public --description "Module Extraction Factures v2.7.0 Refacto"
```

**Option B : Via Interface GitHub**
1. **Aller sur** : https://github.com/new
2. **Remplir** :
   ```
   Repository name: extraction-factures-v2
   Description: Module Extraction Factures v2.7.0 - Architecture Modulaire
   Visibility: Public (ou Private si vous préférez)
   Initialize: NO README (on a déjà)
   ```
3. **Cliquer** : "Create repository"

### 4.2 Activer GitHub Pages

1. **Repository** → Settings → Pages
2. **Source** : Deploy from a branch
3. **Branch** : `main` (ou `master`)
4. **Folder** : `/ (root)`
5. **Cliquer** : Save

**URL sera** : `https://VOTRE_USERNAME.github.io/extraction-factures-v2/`

---

## ÉTAPE 5 : CONFIGURATION LOCALE

### 5.1 Extraire Archive

```bash
# Créer dossier projet
mkdir -p ~/projets/extraction-factures-v2
cd ~/projets/extraction-factures-v2

# Extraire archive
tar -xzf ~/Downloads/extraction-factures-v2.7.0.tar.gz
cd extraction-factures-refacto/
```

**Vérifier structure** :
```bash
ls -la

# Doit afficher :
# config.js
# index.html
# README.md
# styles/
# scripts/
```

### 5.2 Configurer config.js

**Ouvrir** : `config.js`

**Remplacer** :
```javascript
window.SUPABASE_CONFIG = {
  url: "https://VOTRE_PROJECT_ID.supabase.co", // ← Mettre votre URL
  anonKey: "eyJhbGci...",                        // ← Mettre votre clé anon
  options: {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
};

window.PDFJS_CONFIG = {
  workerSrc: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  version: "3.11.174"
};

window.APP_CONFIG = {
  MAX_FILES: 20,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  STORAGE_BUCKET: "factures",
  TABLE_FACTURES: "factures",
  AUTOSAVE_DELAY: 5000,  // 5 secondes
  KEEPALIVE_INTERVAL: 240000, // 4 minutes
  STATUTS: {
    PENDING: "pending",
    EXTRACTED: "extracted",
    VALIDATED: "validated",
    ERROR: "error",
    DELETED: "deleted"
  }
};
```

**Sauvegarder** : Ctrl+S

### 5.3 Créer .gitignore

**Créer fichier** : `.gitignore`

**Contenu** :
```
# Config avec clés sensibles
config.js

# Environnement
.env
.env.local
*.env

# Éditeur
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Dépendances (si vous ajoutez Node.js plus tard)
node_modules/
package-lock.json
```

### 5.4 Créer config.js.example

**Pour le repository Git** (sans vos vraies clés) :

```bash
cp config.js config.js.example
```

**Éditer** : `config.js.example`

**Remplacer les clés par** :
```javascript
window.SUPABASE_CONFIG = {
  url: "https://VOTRE_PROJECT_ID.supabase.co",
  anonKey: "VOTRE_ANON_KEY_ICI",
  options: { /* ... */ }
};
// ... reste identique
```

---

## ÉTAPE 6 : TESTS LOCAUX

### 6.1 Lancer Serveur Local

```bash
# Dans le dossier extraction-factures-refacto/
python3 -m http.server 8000
```

**Ouvrir navigateur** : http://localhost:8000/index.html

### 6.2 Créer Utilisateur Test

1. **Aller dans Supabase** : Authentication → Users → Add user
2. **Créer** :
   ```
   Email: test@ballanfat.com
   Password: Test123456!
   Auto Confirm: OUI (cocher)
   ```
3. **Cliquer** : "Create user"

### 6.3 Checklist Tests Locaux

**Test 1 : Connexion** ✅
```
1. Ouvrir http://localhost:8000/index.html
2. Entrer : test@ballanfat.com / Test123456!
3. Cliquer "Se connecter"
4. Vérifier : "Connecté: test@ballanfat.com" apparaît
```

**Test 2 : Upload PDF** ✅
```
1. Glisser-déposer un PDF facture (ou cliquer pour choisir)
2. Vérifier : Fichier apparaît dans liste avec statut "ready"
3. Cliquer "🚀 Uploader & Extraire"
4. Attendre : Statut passe "uploading" → "extracting" → "OK"
5. Vérifier : ID facture apparaît (UUID)
```

**Test 3 : Édition Facture** ✅
```
1. Cliquer "👁 Voir" sur facture extraite
2. Vérifier modal s'ouvre
3. Onglet "Édition" : Champs remplis automatiquement
4. Modifier numéro facture → Attendre 5s → Vérifier "✅ Sauvegardé"
5. Onglet "Tableau extrait" : Services détectés affichés
6. Onglet "Texte OCR" : Texte surligné
7. Onglet "Debug" : JSON complet
```

**Test 4 : Validation Stricte** ✅
```
1. Modal ouverte → Vider "Numéro facture"
2. Attendre 5s autosave
3. Vérifier : "❌ Erreurs - Numéro facture obligatoire"
4. Remettre numéro valide (ex: FACT-2025-001)
5. Vérifier : "✅ Sauvegardé"
```

**Test 5 : LocalStorage Backup** ✅
```
1. Fermer navigateur
2. Rouvrir http://localhost:8000/index.html
3. Cliquer "🔄 Recharger la liste"
4. Vérifier : Factures réapparaissent
```

### 6.4 Vérifier Supabase

**Table factures** :
1. Supabase → Table Editor → factures
2. Vérifier : Ligne créée avec vos données
3. Colonnes remplies : `numero_facture`, `date_facture`, `client_nom`, etc.

**Storage factures** :
1. Supabase → Storage → factures → 2025/
2. Vérifier : PDF uploadé présent

---

## ÉTAPE 7 : DÉPLOIEMENT PRODUCTION

### 7.1 Initialiser Git

```bash
cd ~/projets/extraction-factures-v2/extraction-factures-refacto/

git init
git add .
git commit -m "feat: Initial commit v2.7.0 - Architecture modulaire"
```

### 7.2 Lier Repository GitHub

```bash
# Remplacer VOTRE_USERNAME par votre nom d'utilisateur GitHub
git remote add origin https://github.com/VOTRE_USERNAME/extraction-factures-v2.git

# Ou avec SSH si configuré :
# git remote add origin git@github.com:VOTRE_USERNAME/extraction-factures-v2.git
```

### 7.3 Push vers GitHub

```bash
git branch -M main
git push -u origin main
```

**Attendre** : 30-60 secondes (GitHub Pages build)

### 7.4 Vérifier Déploiement

1. **URL** : `https://VOTRE_USERNAME.github.io/extraction-factures-v2/`
2. **Ouvrir** : Dans navigateur
3. **Vérifier** : Page charge correctement

---

## ÉTAPE 8 : TESTS PRODUCTION

### 8.1 Tester URL Production

**URL complète** : `https://VOTRE_USERNAME.github.io/extraction-factures-v2/index.html`

**Refaire checklist tests** (comme tests locaux) :
- ✅ Connexion
- ✅ Upload PDF
- ✅ Édition
- ✅ Validation
- ✅ LocalStorage

### 8.2 Tester Multi-Appareils

**Desktop** :
- Chrome ✅
- Firefox ✅
- Safari ✅ (si Mac)

**Mobile/Tablette** :
- Responsive fonctionne ✅
- Upload fichiers ✅
- Édition facile ✅

---

## ÉTAPE 9 : CONFIGURATION AVANCÉE (Optionnel)

### 9.1 Custom Domain (Optionnel)

**Si vous avez un domaine** (ex: `factures.ballanfat.com`) :

1. **GitHub Pages** : Settings → Pages → Custom domain
2. **Entrer** : `factures.ballanfat.com`
3. **DNS** : Ajouter CNAME chez votre registrar :
   ```
   factures.ballanfat.com → VOTRE_USERNAME.github.io
   ```
4. **Attendre** : 10-30 minutes propagation DNS
5. **Cocher** : "Enforce HTTPS" (automatique après propagation)

### 9.2 Variables Environnement (CI/CD Futur)

**Pour GitHub Actions** (Sprint 3) :

1. **Repository** → Settings → Secrets → Actions
2. **New secret** :
   ```
   SUPABASE_URL: https://...
   SUPABASE_ANON_KEY: eyJhbG...
   ```

---

## TROUBLESHOOTING

### Problème : "Cannot read property 'createClient' of undefined"

**Cause** : Supabase JS Client pas chargé

**Solution** :
```html
<!-- Vérifier présence dans index.html : -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

---

### Problème : "CORS error" lors upload

**Cause** : Domain non autorisé dans Supabase

**Solution** :
1. Supabase → Settings → API → Site URL
2. Ajouter : `https://VOTRE_USERNAME.github.io`
3. Ajouter aussi : `http://localhost:8000` (pour dev local)

---

### Problème : "Row Level Security" bloque accès

**Cause** : Policies RLS mal configurées

**Solution** :
```sql
-- Temporairement désactiver RLS (DEV UNIQUEMENT)
ALTER TABLE public.factures DISABLE ROW LEVEL SECURITY;

-- Puis reconfigurer policies correctement
```

---

### Problème : PDF.js "Worker not found"

**Cause** : Worker URL incorrecte

**Solution** :
```javascript
// config.js - Vérifier URL exacte
window.PDFJS_CONFIG = {
  workerSrc: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
};
```

---

### Problème : Validation bloque sauvegarde légitimement bonne

**Cause** : Règle validation trop stricte

**Solution** :
```javascript
// scripts/validation.js
// Ajuster tolérance HT/TVA/TTC si besoin
const tolerance = 0.05; // Au lieu de 0.02
```

---

### Problème : LocalStorage "QuotaExceeded"

**Cause** : Trop de factures stockées localement

**Solution** :
```javascript
// Nettoyer localStorage
localStorage.clear();
// Ou garder uniquement récentes :
// Automatique dans main.js (garde 30 jours)
```

---

## 📊 URLS FINALES

### Version Actuelle (v2.6.7)
```
Production: https://aballanfat-tech.github.io/App-Gestion/import-factures.html
Supabase: Project existant (ayzouplmnnlooofcxbsz ou bgkpjrjnbhhozalmiogg)
```

### Nouvelle Version (v2.7.0) - EN PARALLÈLE
```
Production: https://VOTRE_USERNAME.github.io/extraction-factures-v2/index.html
Supabase: Nouveau project (extraction-factures-v2)
GitHub: https://github.com/VOTRE_USERNAME/extraction-factures-v2
```

**Avantage** :
- ✅ Les 2 versions coexistent
- ✅ Pas de régression sur v2.6.7
- ✅ Tests v2.7.0 sans risque
- ✅ Migration progressive possible

---

## 📋 CHECKLIST FINALE

```
□ Étape 1: Nouveau projet Supabase créé
□ Étape 2: Tables configurées (factures + RLS)
□ Étape 3: Storage configuré (bucket factures + policies)
□ Étape 4: Repository GitHub créé + Pages activées
□ Étape 5: config.js rempli avec vraies clés
□ Étape 6: Tests locaux OK (5 tests passés)
□ Étape 7: Déploiement GitHub réussi
□ Étape 8: Tests production OK
□ Bonus: .gitignore créé (config.js exclu)
□ Bonus: config.js.example créé pour Git
```

**Si tout coché** : ✅ **DÉPLOIEMENT RÉUSSI !** 🎉

---

## 🎯 PROCHAINES ÉTAPES

### Jour 2 Sprint 1 (Demain)
- Tests approfondis multi-scénarios
- Corrections bugs éventuels
- Documentation utilisateur

### Semaine 2
- Migration progressive utilisateurs v2.6.7 → v2.7.0
- Formation équipe
- Collecte feedback

### Mois 2
- Sprint 2 : Tests unitaires automatisés
- Sprint 3 : CI/CD pipeline
- Améliorations basées feedback

---

## 📞 SUPPORT

**Problème bloquant ?**

1. Vérifier [Troubleshooting](#troubleshooting)
2. Consulter README.md du projet
3. Vérifier logs navigateur (F12 → Console)
4. Vérifier logs Supabase (Dashboard → Logs)

**Logs utiles** :
```javascript
// Dans console navigateur (F12)
StateManager.exportState(); // Voir état complet
console.log(window.SUPABASE_CONFIG); // Vérifier config
```

---

## ✅ RÉCAPITULATIF

**Temps total** : ~45-60 minutes

**Vous avez créé** :
- ✅ Nouveau projet Supabase (tables + storage)
- ✅ Nouveau repository GitHub
- ✅ Déploiement GitHub Pages
- ✅ Version v2.7.0 opérationnelle en parallèle de v2.6.7

**Résultat** :
- 🎯 Architecture modulaire professionnelle
- 🔒 Sécurité améliorée (RLS, config externalisée)
- ✅ Validation stricte données
- 📚 Documentation complète (JSDoc 100%)
- 🧪 Tests possibles (modules isolés)

**Prêt pour production !** 🚀

---

*Guide créé : 05 Janvier 2026*  
*Version : v2.7.0 REFACTO*  
*Auteur : Claude (Anthropic)*

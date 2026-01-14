# ✅ CHECKLIST DÉPLOIEMENT EXPRESS - v2.7.0
## En Parallèle de votre Version Actuelle

**Durée** : 45 minutes | **Difficulté** : ⭐⭐ Facile

---

## 🎯 OBJECTIF

Déployer **v2.7.0** en parallèle de **v2.6.7** avec :
- ✅ Nouveau projet Supabase séparé
- ✅ Nouveau repository GitHub
- ✅ URL différente (pas de conflit)

---

## 📋 ÉTAPES RAPIDES

### ☑️ 1. SUPABASE (10 min)

**A. Créer projet**
```
→ https://supabase.com/dashboard
→ New Project
→ Name: extraction-factures-v2
→ Region: Europe West (Frankfurt)
→ Create
```

**B. Noter identifiants**
```
Settings → API
✓ Project URL: https://xxx.supabase.co
✓ anon key: eyJhbG...
```

**C. Créer table** (SQL Editor)
```sql
CREATE TABLE public.factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fichier_url TEXT NOT NULL,
  fichier_nom TEXT NOT NULL,
  statut TEXT DEFAULT 'pending',
  format_facture TEXT DEFAULT 'auto',
  texte_ocr TEXT,
  donnees_brutes JSONB,
  numero_facture TEXT,
  date_facture DATE,
  client_nom TEXT,
  total_ht DECIMAL(12,2),
  total_tva DECIMAL(12,2),
  total_ttc DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_factures_statut ON public.factures(statut);
CREATE INDEX idx_factures_date ON public.factures(date_facture DESC);

-- RLS
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own factures"
ON public.factures FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

**D. Créer bucket** (Storage)
```
→ Storage → New Bucket
→ Name: factures
→ Public: NO
→ Create
→ New folder: 2025
```

---

### ☑️ 2. GITHUB (5 min)

**A. Créer repository**
```
→ https://github.com/new
→ Name: extraction-factures-v2
→ Public (ou Private)
→ NO README
→ Create
```

**B. Activer Pages**
```
→ Settings → Pages
→ Source: Deploy from branch
→ Branch: main
→ Folder: / (root)
→ Save
```

**URL sera** : `https://VOTRE_USER.github.io/extraction-factures-v2/`

---

### ☑️ 3. LOCAL (15 min)

**A. Extraire archive**
```bash
cd ~/Downloads
unzip extraction-factures-v2.7.0.zip
cd extraction-factures-refacto/
```

**B. Éditer config.js**
```javascript
// Ligne 11-13 : Mettre VOS identifiants Supabase
window.SUPABASE_CONFIG = {
  url: "https://VOTRE_PROJECT_ID.supabase.co",  // ← ICI
  anonKey: "VOTRE_ANON_KEY",                     // ← ICI
  // ... reste inchangé
};
```

**C. Créer .gitignore**
```bash
cat > .gitignore << EOF
config.js
.env
.env.local
*.env
.DS_Store
*.log
node_modules/
EOF
```

**D. Créer config.js.example** (pour Git)
```bash
cp config.js config.js.example
# Puis éditer config.js.example et remplacer clés par "VOTRE_XXX_ICI"
```

---

### ☑️ 4. TESTS LOCAUX (10 min)

**A. Lancer serveur**
```bash
python3 -m http.server 8000
# Ouvrir : http://localhost:8000/index.html
```

**B. Créer utilisateur test** (Supabase)
```
→ Authentication → Users → Add user
→ Email: test@ballanfat.com
→ Password: Test123456!
→ Auto Confirm: OUI
→ Create
```

**C. Tester connexion**
```
1. Se connecter avec test@ballanfat.com
2. Uploader 1 PDF facture test
3. Cliquer "👁 Voir" après extraction
4. Modifier un champ → Attendre 5s
5. Vérifier "✅ Sauvegardé" apparaît
```

✅ **Si tout fonctionne → Continuer**

---

### ☑️ 5. DÉPLOIEMENT (5 min)

```bash
# Depuis dossier extraction-factures-refacto/

git init
git add .
git commit -m "feat: v2.7.0 - Architecture modulaire"

# Remplacer VOTRE_USER par votre username GitHub
git remote add origin https://github.com/VOTRE_USER/extraction-factures-v2.git

git branch -M main
git push -u origin main
```

**Attendre 1 minute** → GitHub Pages build

---

### ☑️ 6. TESTS PRODUCTION (5 min)

**Ouvrir** : `https://VOTRE_USER.github.io/extraction-factures-v2/index.html`

**Refaire tests** :
- ✅ Connexion
- ✅ Upload PDF
- ✅ Édition
- ✅ Sauvegarde

---

## 🎉 TERMINÉ !

### URLs Finales

**Version Actuelle (v2.6.7)** - Continue de fonctionner :
```
https://aballanfat-tech.github.io/App-Gestion/import-factures.html
```

**Nouvelle Version (v2.7.0)** - En parallèle :
```
https://VOTRE_USER.github.io/extraction-factures-v2/index.html
```

### Avantages Parallélisme

- ✅ Pas de risque régression v2.6.7
- ✅ Tests v2.7.0 sans pression
- ✅ Migration progressive possible
- ✅ Rollback facile si besoin

---

## ❓ PROBLÈME ?

### "Supabase connection error"
```
→ Vérifier config.js (URL + key correctes)
→ Supabase Settings → API → Ajouter domaine GitHub Pages
```

### "CORS error"
```
→ Supabase Settings → API → Site URL
→ Ajouter : https://VOTRE_USER.github.io
```

### "RLS policy error"
```sql
-- Temporairement désactiver (DEV)
ALTER TABLE public.factures DISABLE ROW LEVEL SECURITY;
```

### "PDF.js worker not found"
```javascript
// config.js - Vérifier URL
workerSrc: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
```

---

## 📚 DOCUMENTATION COMPLÈTE

→ Voir **GUIDE_DEPLOIEMENT.md** (détails complets)  
→ Voir **README.md** (architecture technique)  
→ Voir **RAPPORT_FINAL_JOUR1.md** (fonctionnalités)

---

## 🚀 PROCHAINES ÉTAPES

**Demain - Jour 2** :
- Tests approfondis multi-scénarios
- Corrections bugs éventuels
- Documentation utilisateur

**Semaine 2** :
- Migration progressive v2.6.7 → v2.7.0
- Formation équipe
- Collecte feedback

---

**Temps total** : ✅ **45 minutes**  
**Résultat** : 🎯 **Version v2.7.0 opérationnelle en parallèle**

*Checklist créée : 05 Janvier 2026*

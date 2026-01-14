-- =========================================
-- SETUP BASE DE DONNÉES - PERMISSIONS
-- Plateforme Ballanfat v2.7.0
-- =========================================

-- ===========================
-- TABLE : user_profiles
-- Profils utilisateurs avec rôles et permissions
-- ===========================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'viewer',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

-- ===========================
-- ROW LEVEL SECURITY (RLS)
-- ===========================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy : Utilisateurs peuvent voir leur propre profil
CREATE POLICY "Users can view own profile"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy : Admins peuvent tout voir
CREATE POLICY "Admins can view all profiles"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Policy : Admins peuvent modifier tous les profils
CREATE POLICY "Admins can update all profiles"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- ===========================
-- FONCTION : Auto-créer profil utilisateur
-- ===========================

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Créer profil par défaut (role: editor)
  INSERT INTO public.user_profiles (user_id, role, permissions)
  VALUES (
    NEW.id,
    'editor', -- Par défaut : editor (peut modifier)
    '["extraction_factures.view", "extraction_factures.edit", "grille_tarifaire.view", "grille_tarifaire.edit"]'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================
-- TRIGGER : Créer profil auto lors inscription
-- ===========================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_user_profile();

-- ===========================
-- FONCTION : Mettre à jour timestamp
-- ===========================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger updated_at sur user_profiles
DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;

CREATE TRIGGER user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ===========================
-- DONNÉES DE TEST
-- ===========================

-- Insérer profil admin pour utilisateur existant (à adapter selon votre email)
-- ⚠️ REMPLACER 'test@ballanfat.com' par votre vrai email admin

INSERT INTO public.user_profiles (user_id, role, permissions)
SELECT 
  id,
  'admin',
  '["extraction_factures.view", "extraction_factures.edit", "extraction_factures.delete", "grille_tarifaire.view", "grille_tarifaire.edit", "paye_chauffeurs.view", "paye_chauffeurs.edit", "tresorerie.view", "tresorerie.edit", "admin.users", "admin.settings"]'::jsonb
FROM auth.users
WHERE email = 'test@ballanfat.com' -- ⚠️ À MODIFIER
ON CONFLICT (user_id) DO UPDATE
SET 
  role = 'admin',
  permissions = EXCLUDED.permissions,
  updated_at = NOW();

-- ===========================
-- VÉRIFICATIONS
-- ===========================

-- Vérifier que la table existe
SELECT 'Table user_profiles créée:' AS status, COUNT(*) AS count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_profiles';

-- Vérifier les policies
SELECT 'Policies RLS:' AS status, COUNT(*) AS count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_profiles';

-- Vérifier les profils créés
SELECT 
  'Profils utilisateurs:' AS status,
  COUNT(*) AS count,
  json_agg(json_build_object('role', role, 'count', count)) AS details
FROM (
  SELECT role, COUNT(*) AS count
  FROM public.user_profiles
  GROUP BY role
) t;

-- ===========================
-- RÔLES ET PERMISSIONS
-- ===========================

/*
RÔLES DISPONIBLES :
-------------------
1. admin    : Toutes permissions + gestion utilisateurs
2. editor   : Peut modifier tous les modules (sauf admin)
3. viewer   : Lecture seule

PERMISSIONS PAR MODULE :
------------------------
- extraction_factures.view    : Voir module extraction
- extraction_factures.edit    : Modifier factures
- extraction_factures.delete  : Supprimer factures

- grille_tarifaire.view       : Voir grille tarifaire
- grille_tarifaire.edit       : Modifier grille tarifaire

- paye_chauffeurs.view        : Voir paye chauffeurs
- paye_chauffeurs.edit        : Modifier paye chauffeurs

- tresorerie.view             : Voir trésorerie
- tresorerie.edit             : Modifier trésorerie

- admin.users                 : Gérer utilisateurs
- admin.settings              : Gérer paramètres

MODIFIER RÔLE UTILISATEUR :
---------------------------
UPDATE public.user_profiles
SET role = 'admin',
    permissions = '["extraction_factures.view", "extraction_factures.edit", "admin.users"]'::jsonb
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'email@example.com');

AJOUTER PERMISSION :
--------------------
UPDATE public.user_profiles
SET permissions = permissions || '["tresorerie.view"]'::jsonb
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'email@example.com');

RETIRER PERMISSION :
--------------------
UPDATE public.user_profiles
SET permissions = permissions - 'tresorerie.view'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'email@example.com');
*/

-- ===========================
-- FIN SETUP
-- ===========================

SELECT '✅ Setup permissions terminé !' AS status;

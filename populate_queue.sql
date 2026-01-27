-- ============================================================================
-- SCRIPT : Peupler file d'attente depuis factures existantes
-- Date : 27 janvier 2026
-- Description : Créer entrées queue pour factures extraites
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 : Analyser factures existantes
-- ============================================================================

-- Voir toutes les factures extraites
SELECT 
  id,
  fichier_nom,
  statut,
  donnees_brutes->>'fullText' as texte_extrait,
  (donnees_brutes->'fields'->>'client_nom') as client_detecte,
  (donnees_brutes->'table') as services,
  created_at
FROM factures
WHERE statut = 'extracted'
  AND donnees_brutes IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- ÉTAPE 2 : Fonction extraction année depuis texte
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_year_from_text(text_content TEXT)
RETURNS INTEGER AS $$
DECLARE
  year_match TEXT;
BEGIN
  -- Chercher pattern date (DD/MM/YYYY ou YYYY-MM-DD)
  year_match := substring(text_content FROM '\d{2}/\d{2}/(\d{4})');
  
  IF year_match IS NULL THEN
    year_match := substring(text_content FROM '(\d{4})-\d{2}-\d{2}');
  END IF;
  
  IF year_match IS NULL THEN
    year_match := substring(text_content FROM '(?:20\d{2})');
  END IF;
  
  RETURN COALESCE(year_match::INTEGER, EXTRACT(YEAR FROM NOW())::INTEGER);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ÉTAPE 3 : Fonction extraction client normalisé
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_client_name(raw_name TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  cleaned := raw_name;
  
  -- Supprimer codes postaux
  cleaned := regexp_replace(cleaned, '\d{5}', '', 'g');
  
  -- Supprimer adresses
  cleaned := regexp_replace(cleaned, '(?:rue|route|avenue|chemin|impasse)\s+.*', '', 'gi');
  
  -- Supprimer "France"
  cleaned := regexp_replace(cleaned, '\s*France\s*', '', 'gi');
  
  -- Trim espaces multiples
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');
  cleaned := trim(cleaned);
  
  -- Si trop court ou vide, retourner original
  IF length(cleaned) < 3 THEN
    RETURN raw_name;
  END IF;
  
  RETURN cleaned;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ÉTAPE 4 : Fonction calcul nombre services
-- ============================================================================

CREATE OR REPLACE FUNCTION count_services_in_facture(facture_data JSONB)
RETURNS INTEGER AS $$
DECLARE
  service_count INTEGER := 0;
  table_entry JSONB;
BEGIN
  -- Parcourir array "table"
  IF facture_data ? 'table' THEN
    FOR table_entry IN SELECT * FROM jsonb_array_elements(facture_data->'table')
    LOOP
      IF table_entry ? 'services' THEN
        service_count := service_count + jsonb_array_length(table_entry->'services');
      END IF;
    END LOOP;
  END IF;
  
  RETURN service_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ÉTAPE 5 : Peupler queue depuis factures
-- ============================================================================

-- Insérer toutes factures extraites dans la queue
INSERT INTO factures_export_queue (
  facture_id,
  client_detecte,
  annee,
  status,
  services_count,
  created_at
)
SELECT 
  f.id,
  normalize_client_name(
    COALESCE(
      f.donnees_brutes->'fields'->>'client_nom',
      f.donnees_brutes->'fields'->>'destinataire',
      'Client inconnu'
    )
  ) as client_detecte,
  extract_year_from_text(
    COALESCE(
      f.donnees_brutes->>'fullText',
      f.texte_ocr,
      ''
    )
  ) as annee,
  'pending' as status,
  count_services_in_facture(f.donnees_brutes) as services_count,
  f.created_at
FROM factures f
WHERE f.statut = 'extracted'
  AND f.donnees_brutes IS NOT NULL
  AND NOT EXISTS (
    -- Ne pas créer doublons
    SELECT 1 FROM factures_export_queue q
    WHERE q.facture_id = f.id
  )
ORDER BY f.created_at DESC;

-- Message confirmation
DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE '✅ % factures ajoutées à la file d''attente', inserted_count;
END $$;

-- ============================================================================
-- ÉTAPE 6 : Créer services_mapping pour chaque facture
-- ============================================================================

-- Fonction : Créer mappings services depuis données facture
CREATE OR REPLACE FUNCTION create_services_mapping_from_facture(p_queue_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_facture_id UUID;
  v_donnees_brutes JSONB;
  v_table JSONB;
  v_table_entry JSONB;
  v_services JSONB;
  v_service JSONB;
  v_service_index INTEGER := 0;
  v_inserted_count INTEGER := 0;
  v_fulltext TEXT;
BEGIN
  -- Récupérer facture
  SELECT fq.facture_id INTO v_facture_id
  FROM factures_export_queue fq
  WHERE fq.id = p_queue_id;
  
  IF v_facture_id IS NULL THEN
    RAISE EXCEPTION 'Queue ID % not found', p_queue_id;
  END IF;
  
  -- Récupérer données
  SELECT donnees_brutes, donnees_brutes->>'fullText'
  INTO v_donnees_brutes, v_fulltext
  FROM factures
  WHERE id = v_facture_id;
  
  -- Parcourir table
  v_table := v_donnees_brutes->'table';
  
  IF v_table IS NOT NULL THEN
    FOR v_table_entry IN SELECT * FROM jsonb_array_elements(v_table)
    LOOP
      v_services := v_table_entry->'services';
      
      IF v_services IS NOT NULL THEN
        FOR v_service IN SELECT * FROM jsonb_array_elements(v_services)
        LOOP
          v_service_index := v_service_index + 1;
          
          -- Insérer service
          INSERT INTO services_mapping (
            queue_id,
            service_index,
            description_orig,
            prix_ht,
            quantite,
            tva,
            status,
            confidence_score,
            needs_validation,
            created_at
          ) VALUES (
            p_queue_id,
            v_service_index,
            COALESCE(v_service->>'desc', v_service->>'description', 'Service sans description'),
            COALESCE((v_service->>'pu')::DECIMAL, (v_service->>'prix')::DECIMAL, 0),
            COALESCE((v_service->>'qty')::INTEGER, (v_service->>'quantite')::INTEGER, 1),
            COALESCE((v_service->>'tva')::DECIMAL, 10),
            'pending',
            0,  -- Score sera calculé par détection auto
            true,  -- Par défaut nécessite validation
            NOW()
          );
          
          v_inserted_count := v_inserted_count + 1;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  
  RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Créer mappings pour toutes queues
DO $$
DECLARE
  queue_record RECORD;
  services_created INTEGER;
  total_services INTEGER := 0;
BEGIN
  FOR queue_record IN 
    SELECT id, client_detecte 
    FROM factures_export_queue 
    WHERE status = 'pending'
  LOOP
    BEGIN
      services_created := create_services_mapping_from_facture(queue_record.id);
      total_services := total_services + services_created;
      
      RAISE NOTICE '✅ Queue % (%): % services créés', 
        queue_record.id, 
        queue_record.client_detecte, 
        services_created;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '⚠️ Erreur queue %: %', queue_record.id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '🎉 TOTAL: % services créés', total_services;
END $$;

-- ============================================================================
-- ÉTAPE 7 : Vérifications
-- ============================================================================

-- Résumé file d'attente
SELECT 
  'Factures en attente' as categorie,
  COUNT(*) as total
FROM factures_export_queue
WHERE status = 'pending'

UNION ALL

SELECT 
  'Services détectés',
  COUNT(*)
FROM services_mapping;

-- Détail par facture
SELECT 
  q.id,
  q.client_detecte,
  q.annee,
  q.services_count,
  COUNT(sm.id) as services_mappings_created,
  f.fichier_nom
FROM factures_export_queue q
LEFT JOIN services_mapping sm ON sm.queue_id = q.id
LEFT JOIN factures f ON f.id = q.facture_id
WHERE q.status = 'pending'
GROUP BY q.id, q.client_detecte, q.annee, q.services_count, f.fichier_nom
ORDER BY q.created_at DESC;

-- ============================================================================
-- ÉTAPE 8 : Nettoyer si besoin (OPTIONNEL)
-- ============================================================================

-- Si vous voulez recommencer, décommenter et exécuter :
/*
-- Supprimer tous mappings
DELETE FROM services_mapping;

-- Supprimer toute la queue
DELETE FROM factures_export_queue;

-- Puis réexécuter depuis ÉTAPE 5
*/

-- ============================================================================
-- FIN SCRIPT
-- ============================================================================

-- Message final
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Script terminé avec succès';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Prochaine étape: Ouvrir validation-exports.html';
  RAISE NOTICE 'URL: https://aballanfat-tech.github.io/App-Gestion-V.2/validation-exports.html';
END $$;

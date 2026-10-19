-- Migration owner only, on the dedicated application database.
-- SET bcs.runtime_role = 'your_runtime_role'; then run this file.
-- New roles cannot log in until an operator injects a SCRAM credential separately.
DO $$
DECLARE runtime TEXT := current_setting('bcs.runtime_role', true); immutable TEXT;
BEGIN
 IF runtime IS NULL OR runtime !~ '^[a-z][a-z0-9_]{0,62}$' OR runtime = current_user THEN
  RAISE EXCEPTION 'A distinct runtime role is required';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime) THEN
  EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',runtime);
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=runtime) THEN
  RAISE EXCEPTION 'Runtime role has excessive authority or memberships';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=runtime) THEN
  RAISE EXCEPTION 'Runtime role must not own database objects';
 END IF;
 REVOKE CREATE ON SCHEMA public FROM PUBLIC;
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),runtime);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',runtime);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO %I',runtime);
 EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',runtime);
 EXECUTE format('REVOKE ALL ON TABLE "_prisma_migrations" FROM %I',runtime);
 FOREACH immutable IN ARRAY ARRAY['Audit','VerificationCheck','CaseUpdate','LessonConfirmation','LessonFeedback','RecommendationRun','RecommendationPresentation','CandidateDecision','ContinuationObservation','DeletionRecord','CommercialRevision','ServiceContact'] LOOP
  EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON TABLE %I FROM %I',immutable,runtime);
 END LOOP;
 EXECUTE format('ALTER ROLE %I SET statement_timeout TO %L',runtime,'15s');
 EXECUTE format('ALTER ROLE %I SET lock_timeout TO %L',runtime,'5s');
 EXECUTE format('ALTER ROLE %I SET idle_in_transaction_session_timeout TO %L',runtime,'30s');
END $$;

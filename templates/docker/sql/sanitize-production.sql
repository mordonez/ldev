-- ================================================================
-- PRODUCTION DATABASE SANITIZATION FOR LOCAL DEVELOPMENT
-- ================================================================
--
-- This script prepares an imported production database for safe local development.
-- It is automatically executed by `ldev db import` as a post-import hook.
--
-- CUSTOMIZE the marked sections (search for CUSTOMIZE) for your project.
--
-- WARNING: This script modifies user credentials and anonymizes personal data.
-- Ensure you have a backup before running.
-- ================================================================

-- ================================================================
-- SECTION 1: Company & SAML configuration
-- ================================================================

-- 1. Update company webId to local development value
-- CUSTOMIZE: Replace 'liferay.com' with your production webId
--            Replace 'local.example.edu' with your local webId
UPDATE Company
SET webid = 'local.example.edu',   -- CUSTOMIZE: Your local company ID
    mx = 'local.example.edu'        -- CUSTOMIZE: Your local company ID
WHERE webid = 'liferay.com';        -- CUSTOMIZE: Your production company ID

-- 2. Disable SAML authentication (production config won't work in local)
-- This must be done in SQL because config overrides are per-company.
UPDATE configuration_
SET dictionary = regexp_replace(
    dictionary,
    'saml\.enabled\s*=\s*"true"',
    'saml.enabled="false"',
    'g'
)
WHERE configurationId LIKE '%SamlProviderConfiguration%';

-- ================================================================
-- SECTION 2: Local admin account & anonymize other admins
-- ================================================================

-- 3a. First admin by userid → set to usable local credentials
-- CUSTOMIZE: Set your preferred local admin email and password
UPDATE User_
SET emailaddress      = 'test@local.example.edu',  -- CUSTOMIZE: Your admin email
    password_         = 'test',                      -- CUSTOMIZE: Your admin password
    passwordencrypted = false
WHERE userid = (
    SELECT u.userid
    FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
    ORDER BY u.userid LIMIT 1
);

-- 3b. All other administrator accounts → anonymize
-- Sets random passwords so they cannot be used without resetting.
UPDATE User_
SET emailaddress      = 'admin_' || userid || '@anonymous.local',
    password_         = md5(random()::text || userid::text),
    passwordencrypted = false
WHERE userid IN (
    SELECT u.userid
    FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
)
AND userid != (
    SELECT u.userid
    FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
    ORDER BY u.userid LIMIT 1
);

-- ================================================================
-- SECTION 3: Service components & scheduler cleanup
-- ================================================================

-- 4. Fix service component version mismatches
-- Production may have newer modules than local code. Keep only the oldest
-- build number per namespace to avoid OldServiceComponentException.
DELETE FROM servicecomponent sc1
WHERE EXISTS (
    SELECT 1 FROM servicecomponent sc2
    WHERE sc2.buildnamespace = sc1.buildnamespace
    AND sc2.buildnumber < sc1.buildnumber
);

-- 5. Disable all Dispatch triggers (production jobs not needed locally)
-- Keeps the definitions but marks them inactive to avoid scheduler overhead.
UPDATE DispatchTrigger
SET active_ = false,
    modifiedDate = NOW()
WHERE active_ = true;

-- 6. Clear Quartz scheduler tables
-- Imported scheduler state is not useful for local dev and can cause
-- "job already exists" warnings on startup. Liferay recreates what it needs.
TRUNCATE TABLE
    quartz_fired_triggers,
    quartz_blob_triggers,
    quartz_cron_triggers,
    quartz_simple_triggers,
    quartz_simprop_triggers,
    quartz_triggers,
    quartz_paused_trigger_grps,
    quartz_scheduler_state,
    quartz_job_details,
    quartz_calendars,
    quartz_locks
CASCADE;

-- ================================================================
-- SECTION 4: Fragment propagation optimization
-- ================================================================

-- 7. Pre-propagate outdated fragment links
-- Avoids first-login cold lockups where Liferay propagates fragment changes
-- across all pages. This pre-computes that work during import.
WITH outdated_fragment_links AS (
    SELECT
        fel.fragmentEntryLinkId,
        fe.html,
        fe.css,
        fe.js
    FROM FragmentEntryLink fel
    JOIN FragmentEntry fe
        ON fe.fragmentEntryId = fel.fragmentEntryId
       AND fe.head = true
       AND fe.ctCollectionId = 0
    WHERE fel.fragmentEntryId <> 0
      AND (
        fel.lastPropagationDate IS NULL
        OR fel.lastPropagationDate < fe.modifiedDate
      )
)
UPDATE FragmentEntryLink fel
SET html = o.html,
    css = o.css,
    js = o.js,
    modifiedDate = NOW(),
    lastPropagationDate = NOW()
FROM outdated_fragment_links o
WHERE o.fragmentEntryLinkId = fel.fragmentEntryLinkId;

-- ================================================================
-- SECTION 5: User anonymization (GDPR & local dev safety)
-- ================================================================

-- 8a. Anonymize all non-admin regular users (type_=1)
-- Prevents accidental access to production user information in local dev.
UPDATE User_
SET emailaddress = 'user_' || userid || '@anonymous.local',
    screenname   = 'user_' || userid,
    firstname    = 'User',
    lastname     = userid::text,
    middlename   = '',
    jobtitle     = '',
    comments     = ''
WHERE type_ = 1
  AND userid NOT IN (
      SELECT ur.userid
      FROM Users_Roles ur
      JOIN Role_ r ON ur.roleid = r.roleid
      WHERE r.name = 'Administrator'
  );

-- 8b. Anonymize Contact_ for non-admin users
UPDATE Contact_
SET firstname  = 'User',
    lastname   = Contact_.contactid::text,
    middlename = '',
    birthday   = '1970-01-01'
FROM User_ u
WHERE u.contactid = Contact_.contactid
  AND u.type_ = 1
  AND u.userid != (
      SELECT u2.userid
      FROM User_ u2
      JOIN Users_Roles ur ON u2.userid = ur.userid
      JOIN Role_ r ON ur.roleid = r.roleid
      WHERE r.name = 'Administrator' AND u2.type_ = 1
      ORDER BY u2.userid LIMIT 1
  );

-- ================================================================
-- SECTION 6: Portal configuration
-- ================================================================

-- 9. Set company home URL to your main site
-- CUSTOMIZE: Update '/web/main-site' to match your primary site path
UPDATE Company
SET homeurl = '/web/main-site'     -- CUSTOMIZE: Your main site path
WHERE webid = 'local.example.edu';  -- CUSTOMIZE: Matches SECTION 1 webId

-- ================================================================
-- SECTION 7: OAuth2 cleanup (for ldev integration)
-- ================================================================

-- 10. Reset ldev OAuth2 app
-- The production OAuth app has a clientId that cannot be changed.
-- Deleting it forces ldev to create a fresh app with a new random clientId.
-- After startup, run: ldev oauth install --write-env
DELETE FROM OAuth2ApplicationScope
WHERE oAuth2ApplicationId IN (
    SELECT oAuth2ApplicationId FROM OAuth2Application
    WHERE externalReferenceCode IN ('liferay-cli')
);
DELETE FROM OAuth2Application
WHERE externalReferenceCode IN ('liferay-cli');

-- ================================================================
-- SECTION 8: Data format corrections (optional, version-specific)
-- ================================================================

-- 11. Fix corrupt DDM date fields (Liferay 2025.Q1+)
-- Some date fields in imported content may have incorrect format.
-- Uncomment below if you encounter date-related errors during reindex.
--
-- This fixes patterns like:
--   '201922-07-05' (day appended to year) → '2019-07-22' (correct ISO)
--   '20/02/2020' (DD/MM/YYYY) → '2020-02-20' (YYYY-MM-DD)

/*
UPDATE ddmfieldattribute fa
SET smallattributevalue = regexp_replace(
    fa.smallattributevalue,
    '^([0-9]{4})([0-9]{2})-([0-9]{2})-[0-9]{2}$',
    '\1-\3-\2'
)
FROM ddmfield f
WHERE f.fieldid = fa.fieldid
  AND f.fieldtype = 'date'
  AND fa.smallattributevalue ~ '^[0-9]{6}-[0-9]{2}-[0-9]{2}$';

UPDATE ddmfieldattribute fa
SET smallattributevalue = regexp_replace(
    fa.smallattributevalue,
    '^([0-9]{2})/([0-9]{2})/([0-9]{4})$',
    '\3-\2-\1'
)
FROM ddmfield f
WHERE f.fieldid = fa.fieldid
  AND f.fieldtype = 'date'
  AND fa.smallattributevalue ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$';
*/

-- ================================================================
-- END OF SANITIZATION SCRIPT
-- ================================================================

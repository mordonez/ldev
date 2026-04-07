---
title: PaaS to Local Migration with ldev-native
---

# PaaS to Local Migration with ldev-native

This guide covers the **specific workflow** for migrating a production Liferay instance from Liferay Cloud (PaaS) into a local ldev-native environment.

**When to use this**: You have a running instance on Liferay Cloud and need a full local copy with production data (sanitized for safe development).

**What this adds to First Run Walkthrough**: While [First Run Walkthrough](/first-run-walkthrough) covers creating a new project from scratch, this guide shows how to bring in production data, sanitize it, and keep Document Library in sync.

---

## Quick Start

```bash
# 1. Initialize
ldev project init --name my-project --dir .

# 2. Configure
cp docker/.env.example docker/.env
# Edit docker/.env: LIFERAY_IMAGE, LCP_PROJECT, LCP_ENVIRONMENT

# 3. Download & import production data
ldev db download                           # ~1-2 min
ldev db import                             # ~3-5 min (runs post-import scripts)

# 4. Start & reindex
ldev start                                 # ~3-5 min
ldev portal reindex speedup-on             # ~45-60 min

# 5. OAuth & exports
ldev oauth install --write-env             # <1 min
ldev resource export-structures            # Seconds
ldev resource export-templates
ldev resource export-adts
ldev resource export-fragments

# 6. Document Library (background)
ldev db files-download --background --doclib-dest /path/to/external/storage  # ~1-2h
```

**Total active time**: ~1-1.5 hours (excluding background doclib download)

---

## Prerequisites

### Hardware

- **Disk**: 120+ GB free (DB + imports + doclib + containers)
- **RAM**: 16+ GB allocated to Docker (8 GB minimum for Liferay + Elasticsearch)
- **Storage**: SSD strongly recommended for Docker data
- **For large doclib**: External USB-C SSD or NAS (USB 2.0 will be very slow)

### Software

- Node.js 20+
- `@mordonezdev/ldev` installed
- Docker & `docker compose`
- Git

### Access

- Liferay Cloud credentials
- DXP activation key (if using DXP)
- Portal admin account

---

## Step-by-Step

### 1-2. Project init and configuration

Covered in [First Run Walkthrough](/first-run-walkthrough#1-create-the-project). Key difference: update `docker/.env`:

```bash
ldev project init --name my-project --dir .
cp docker/.env.example docker/.env

# Edit docker/.env:
LIFERAY_IMAGE=liferay/dxp:2025.q1.17-lts   # Your LCP image tag
LCP_PROJECT=my-lcp-project                 # Your LCP project ID
LCP_ENVIRONMENT=staging                    # Which environment to download from
```

### 3. Download production database

```bash
ldev db download
```

Downloads the database backup from your configured LCP environment. Stores in `docker/data/default/`.

**Time**: 1-2 minutes (typical 1-2 GB backup).

### 4. Sanitize and import database

Create `docker/sql/post-import.d/010-adapt-local-db.sql` with sanitization rules:

```bash
mkdir -p docker/sql/post-import.d/
# Copy the template below, customize marked sections
```

Then import:

```bash
ldev db import
```

This runs the post-import script automatically. The script handles:
- Company webId updates (local domain)
- Admin credentials (one usable local account)
- Anonymize non-admin users (GDPR safe)
- Disable SAML, Dispatch, Quartz
- Service component version fixes
- Fragment propagation optimization

**Time**: 3-5 minutes depending on DB size.

### 5-6. Start and reindex

```bash
ldev start
ldev portal reindex speedup-on
```

See [First Run Walkthrough](/first-run-walkthrough#4-start-dxp) for startup details.

**Reindex time**: 45-60 minutes (content-dependent).

### 7. OAuth and resource export

```bash
ldev oauth install --write-env
ldev resource export-structures
ldev resource export-templates
ldev resource export-adts
ldev resource export-fragments
```

See [First Run Walkthrough](/first-run-walkthrough#5-install-the-oauth2-apps-used-by-ldev) for OAuth details.

---

## 8. Document Library Download (Optional)

The Document Library is large (50+ GB typical) and optional initially:

```bash
ldev db files-download --background --doclib-dest /Volumes/external-ssd
```

Use external storage to avoid filling your local SSD. **Time**: 1-2 hours in background.

---

---

## Sanitization Template Reference

Create `docker/sql/post-import.d/010-adapt-local-db.sql` with the following template. **Customize the marked sections** for your project:

```sql
-- Adaptations for imported production database to work in local environment
-- This script is executed automatically after database import by ldev db import

-- ================================================================
-- SECTION 1: Company configuration
-- ================================================================

-- 1. Change company webId to match local config
-- CUSTOMIZE: Replace 'liferay.com' with your production webId
--            Replace 'local.example.edu' with your local webId
UPDATE Company
SET webid = 'local.example.edu',  -- <- CUSTOMIZE LOCAL COMPANY ID
    mx = 'local.example.edu'       -- <- CUSTOMIZE LOCAL COMPANY ID
WHERE webid = 'liferay.com';       -- <- CUSTOMIZE PRODUCTION COMPANY ID

-- 2. Disable SAML (must be done in SQL; file config overrides don't work per-company)
UPDATE configuration_
SET dictionary = regexp_replace(dictionary, 'saml\.enabled\s*=\s*"true"', 'saml.enabled="false"', 'g')
WHERE configurationId LIKE '%SamlProviderConfiguration%';

-- ================================================================
-- SECTION 2: Admin credentials
-- ================================================================

-- 3a. First admin account (by userid) → set to usable local credentials
-- CUSTOMIZE: Change email/password to your local test account
UPDATE User_
SET emailaddress      = 'test@local.example.edu',  -- <- CUSTOMIZE
    password_         = 'test',                      -- <- CUSTOMIZE (or use secure method)
    passwordencrypted = false
WHERE userid = (
    SELECT u.userid
    FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
    ORDER BY u.userid LIMIT 1
);

-- 3b. All other admin accounts → anonymize with random passwords
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
-- SECTION 3: Service components & Scheduler cleanup
-- ================================================================

-- 4. Fix service component version mismatches
-- Production modules may be newer than local code. Keep only the oldest build number per namespace.
DELETE FROM servicecomponent sc1
WHERE EXISTS (
    SELECT 1 FROM servicecomponent sc2
    WHERE sc2.buildnamespace = sc1.buildnamespace
    AND sc2.buildnumber < sc1.buildnumber
);

-- 5. Disable all Dispatch triggers (production jobs not needed locally)
UPDATE DispatchTrigger
SET active_ = false,
    modifiedDate = NOW()
WHERE active_ = true;

-- 6. Clear Quartz scheduler state (avoids "job already exists" warnings)
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
-- SECTION 4: Fragment & Content optimization
-- ================================================================

-- 7. Pre-propagate outdated fragment links (avoids first-login cold lockups)
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
-- SECTION 5: User anonymization (GDPR / local dev safety)
-- ================================================================

-- 8a. Anonymize all non-admin regular users
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

-- 8b. Anonymize Contact_ for all non-admin users
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
-- CUSTOMIZE: Change '/web/main-site' to match your primary site
UPDATE Company
SET homeurl = '/web/main-site'     -- <- CUSTOMIZE TO YOUR MAIN SITE
WHERE webid = 'local.example.edu';  -- <- MATCHES SECTION 1

-- ================================================================
-- SECTION 7: OAuth2 cleanup (for ldev)
-- ================================================================

-- 10. Reset ldev OAuth2 app (production clientId cannot be used locally)
DELETE FROM OAuth2ApplicationScope
WHERE oAuth2ApplicationId IN (
    SELECT oAuth2ApplicationId FROM OAuth2Application
    WHERE externalReferenceCode IN ('liferay-cli')
);
DELETE FROM OAuth2Application WHERE externalReferenceCode IN ('liferay-cli');

-- ================================================================
-- SECTION 8: Data format corrections (if needed)
-- ================================================================

-- 11. Fix corrupt DDM date fields (Liferay 2025.Q1+ specific)
-- Only apply if you encounter date field import errors during reindex
-- Uncomment to enable:

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
```

---

## Troubleshooting PaaS Migration

### "OldServiceComponentException" on startup

**Cause**: Service component version mismatch (production modules newer than local code).

**Fix**: The sanitization script cleans this up. If persists:

```sql
DELETE FROM servicecomponent sc1
WHERE EXISTS (
    SELECT 1 FROM servicecomponent sc2
    WHERE sc2.buildnamespace = sc1.buildnamespace
    AND sc2.buildnumber < sc1.buildnumber
);
```

Then restart: `ldev stop && ldev start`

---

### Reindex is very slow or hangs

**Cause**: Elasticsearch heap too small or corrupted indices from production.

**Solutions**:
- Increase heap in `docker/.env`: `ELASTICSEARCH_HEAP_SIZE=4g`
- Or index per-site: `ldev portal reindex --site /my-site`
- Check logs: `ldev logs follow --service liferay | grep -i index`

---

### OAuth install fails: "Portal requires first login"

**Cause**: Setup wizard not completed.

**Fix**:
1. Open http://localhost:8080
2. Log in with admin account from sanitization script
3. Complete setup wizard
4. Run `ldev oauth install --write-env` again

See [First Run Walkthrough OAuth section](/first-run-walkthrough#5-install-the-oauth2-apps-used-by-ldev) for details.

---

### Doclib download is slow

**Cause**: Network to LCP or slow USB storage.

**Solutions**:
- Use external USB-C SSD (not USB 2.0)
- Download during off-peak hours
- Optional: download initially without doclib, add later

---

## Next Steps

1. **Commit** your work: `git add docker/ liferay/ && git commit -m "feat: add ldev-native with PaaS migration"`
2. **Export** all resources: See step 7 above
3. **Install AI** (optional): `ldev ai install --target . --project`
4. **Document** any project-specific customizations in a local `ONBOARDING.md`

See [First Run Walkthrough](/first-run-walkthrough) for the full post-import workflow (AI install, export/import cycle, etc.).

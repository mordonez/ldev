---
title: PaaS to Local Migration
description: Migrate Liferay projects from Liferay Cloud (PaaS) to a local Docker-Native environment using ldev.
---

# PaaS to Local Migration with ldev-native

This guide covers the **specific workflow** for migrating a production Liferay instance from Liferay Cloud (PaaS) into a local ldev-native environment.

**When to use this**: You have a running instance on Liferay Cloud and need a full local copy with production data (sanitized for safe development).

For steps that are identical to a fresh setup (OAuth, resource exports, AI install), see [First Run Walkthrough](/first-run-walkthrough).

---

## Quick Start

```bash
# 1. Initialize
ldev project init --name my-project --dir .

# 2. Configure docker/.env
cp docker/.env.example docker/.env
# Edit: LIFERAY_IMAGE, LCP_PROJECT, LCP_ENVIRONMENT

# 3. Download & import production data
ldev db download                           # ~1-2 min
ldev db import                             # ~3-5 min (runs post-import scripts)

# 4. Start & reindex
ldev start                                 # ~3-5 min
ldev portal reindex speedup-on             # ~45-60 min

# 5. OAuth & exports (same as First Run Walkthrough)
ldev oauth install --write-env
ldev resource export-structures
ldev resource export-templates
ldev resource export-adts
ldev resource export-fragments

# 6. Document Library (optional, background)
ldev db files-download --background --doclib-dest /Volumes/external-ssd
```

**Total active time**: ~1-1.5 hours (doclib downloads in background).

---

## Prerequisites

- **Hardware**: 16+ GB RAM, 120+ GB disk, SSD recommended
- **Software**: Node.js 20+, Docker, `@mordonezdev/ldev`
- **Access**: Liferay Cloud credentials, DXP activation key

---

## Step-by-Step

### 1. Configure docker/.env

Key variables:

```bash
LIFERAY_IMAGE=liferay/dxp:2025.q1.17-lts   # Your LCP image tag
LCP_PROJECT=my-lcp-project                 # Your LCP project ID
LCP_ENVIRONMENT=staging                    # dev, staging, or prd
```

See [Configuration Reference](/configuration) for other options.

### 2. Download Database

```bash
ldev db download
```

Downloads backup from your LCP environment (~1-2 min for typical instances).

### 3. Sanitize and Import

Create `docker/sql/post-import.d/010-adapt-local-db.sql` with your customizations:

```bash
mkdir -p docker/sql/post-import.d/
# Copy sanitization template (see below), customize marked sections
```

Then:

```bash
ldev db import
```

This runs all post-import scripts automatically (~3-5 min).

### 4. Start and Reindex

```bash
ldev start                       # ~3-5 min
ldev portal reindex speedup-on   # ~45-60 min
```

### 5-7. OAuth, Exports, AI (Same as First Run)

These steps are identical to [First Run Walkthrough](/first-run-walkthrough):

```bash
ldev oauth install --write-env
ldev resource export-structures
ldev resource export-templates
ldev resource export-adts
ldev resource export-fragments
ldev ai install --target . --project  # optional
```

---

## Sanitization Template

Create `docker/sql/post-import.d/010-adapt-local-db.sql`:

```sql
-- Adaptations for imported production database to work in local environment

-- 1. Change company webId to match local config
UPDATE Company
SET webid = 'local.example.edu',   -- CUSTOMIZE YOUR LOCAL COMPANY ID
    mx = 'local.example.edu'
WHERE webid = 'liferay.com';       -- CUSTOMIZE YOUR PRODUCTION COMPANY ID

-- 2. Disable SAML
UPDATE configuration_
SET dictionary = regexp_replace(dictionary, 'saml\.enabled\s*=\s*"true"', 'saml.enabled="false"', 'g')
WHERE configurationId LIKE '%SamlProviderConfiguration%';

-- 3a. First admin account → set to usable local credentials
UPDATE User_
SET emailaddress = 'test@local.example.edu',  -- CUSTOMIZE
    password_ = 'test',                        -- CUSTOMIZE (or use secure method)
    passwordencrypted = false
WHERE userid = (
    SELECT u.userid FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
    ORDER BY u.userid LIMIT 1
);

-- 3b. Other admins → anonymize
UPDATE User_
SET emailaddress = 'admin_' || userid || '@anonymous.local',
    password_ = md5(random()::text || userid::text),
    passwordencrypted = false
WHERE userid IN (
    SELECT u.userid FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
)
AND userid != (
    SELECT u.userid FROM User_ u
    JOIN Users_Roles ur ON u.userid = ur.userid
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator' AND u.type_ = 1
    ORDER BY u.userid LIMIT 1
);

-- 4. Fix service component version mismatches
DELETE FROM servicecomponent sc1
WHERE EXISTS (
    SELECT 1 FROM servicecomponent sc2
    WHERE sc2.buildnamespace = sc1.buildnamespace
    AND sc2.buildnumber < sc1.buildnumber
);

-- 5. Disable Dispatch triggers
UPDATE DispatchTrigger
SET active_ = false, modifiedDate = NOW()
WHERE active_ = true;

-- 6. Clear Quartz scheduler state
TRUNCATE TABLE
    quartz_fired_triggers, quartz_blob_triggers, quartz_cron_triggers,
    quartz_simple_triggers, quartz_simprop_triggers, quartz_triggers,
    quartz_paused_trigger_grps, quartz_scheduler_state, quartz_job_details,
    quartz_calendars, quartz_locks
CASCADE;

-- 7. Pre-propagate fragment links (avoid first-login lockups)
WITH outdated_fragment_links AS (
    SELECT fel.fragmentEntryLinkId, fe.html, fe.css, fe.js
    FROM FragmentEntryLink fel
    JOIN FragmentEntry fe ON fe.fragmentEntryId = fel.fragmentEntryId
        AND fe.head = true AND fe.ctCollectionId = 0
    WHERE fel.fragmentEntryId <> 0
      AND (fel.lastPropagationDate IS NULL OR fel.lastPropagationDate < fe.modifiedDate)
)
UPDATE FragmentEntryLink fel
SET html = o.html, css = o.css, js = o.js, modifiedDate = NOW(), lastPropagationDate = NOW()
FROM outdated_fragment_links o
WHERE o.fragmentEntryLinkId = fel.fragmentEntryLinkId;

-- 8. Anonymize non-admin users (GDPR safety)
UPDATE User_
SET emailaddress = 'user_' || userid || '@anonymous.local',
    screenname = 'user_' || userid,
    firstname = 'User',
    lastname = userid::text,
    middlename = '', jobtitle = '', comments = ''
WHERE type_ = 1 AND userid NOT IN (
    SELECT ur.userid FROM Users_Roles ur
    JOIN Role_ r ON ur.roleid = r.roleid
    WHERE r.name = 'Administrator'
);

-- 9. Set company home URL
UPDATE Company
SET homeurl = '/web/main-site'     -- CUSTOMIZE YOUR MAIN SITE
WHERE webid = 'local.example.edu';

-- 10. Reset OAuth2 app (production clientId won't work locally)
DELETE FROM OAuth2ApplicationScope WHERE oAuth2ApplicationId IN (
    SELECT oAuth2ApplicationId FROM OAuth2Application
    WHERE externalReferenceCode = 'liferay-cli'
);
DELETE FROM OAuth2Application WHERE externalReferenceCode = 'liferay-cli';
```

**Customize marked sections**:
1. Company webId (production → local)
2. Admin credentials
3. Home URL (your main site)

---

## Troubleshooting

### "OldServiceComponentException" on startup

The sanitization script handles this. If you still see it:

```sql
DELETE FROM servicecomponent
WHERE buildnumber > (SELECT MAX(buildnumber) FROM servicecomponent);
```

Then restart.

### Reindex is slow

Increase Elasticsearch heap in `docker/.env`:

```bash
ELASTICSEARCH_HEAP_SIZE=4g
```

Or index per-site: `ldev portal reindex --site /my-site`

### OAuth install fails: "Portal requires first login"

Complete the setup wizard in the browser, then try again. See [First Run Walkthrough](/first-run-walkthrough#5-install-the-oauth2-apps-used-by-ldev).

### Doclib download is slow

Use external USB-C SSD, not USB 2.0. Download during off-peak hours.

---

## Next Steps

1. **Commit**: `git add docker/ liferay/ && git commit -m "feat: add ldev-native with PaaS migration"`
2. **Export** all resources (see Quick Start, step 5)
3. **Install AI** (optional): `ldev ai install --target . --project`

For the complete post-import workflow, see [First Run Walkthrough](/first-run-walkthrough).

---

## See Also

- [First Run Walkthrough](/first-run-walkthrough)
- [Configuration Reference](/configuration)
- [Resource Migration Pipeline](/resource-migration-pipeline)

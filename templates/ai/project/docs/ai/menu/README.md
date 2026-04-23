# AI Navigation Menus

This folder is an optional project-owned contract for back office navigation
used by coding agents and browser automation.

## Canonical files (default suggestion)

- docs/ai/menu/navigation.i18n.json
- docs/ai/menu/menu_admin.i18n.json
- docs/ai/menu/sidebar_menu.i18n.json

You can store this contract in a different path if your project prefers.
If you do, declare the chosen path in `docs/ai/project-context.md` and keep one
single entrypoint JSON for agents.

## Why this exists

Many Liferay admin paths are project-specific.
A stable map avoids brittle click-navigation and speeds up reproduction.

## Data contract

Each item in a menu map should include:

- itemId: local helper identifier inside the normalized file
- label: visible literal for agent fallback selectors
- path: direct navigation path

Use these placeholders when needed:

- {site}: site friendly URL without locale prefix (example: ub)
- {siteGroupId}: value used in p_v_l_s_g_id query params

Resolve placeholders with:

1. ldev context --json (liferay.portalUrl)
2. ldev portal inventory sites --json (siteFriendlyUrl and groupId)

## Starter coverage

The JSON files shipped in this template are intentionally minimal starter
examples. They do not include all standard Liferay menus.

Reasons:

- menu visibility changes by role/permission
- menu labels and grouping vary by DXP version and language packs
- many projects add custom applications and custom menu entries

Treat the starter files as schema examples and extend them with your full
project menu inventory.

## Authentication

menu_admin.i18n.json and sidebar_menu.i18n.json represent authenticated admin
navigation, not anonymous public navigation.

Before using those paths in browser automation:

1. Open the login page
2. Authenticate with an admin-capable test user for the project
3. Navigate to the configured path

## Ownership

These files are project-owned context.
Keep them updated in the project repository and do not move project literals
into vendor-managed skills.

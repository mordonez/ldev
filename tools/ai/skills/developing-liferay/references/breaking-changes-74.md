# Liferay 7.4 Breaking Changes Reference

Use this reference when developing for Liferay 7.4+ to avoid using deprecated APIs or deprecated patterns.

**Official Documentation**: [Liferay 7.4 Breaking Changes](https://learn.liferay.com/w/dxp/self-hosted-installation-and-upgrades/upgrading-liferay/deprecations-and-breaking-changes-reference/7-4-deprecations-and-breaking-changes/7-4-breaking-changes)

## 🏗️ Impact on Development

### 1. API & OSGi
*   **Kernel -> Impl Moves**: Many utility classes moved from `portal-kernel` to `portal-impl`. If a dependency is missing, check if it was moved.
*   **Removed Interfaces**: `BaseModelPermissionChecker` (use `ModelResourcePermission`), `OpenId` (use `OpenIdConnect`).
*   **Method Renames**: `PortletDisplay.getPortletSetup` -> `getPortletPreferences`, `CPContentHelper.hasDirectReplacement` -> `isDirectReplacement`.

### 2. Content Architecture (Journal)
*   **Structures**: Articles now use `DDMStructureId` instead of `DDMStructureKey`. Ensure custom code or FTLs use the correct ID.
*   **A/B Testing**: Only 1 variant + control supported.

### 3. Frontend & Taglibs
*   **Taglib Removals**: `liferay-chart` taglibs (Soy support removed).
*   **Fragments**: "Mark as Cacheable" moved to the Fragments action menu.

### 4. Configuration
Many `portal.properties` moved to **Instance/System Settings**. Check before adding to `portal-ext.properties`.

## 🛡️ Best Practices for 7.4
- Prefer OSGi services over legacy `*Util` classes.
- Use JDK 11.
- Ensure Elasticsearch is at least 7.17.

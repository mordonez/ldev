# Liferay 7.4 Breaking Changes Reference

Use this reference when diagnosing unexplained failures, upgrade issues, or unexpected behavior in Liferay 7.4+.

**Official Documentation**: [Liferay 7.4 Breaking Changes](https://learn.liferay.com/w/dxp/self-hosted-installation-and-upgrades/upgrading-liferay/deprecations-and-breaking-changes-reference/7-4-deprecations-and-breaking-changes/7-4-breaking-changes)

## ⚠️ High-Impact Troubleshooting Areas

### 1. System & Connectivity
*   **Elasticsearch (Min 7.17)**: The portal **will not start** if the version is lower.
*   **JDK 11 Required**: JDK 8 support ends in Q4 2024.
*   **Database Config**: `sql.data.max.parameters` is now `database.max.parameters`.

### 2. Functional Regressions (Journal & UX)
*   **Structures (Journal)**: Articles now use `DDMStructureId` instead of `DDMStructureKey`. Custom code or FTLs relying on the key will fail.
*   **WebDAV Auth**: Requires `userId` (not email/screen name) and a generated password for Digest Auth.
*   **A/B Testing**: Only 1 variant + control supported now.
*   **Document Library**: Default "No Cache" for downloads without Guest permissions.

### 3. API & Development (OSGi/Modules)
*   **Refactored Utils**: Many classes moved from `portal-kernel` to `portal-impl`. If a bundle fails to resolve or a class is missing, check if it was moved:
    *   `PersistedModelLocalServiceRegistryUtil`
    *   `HttpAuthManagerUtil`
    *   `ImageToolUtil`
    *   `AuthenticatedSessionManagerUtil`
    *   `XmlRpcUtil`
    *   `ModelAdapterUtil`
*   **Removed Interfaces**: `BaseModelPermissionChecker` (use `ModelResourcePermission`), `OpenId` (use `OpenIdConnect`), `PermissionConverterUtil` (use OSGi service).

### 4. Configuration (portal.properties)
Many properties were removed or moved to **System/Instance Settings** UI. If a `portal-ext.properties` setting is ignored, check if it still exists (e.g., `discussion.*`, `layout.comments.*`, `dl.file.entry.*`).

## 🛠️ Diagnostics for "Unknown Problems"

1.  **Check Logs for `ClassNotFoundException` or `NoClassDefFoundError`**: Could be a Kernel -> Impl move.
2.  **Verify Bundle Resolution**: Use `task osgi:diag` to see if a removed interface is causing a wiring failure.
3.  **Validate Structure FTLs**: If Journal articles fail to render, check if they rely on `DDMStructureKey`.
4.  **Confirm Elasticsearch version**: `curl localhost:9200`.

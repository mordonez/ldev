# Liferay Headless OpenAPI Catalog

Use `ldev context --json` and read `env.portalUrl`; replace `<portalUrl>` with
that value instead of hardcoding a host or port. In a local runtime,
`<portalUrl>` is often `http://127.0.0.1:8080` or `http://localhost:8080`.

These URLs expose the OpenAPI specs for the headless REST modules available in
the portal. Use them to inspect exact paths, schemas and operation IDs before
writing ad hoc REST calls.

## Useful workflow

```bash
ldev context --json
curl "<portalUrl>/o/headless-delivery/v1.0/openapi.json"
curl "<portalUrl>/o/headless-admin-site/v1.0/openapi.json"
curl "<portalUrl>/o/data-engine/v2.0/openapi.json"
```

If a spec endpoint requires authentication, use the OAuth2 configuration from
`ldev context --json` or prefer the existing `ldev portal` and `ldev resource`
commands when they already cover the workflow.

## OpenAPI endpoints

| Area | OpenAPI URL |
|---|---|
| Analytics Reports | `<portalUrl>/o/analytics-reports-rest/v1.0/openapi.json` |
| Analytics Settings | `<portalUrl>/o/analytics-settings-rest/v1.0/openapi.json` |
| Batch Planner | `<portalUrl>/o/batch-planner/v1.0/openapi.json` |
| Bulk | `<portalUrl>/o/bulk/v1.0/openapi.json` |
| Captcha | `<portalUrl>/o/captcha/v1.0/openapi.json` |
| Change Tracking | `<portalUrl>/o/change-tracking-rest/v1.0/openapi.json` |
| Data Engine | `<portalUrl>/o/data-engine/v2.0/openapi.json` |
| Digital Signature | `<portalUrl>/o/digital-signature-rest/v1.0/openapi.json` |
| Dispatch | `<portalUrl>/o/dispatch-rest/v1.0/openapi.json` |
| Functional Cookies Entries | `<portalUrl>/o/functional-cookies-entries/openapi.json` |
| Headless Admin Address | `<portalUrl>/o/headless-admin-address/v1.0/openapi.json` |
| Headless Admin Content | `<portalUrl>/o/headless-admin-content/v1.0/openapi.json` |
| Headless Admin List Type | `<portalUrl>/o/headless-admin-list-type/v1.0/openapi.json` |
| Headless Admin Site | `<portalUrl>/o/headless-admin-site/v1.0/openapi.json` |
| Headless Admin Taxonomy | `<portalUrl>/o/headless-admin-taxonomy/v1.0/openapi.json` |
| Headless Admin User | `<portalUrl>/o/headless-admin-user/v1.0/openapi.json` |
| Headless Admin Workflow | `<portalUrl>/o/headless-admin-workflow/v1.0/openapi.json` |
| Headless Batch Engine | `<portalUrl>/o/headless-batch-engine/v1.0/openapi.json` |
| Headless Commerce Admin Account | `<portalUrl>/o/headless-commerce-admin-account/v1.0/openapi.json` |
| Headless Commerce Admin Catalog | `<portalUrl>/o/headless-commerce-admin-catalog/v1.0/openapi.json` |
| Headless Commerce Admin Channel | `<portalUrl>/o/headless-commerce-admin-channel/v1.0/openapi.json` |
| Headless Commerce Admin Inventory | `<portalUrl>/o/headless-commerce-admin-inventory/v1.0/openapi.json` |
| Headless Commerce Admin Order | `<portalUrl>/o/headless-commerce-admin-order/v1.0/openapi.json` |
| Headless Commerce Admin Payment | `<portalUrl>/o/headless-commerce-admin-payment/v1.0/openapi.json` |
| Headless Commerce Admin Pricing v1 | `<portalUrl>/o/headless-commerce-admin-pricing/v1.0/openapi.json` |
| Headless Commerce Admin Pricing v2 | `<portalUrl>/o/headless-commerce-admin-pricing/v2.0/openapi.json` |
| Headless Commerce Admin Shipment | `<portalUrl>/o/headless-commerce-admin-shipment/v1.0/openapi.json` |
| Headless Commerce Admin Site Setting | `<portalUrl>/o/headless-commerce-admin-site-setting/v1.0/openapi.json` |
| Headless Commerce Delivery Cart | `<portalUrl>/o/headless-commerce-delivery-cart/v1.0/openapi.json` |
| Headless Commerce Delivery Catalog | `<portalUrl>/o/headless-commerce-delivery-catalog/v1.0/openapi.json` |
| Headless Commerce Delivery Order | `<portalUrl>/o/headless-commerce-delivery-order/v1.0/openapi.json` |
| Headless Commerce Machine Learning | `<portalUrl>/o/headless-commerce-machine-learning/v1.0/openapi.json` |
| Headless Delivery | `<portalUrl>/o/headless-delivery/v1.0/openapi.json` |
| Headless Form | `<portalUrl>/o/headless-form/v1.0/openapi.json` |
| Headless Portal Instances | `<portalUrl>/o/headless-portal-instances/v1.0/openapi.json` |
| Headless Site | `<portalUrl>/o/headless-site/v1.0/openapi.json` |
| Headless User Notification | `<portalUrl>/o/headless-user-notification/v1.0/openapi.json` |
| Language | `<portalUrl>/o/language/v1.0/openapi.json` |
| Necessary Cookies Entries | `<portalUrl>/o/necessary-cookies-entries/openapi.json` |
| Notification | `<portalUrl>/o/notification/v1.0/openapi.json` |
| Object Admin | `<portalUrl>/o/object-admin/v1.0/openapi.json` |
| Performance Cookies Entries | `<portalUrl>/o/performance-cookies-entries/openapi.json` |
| Personalization Cookies Entries | `<portalUrl>/o/personalization-cookies-entries/openapi.json` |
| Portal Workflow Metrics | `<portalUrl>/o/portal-workflow-metrics/v1.0/openapi.json` |
| SAML Admin | `<portalUrl>/o/saml-admin/v1.0/openapi.json` |
| SCIM | `<portalUrl>/o/scim/v1.0/openapi.json` |
| Search | `<portalUrl>/o/search/v1.0/openapi.json` |
| Search Experiences | `<portalUrl>/o/search-experiences-rest/v1.0/openapi.json` |
| Segments ASAH | `<portalUrl>/o/segments-asah/v1.0/openapi.json` |

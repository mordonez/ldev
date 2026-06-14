# Runtime Resource Production Handoff

Use this reference when the final handoff explains how to promote a runtime-backed
resource to production.

This applies to resources such as Journal templates, ADTs, structures, and
fragments. The promotion target is the runtime resource itself, not a theme or
module deploy.

## Required handoff contract

When production promotion is mentioned for a runtime-backed resource, the handoff
must include all of the following:

1. **Preferred path** — the `ldev resource ...` command sequence when that path
   is available in the target environment.
2. **Manual UI fallback** — the equivalent Liferay UI path when remote `ldev`
   access is not guaranteed.
3. **Resource identity** — site scope plus exact key, template, ADT, or fragment
   identifier so the human can find the same object in the UI.
4. **Equivalence statement** — say explicitly that the UI fallback applies the
   same runtime resource and must not be replaced with theme or module deploy.
5. **Post-apply verification** — what to check after import or manual update.

Do not write production notes that only mention `ldev` when the real workflow
may require UI-based promotion.

## Manual UI fallback by resource type

UI labels vary by Liferay version, edition, and language pack. Use the site or
global scope resolved during discovery and adapt the exact menu label to the
target environment.

### Journal template

1. Open the resolved site scope, such as `/global`.
2. Go to the Web Content administration area and open **Templates**.
3. Find the template by the exact template key or name from the handoff.
4. Open the existing template and replace the template script with the reviewed
   repository content.
5. Save or publish the template.

### ADT

1. Open the resolved site scope.
2. Go to the Application Display Template or owning display-template UI for the
   relevant widget or content type.
3. Find the ADT by the exact ADT key, display style, or name from the handoff.
4. Replace the template script with the reviewed repository content.
5. Save or publish the ADT.

### Structure

1. Open the resolved site scope.
2. Go to the Web Content administration area and open **Structures**.
3. Find the structure by the exact structure key or name from the handoff.
4. If the UI supports structure import in that environment, import the reviewed
   structure definition. Otherwise, open the existing structure and apply the
   reviewed field and settings changes manually.
5. Save or publish the structure.

### Fragment

1. Open the resolved site scope.
2. Go to **Fragments**.
3. Find the fragment collection and fragment by the exact identifiers from the
   handoff.
4. If the environment uses fragment import packages, import the reviewed asset.
   Otherwise, open the fragment and apply the reviewed HTML, CSS, JS, and
   configuration changes manually.
5. Publish the fragment if the UI requires it.

## Required wording in the handoff

Use wording with this shape:

- **Preferred path (`ldev`)**: the exact atomic import commands.
- **Manual UI fallback**: how to locate and update the same runtime resource in
  Liferay when `ldev` cannot be executed against production.
- **Important**: this is a runtime resource change; do not deploy a theme or
  module to apply it.

## Verification after apply

After either the `ldev` path or the manual UI fallback:

- confirm the resolved resource now matches the intended reviewed content
- verify the affected page or widget visually
- confirm the expected symptom or behavior changed in the runtime, not only in Git
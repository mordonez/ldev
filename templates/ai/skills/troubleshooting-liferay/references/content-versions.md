# Content Versions Management

Use this reference when a content item has too many versions accumulated, when
empty linguistic versions are causing problems, or when a cleanup of old
revisions is needed.

This is distinct from `ldev portal content prune`, which removes complete
articles by count. This reference covers per-article version history and
language version issues.

## Diagnosing the version volume problem

First confirm the scope. Get article volume per site:

```bash
ldev portal inventory sites --with-content --sort-by content
```

If a structure generates many versions (e.g. a sync process creates a new
version on every run), identify which structure is the source:

```bash
ldev portal inventory sites --site /<site> --with-structures --limit 20
```

To count versions on a specific article, use MCP or the headless API after
confirming availability:

```bash
ldev mcp check --json
```

## Reducing version history via portal UI

For individual articles:

1. Open the article in **Web Content Administration**.
2. Select the article → **Actions → Expire**.
3. Or use **Actions → View History** to see the version list.
4. In version history, older revisions can be individually deleted via UI.

For bulk version cleanup, prefer a Groovy script (see below).

## Groovy script for bulk version cleanup

See `../../developing-liferay/references/groovy-console.md` for console access.

Preview articles with many versions before deleting:

```groovy
import com.liferay.journal.service.JournalArticleLocalServiceUtil

long groupId = <groupId> // from ldev portal inventory sites --json

def articles = JournalArticleLocalServiceUtil.getArticles(groupId, 0, -1)
def articlesByVersion = articles
    .groupBy { it.articleId }
    .findAll { k, v -> v.size() > 5 }

articlesByVersion.each { articleId, versions ->
    out.println("articleId: ${articleId} | versions: ${versions.size()}")
}
```

Cleanup older versions for a single article (leave the N most recent):

```groovy
import com.liferay.journal.service.JournalArticleLocalServiceUtil

long groupId = <groupId>
String articleId = "<ARTICLE_ID>"
int keepCount = 5 // number of most recent versions to keep

def versions = JournalArticleLocalServiceUtil.getArticlesByArticleId(groupId, articleId)
    .sort { a, b -> b.version <=> a.version } // newest first

versions.drop(keepCount).each { article ->
    JournalArticleLocalServiceUtil.deleteArticle(article)
    out.println("Deleted version ${article.version} of article ${article.articleId}")
}
```

> Always run preview first. Deletions via Groovy are not reversible.

## Empty linguistic versions

Symptoms: articles with empty or partially empty translations; language switcher
shows a page but the content is blank; imports created stub language versions.

### Diagnose

1. In Web Content Administration, open the article.
2. Select each language from the language selector.
3. Empty translations will show a blank title or empty body.

### Fix via portal UI

1. In the article editor, select the empty language version using the language
   selector on the title field.
2. Click the **delete language** icon (trashcan next to the language flag),  
   if the portal version supports per-language deletion.
3. If not available: fill the translation with placeholder text and republish,
   then remove via Groovy if needed.

### Fix via Groovy script (bulk)

Remove a specific translation from all articles of a given structure:

```groovy
import com.liferay.journal.service.JournalArticleLocalServiceUtil
import com.liferay.portal.kernel.service.ServiceContextThreadLocal

long groupId = <groupId>
String structureKey = "<STRUCTURE_KEY>"
String locale = "ca_ES" // the locale to remove

def articles = JournalArticleLocalServiceUtil.getArticles(groupId)
    .findAll { it.DDMStructureKey == structureKey }

articles.each { article ->
    def xmlContent = article.getContent()
    if (xmlContent?.contains("language-id=\"${locale}\"")) {
        out.println("Would remove locale ${locale} from article ${article.articleId}")
        // To actually remove: modify the XML or use the API to update the article
    }
}
```

> Language content in Journal articles is embedded in the XML. Programmatic
> removal requires reconstructing the content XML and calling
> `JournalArticleLocalServiceUtil.updateArticle(...)`. Test in PRE first.

## After version cleanup

Reindex Journal content after bulk version deletions to keep search consistent:

```bash
ldev portal reindex watch --json
```

Monitor:

```bash
ldev portal reindex status --json
ldev logs diagnose --since 10m --json
```

## Guardrails

- Never run bulk version deletion on production without a prior database backup.
- Use `ldev db sync` to bring a production snapshot locally before testing
  cleanup scripts.
- Groovy version deletions bypass workflow — verify the article is not in an
  active approval workflow before deleting versions.
- After cleanup, verify with `ldev portal inventory sites --with-content` that
  total article counts are as expected.
- If the version accumulation is caused by a sync process (e.g. external API
  updating content on every run), the root fix is in the sync logic, not in
  the cleanup script.

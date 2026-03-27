type TemplateNormalizer = (content: string) => string;

const TEMPLATE_NORMALIZERS: TemplateNormalizer[] = [
  stripVolatilePortletAuthToken,
  stripVolatileCacheBusterParam,
  stripInternalLiferayOrigin,
];

export function normalizeLiferayTemplateScript(content: string): string {
  return TEMPLATE_NORMALIZERS.reduce((current, normalizer) => normalizer(current), content);
}

function stripVolatilePortletAuthToken(content: string): string {
  return content
    .replaceAll(/([?&])p_p_auth=[^"'&\s]+&/g, '$1')
    .replaceAll(/([?&])p_p_auth=[^"'&\s]+(?=["'&\s]|$)/g, '')
    .replaceAll('?&', '?')
    .replaceAll('&&', '&')
    .replaceAll('?\"', '"')
    .replaceAll("?'", "'")
    .replaceAll('? ', ' ')
    .replaceAll('&\"', '"')
    .replaceAll("&'", "'")
    .replaceAll('& ', ' ');
}

function stripVolatileCacheBusterParam(content: string): string {
  return content
    .replaceAll(/([?&]|&amp;)t=\d+(?=(&|&amp;|["'\s]|$))/g, '')
    .replaceAll('?&', '?')
    .replaceAll('?&amp;', '?')
    .replaceAll('&&', '&')
    .replaceAll('&amp;&amp;', '&amp;')
    .replaceAll('&amp;&', '&amp;')
    .replaceAll('&?\"', '"')
    .replaceAll("&?'", "'")
    .replaceAll('&? ', ' ')
    .replaceAll('&amp;"', '"')
    .replaceAll("&amp;'", "'")
    .replaceAll('&amp; ', ' ');
}

function stripInternalLiferayOrigin(content: string): string {
  return content.replaceAll(/https?:\/\/[^/"'\s]+(?=\/(?:group|web|o|c|documents)\b)/g, '');
}

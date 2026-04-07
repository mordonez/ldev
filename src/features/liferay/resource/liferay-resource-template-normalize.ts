type TemplateNormalizer = (content: string) => string;

const TEMPLATE_NORMALIZERS: TemplateNormalizer[] = [
  stripVolatilePortletAuthToken,
  stripVolatileCacheBusterParam,
  stripInternalLiferayOrigin,
  stripInsignificantTagSpacing,
];

export function normalizeLiferayTemplateScript(content: string): string {
  return TEMPLATE_NORMALIZERS.reduce((current, normalizer) => normalizer(current), content);
}

function stripVolatilePortletAuthToken(content: string): string {
  return content
    .replaceAll(/([?&])p_p_auth=[^"'&\s]+&/g, '$1')
    .replaceAll(/([?&])p_p_auth=[^"'&\s]+(?=["'&\s]|$)/g, '')
    .replaceAll(/\?&(?=[^"'&\s])/g, '?')
    .replaceAll(/&&(?=[^"'&\s])/g, '&')
    .replaceAll(/\?(?=["'])/g, '')
    .replaceAll(/&(?=["'])/g, '');
}

function stripVolatileCacheBusterParam(content: string): string {
  return content
    .replaceAll(/([?&]|&amp;)t=\d+(?=(&|&amp;|["'\s]|$))/g, '')
    .replaceAll(/\?&(?=[^"'&\s])/g, '?')
    .replaceAll(/\?&amp;(?=[^"'&\s])/g, '?')
    .replaceAll(/&&(?=[^"'&\s])/g, '&')
    .replaceAll(/&amp;&amp;(?=[^"'&\s])/g, '&amp;')
    .replaceAll(/&amp;&(?=[^"'&\s])/g, '&amp;')
    .replaceAll(/([?&]|&amp;)(?=["'])/g, '');
}

function stripInternalLiferayOrigin(content: string): string {
  return content.replaceAll(/https?:\/\/[^/"'\s]+(?=\/(?:group|web|o|c|documents)\b)/g, '');
}

function stripInsignificantTagSpacing(content: string): string {
  return content.replaceAll(/"\s+>/g, '">');
}

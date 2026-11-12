/** Extract JSON values without evaluating any upstream JavaScript. */
export function pageData(source: string): Record<string, any> {
  const result: Record<string, any> = {};
  const marker = /WH\.setPageData\(['"]([^'"]+)['"],\s*/g;
  for (let match; (match = marker.exec(source));) {
    const start = marker.lastIndex;
    let depth = 0,
      quoted = false,
      escaped = false,
      end = start;
    for (; end < source.length; end++) {
      const char = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") {
        if (--depth === 0) {
          end++;
          break;
        }
      } else if (depth === 0 && char === ")") break;
    }
    result[match[1]] = JSON.parse(source.slice(start, end));
    marker.lastIndex = end;
  }
  return result;
}

export function allowedAsset(path: string): boolean {
  return (
    /^(?:viewer\/viewer\.min\.js(?:\.LICENSE\.txt)?|meta\/(?:character|charactercustomization|npc|item|itemvisual|spellvisualkit)\/\d+\.json|meta\/armor\/\d+\/\d+\.json|(?:m2|skin|skel|anim|bone)\/\d+\.(?:m2|skin|skel|anim|bone)|textures\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg))$/.test(
      path,
    ) && !path.includes("..")
  );
}

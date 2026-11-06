export function fallbackRecipeReferences(
  query: string,
  image?: { title: string; url: string; imageUrl: string },
) {
  const encoded = encodeURIComponent(`${query} 레시피`);
  const verifiedAt = new Date().toISOString();
  return [
    ...(image ? [{
      title: image.title,
      url: image.url,
      sourceType: "WEB" as const,
      sourceName: "ko.wikipedia.org",
      imageUrl: image.imageUrl,
      verifiedAt,
    }] : []),
    {
      title: `만개의레시피에서 ${query} 찾기`,
      url: `https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(query)}`,
      sourceType: "WEB" as const,
      sourceName: "10000recipe.com",
      verifiedAt,
    },
    {
      title: `YouTube에서 ${query} 레시피 찾기`,
      url: `https://www.youtube.com/results?search_query=${encoded}`,
      sourceType: "YOUTUBE" as const,
      sourceName: "youtube.com",
      verifiedAt,
    },
    {
      title: `Google에서 ${query} 레시피 찾기`,
      url: `https://www.google.com/search?q=${encoded}`,
      sourceType: "WEB" as const,
      sourceName: "google.com",
      verifiedAt,
    },
  ];
}

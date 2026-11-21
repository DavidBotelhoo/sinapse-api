// Busca da Comunidade ("Buscar por nome ou assunto"): o nome do deck vai para o banco
// (ILIKE, sensivel a acento); as materias do curso sao poucas e comparadas aqui, sem acento.

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchSubjectIds(
  subjects: ReadonlyArray<{ id: string; name: string }>,
  q: string,
): string[] {
  const needle = normalizeSearch(q);
  if (needle.length === 0) return [];
  return subjects.filter((s) => normalizeSearch(s.name).includes(needle)).map((s) => s.id);
}

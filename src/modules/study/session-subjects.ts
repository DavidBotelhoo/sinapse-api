export interface SubjectRef {
  id: string;
  slug: string;
  name: string;
}

// Materias de uma sessao ("Farmacologia e Fisiologia · 20 cards"): as que tem mais cards primeiro.
// Quando a pessoa escolheu so materias, mostra so as escolhidas (um deck pode ter outras).
export function sessionSubjects(
  cards: ReadonlyArray<{ subjects: readonly SubjectRef[] }>,
  onlySubjectIds: readonly string[] | null,
): SubjectRef[] {
  const only = onlySubjectIds && onlySubjectIds.length > 0 ? new Set(onlySubjectIds) : null;
  const counts = new Map<string, { subject: SubjectRef; count: number }>();
  for (const card of cards) {
    for (const subject of card.subjects) {
      if (only && !only.has(subject.id)) continue;
      const entry = counts.get(subject.id);
      if (entry) entry.count += 1;
      else counts.set(subject.id, { subject, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.subject.name.localeCompare(b.subject.name, 'pt-BR'))
    .map((e) => e.subject);
}

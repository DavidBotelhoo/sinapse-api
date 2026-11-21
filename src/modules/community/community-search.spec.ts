import { matchSubjectIds, normalizeSearch } from './community-search';

const SUBJECTS = [
  { id: 'bio', name: 'Bioquímica' },
  { id: 'farma', name: 'Farmacologia' },
  { id: 'cardio', name: 'Cardiologia' },
  { id: 'gineco', name: 'Ginecologia e Obstetrícia' },
];

describe('community-search', () => {
  it('tira acentos, caixa e espacos extras', () => {
    expect(normalizeSearch('  Bioquímica   Clínica ')).toBe('bioquimica clinica');
    expect(normalizeSearch('ÇÃO')).toBe('cao');
  });

  it('acha a materia com ou sem acento', () => {
    expect(matchSubjectIds(SUBJECTS, 'bioquimica')).toEqual(['bio']);
    expect(matchSubjectIds(SUBJECTS, 'BIOQUÍMICA')).toEqual(['bio']);
    expect(matchSubjectIds(SUBJECTS, 'obstetricia')).toEqual(['gineco']);
  });

  it('busca por pedaco do nome', () => {
    expect(matchSubjectIds(SUBJECTS, 'logia').sort()).toEqual(['cardio', 'farma', 'gineco']);
    expect(matchSubjectIds(SUBJECTS, 'fármaco')).toEqual(['farma']);
  });

  it('busca vazia ou sem resultado nao acha materia', () => {
    expect(matchSubjectIds(SUBJECTS, '   ')).toEqual([]);
    expect(matchSubjectIds(SUBJECTS, 'ortopedia')).toEqual([]);
  });
});

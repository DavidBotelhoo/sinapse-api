import { sessionSubjects } from './session-subjects';

const farma = { id: 's1', slug: 'farmacologia', name: 'Farmacologia' };
const fisio = { id: 's2', slug: 'fisiologia', name: 'Fisiologia' };
const cardio = { id: 's3', slug: 'cardiologia', name: 'Cardiologia' };

describe('sessionSubjects', () => {
  const cards = [
    { subjects: [fisio] },
    { subjects: [farma, cardio] },
    { subjects: [farma] },
    { subjects: [fisio] },
    { subjects: [farma] },
  ];

  it('materias com mais cards primeiro, sem repetir', () => {
    expect(sessionSubjects(cards, null)).toEqual([farma, fisio, cardio]);
  });

  it('quando a sessao foi montada por materia, mostra so as escolhidas', () => {
    expect(sessionSubjects(cards, ['s1', 's2'])).toEqual([farma, fisio]);
  });
});

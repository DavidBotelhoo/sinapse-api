import { localDayBoundaries } from '../../common/time/user-day';
import { countDuePerDay, countDuePerDeck, type DueItem } from './agenda';

const SP = 'America/Sao_Paulo';
const now = new Date('2026-11-16T12:00:00Z'); // seg 16, 09:00 em SP
const b = localDayBoundaries(now, 7, SP); // 16..22

const due = (deckId: string, iso: string): DueItem => ({ deckId, due: new Date(iso) });

const items: DueItem[] = [
  due('pato', '2026-11-15T12:00:00Z'), // atrasado (ontem)
  due('pato', '2026-11-14T12:00:00Z'), // atrasado (anteontem)
  due('farma', '2026-11-16T20:00:00Z'), // hoje
  due('farma', '2026-11-17T02:59:00Z'), // hoje (23:59 local)
  due('fisio', '2026-11-16T15:00:00Z'), // hoje
  due('fisio', '2026-11-17T03:00:00Z'), // amanha (00:00 local)
  due('farma', '2026-11-19T12:00:00Z'), // qui 19
  due('farma', '2026-11-23T03:00:00Z'), // seg 23: fora da janela de 7 dias
];

describe('countDuePerDay', () => {
  it('agrupa por dia local; vencidos de antes contam em hoje como atrasados', () => {
    expect(countDuePerDay(items, b)).toEqual([
      { total: 5, overdue: 2 },
      { total: 1, overdue: 0 },
      { total: 0, overdue: 0 },
      { total: 1, overdue: 0 },
      { total: 0, overdue: 0 },
      { total: 0, overdue: 0 },
      { total: 0, overdue: 0 },
    ]);
  });
});

describe('countDuePerDeck', () => {
  it('hoje: atrasados primeiro, com a data do mais antigo', () => {
    const decks = countDuePerDeck(items, b[0]!, b[1]!, true);
    expect(decks).toEqual([
      {
        deckId: 'pato',
        dueOnDay: 0,
        overdue: 2,
        total: 2,
        oldestOverdue: new Date('2026-11-14T12:00:00Z'),
      },
      { deckId: 'farma', dueOnDay: 2, overdue: 0, total: 2, oldestOverdue: null },
      { deckId: 'fisio', dueOnDay: 1, overdue: 0, total: 1, oldestOverdue: null },
    ]);
  });

  it('dia futuro: so o que vence naquele dia, sem atrasados', () => {
    expect(countDuePerDeck(items, b[1]!, b[2]!, false)).toEqual([
      { deckId: 'fisio', dueOnDay: 1, overdue: 0, total: 1, oldestOverdue: null },
    ]);
  });
});

import { PatternPairExtractor } from './pattern-pair-extractor';

describe('PatternPairExtractor', () => {
  const extractor = new PatternPairExtractor();

  it('reconhece P:/R:', async () => {
    const text = `P: O que e um neuronio?
R: Celula do sistema nervoso.

P: O que e sinapse?
R: Conexao entre neuronios.`;
    const pairs = await extractor.extract(text);
    expect(pairs).toEqual([
      { question: 'O que e um neuronio?', answer: 'Celula do sistema nervoso.' },
      { question: 'O que e sinapse?', answer: 'Conexao entre neuronios.' },
    ]);
  });

  it('reconhece Pergunta:/Resposta: com numero', async () => {
    const text = `Pergunta 1: Qual a funcao do coracao?
Resposta: Bombear sangue.

Pergunta 2: O que e sistole?
Resposta: Fase de contracao.`;
    const pairs = await extractor.extract(text);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ question: 'Qual a funcao do coracao?', answer: 'Bombear sangue.' });
    expect(pairs[1]).toEqual({ question: 'O que e sistole?', answer: 'Fase de contracao.' });
  });

  it('reconhece pergunta numerada com resposta logo apos', async () => {
    const text = `1) O que e uma sinapse?
Conexao entre neuronios.

2. Qual a funcao da dopamina?
Neurotransmissor do prazer.`;
    const pairs = await extractor.extract(text);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.question).toBe('O que e uma sinapse?');
    expect(pairs[0]!.answer).toBe('Conexao entre neuronios.');
    expect(pairs[1]!.question).toBe('Qual a funcao da dopamina?');
  });

  it('pergunta sem resposta vira par com answer null', async () => {
    const text = `P: O que e isso?
P: Outra pergunta?
R: Com resposta.`;
    const pairs = await extractor.extract(text);
    expect(pairs).toEqual([
      { question: 'O que e isso?', answer: null },
      { question: 'Outra pergunta?', answer: 'Com resposta.' },
    ]);
  });

  it('texto sem padrao nenhum devolve vazio', async () => {
    const pairs = await extractor.extract('Isso aqui e so um paragrafo sem interrogacao no fim.');
    expect(pairs).toEqual([]);
  });

  it('heuristica: pergunta terminada em "?" seguida de texto vira par', async () => {
    const text = `O que faz a insulina?
Regula a glicose no sangue.`;
    const pairs = await extractor.extract(text);
    expect(pairs).toEqual([
      { question: 'O que faz a insulina?', answer: 'Regula a glicose no sangue.' },
    ]);
  });

  it('respostas e perguntas que ocupam varias linhas sao unidas', async () => {
    const text = `P: O que e miocardio
e qual sua funcao?
R: Musculo do coracao
que bombeia sangue.`;
    const pairs = await extractor.extract(text);
    expect(pairs).toEqual([
      {
        question: 'O que e miocardio e qual sua funcao?',
        answer: 'Musculo do coracao\nque bombeia sangue.',
      },
    ]);
  });

  describe('texto como sai de PDF e Word', () => {
    it('quebra de linha do Windows (\\r\\n)', async () => {
      const text = 'P: O que e IC?\r\nR: Insuficiencia cardiaca\r\nP: Dose?\r\nR: 10 mg\r\n';
      expect(await extractor.extract(text)).toEqual([
        { question: 'O que e IC?', answer: 'Insuficiencia cardiaca' },
        { question: 'Dose?', answer: '10 mg' },
      ]);
    });

    it('marcadores em minusculas (p:/r:)', async () => {
      expect(await extractor.extract('p: o que e?\nr: isso\n')).toEqual([
        { question: 'o que e?', answer: 'isso' },
      ]);
    });

    it('mantem os acentos', async () => {
      const text = 'Pergunta: Qual é a função do miocárdio?\nResposta: Bombear o sangue.';
      expect(await extractor.extract(text)).toEqual([
        { question: 'Qual é a função do miocárdio?', answer: 'Bombear o sangue.' },
      ]);
    });

    it('numeracao com parentese: "1)"', async () => {
      const text = '1) Qual o nervo do diafragma?\nFrenico\n2) Qual a maior veia?\nCava inferior';
      expect(await extractor.extract(text)).toEqual([
        { question: 'Qual o nervo do diafragma?', answer: 'Frenico' },
        { question: 'Qual a maior veia?', answer: 'Cava inferior' },
      ]);
    });

    it('espacos sobrando nas pontas', async () => {
      const text = '   P:   Pergunta com espaco   \n   R:   resposta   \n';
      expect(await extractor.extract(text)).toEqual([
        { question: 'Pergunta com espaco', answer: 'resposta' },
      ]);
    });
  });
});

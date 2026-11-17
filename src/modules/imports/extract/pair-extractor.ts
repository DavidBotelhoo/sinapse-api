// `type` (e não `interface`) para ser atribuível ao Json do Prisma (InputJsonValue),
// que exige assinatura de índice implícita.
export type ExtractedPair = {
  question: string;
  answer: string | null;
};

export abstract class PairExtractor {
  abstract readonly name: string;
  abstract extract(text: string): Promise<ExtractedPair[]>;
}

export interface ExtractedPair {
  question: string;
  answer: string | null;
}

export abstract class PairExtractor {
  abstract readonly name: string;
  abstract extract(text: string): Promise<ExtractedPair[]>;
}

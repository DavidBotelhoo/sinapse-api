import { Injectable } from '@nestjs/common';
import { PairExtractor, type ExtractedPair } from './pair-extractor';

const Q_MARKERS = [
  /^P\s*:\s*/i,
  /^Pergunta\s*\d*\s*:\s*/i,
  /^\d{1,3}\s*[).-]\s*/,
];
const A_MARKERS = [
  /^R\s*:\s*/i,
  /^Resposta\s*\d*\s*:\s*/i,
];

type Line = { kind: 'Q' | 'A' | 'TEXT'; content: string };

function classifyLine(raw: string): Line | null {
  const line = raw.trim();
  if (!line) return null;
  for (const re of Q_MARKERS) {
    const m = re.exec(line);
    if (m) return { kind: 'Q', content: line.slice(m[0].length).trim() };
  }
  for (const re of A_MARKERS) {
    const m = re.exec(line);
    if (m) return { kind: 'A', content: line.slice(m[0].length).trim() };
  }
  return { kind: 'TEXT', content: line };
}

interface Buffer {
  q: string;
  a: string | null;
  collecting: 'q' | 'a';
}

function finalize(buf: Buffer): ExtractedPair | null {
  const question = buf.q.trim();
  if (!question) return null;
  const answer = buf.a === null ? null : buf.a.trim() || null;
  return { question, answer };
}

@Injectable()
export class PatternPairExtractor extends PairExtractor {
  readonly name = 'pattern';

  extract(text: string): Promise<ExtractedPair[]> {
    const pairs: ExtractedPair[] = [];
    let cur: Buffer | null = null;

    const lines = text.replace(/\r\n?/g, '\n').split('\n');

    for (const raw of lines) {
      const line = classifyLine(raw);
      if (!line) continue;

      if (line.kind === 'Q') {
        if (cur) {
          const flushed = finalize(cur);
          if (flushed) pairs.push(flushed);
        }
        cur = { q: line.content, a: null, collecting: 'q' };
        continue;
      }

      if (line.kind === 'A') {
        if (!cur) continue;
        cur.a = cur.a === null ? line.content : `${cur.a}\n${line.content}`;
        cur.collecting = 'a';
        continue;
      }

      // TEXT
      if (!cur) {
        if (line.content.endsWith('?')) {
          cur = { q: line.content, a: null, collecting: 'q' };
        }
        continue;
      }
      if (cur.collecting === 'q') {
        if (cur.q.endsWith('?') && !line.content.endsWith('?')) {
          cur.a = line.content;
          cur.collecting = 'a';
        } else {
          cur.q = `${cur.q} ${line.content}`.trim();
        }
      } else {
        cur.a = `${cur.a ?? ''}\n${line.content}`.trim();
      }
    }

    if (cur) {
      const flushed = finalize(cur);
      if (flushed) pairs.push(flushed);
    }

    return Promise.resolve(pairs);
  }
}

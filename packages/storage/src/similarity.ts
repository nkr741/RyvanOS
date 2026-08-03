import { ValidationError } from "@ryvan/common";

/**
 * Cosine similarity, normalised to 0..1 so it reads the same way as pgvector's
 * `1 - (a <=> b)`. Identical direction scores 1, orthogonal 0.5, opposite 0.
 *
 * Raw cosine runs -1..1, which is easy to misread as "0.0 means no match" when
 * it actually means orthogonal. Rescaling once here keeps every caller and both
 * vector drivers agreeing on what a score means.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new ValidationError("embedding", `dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    dot += left * right;
    magnitudeA += left * left;
    magnitudeB += right * right;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    // A zero vector has no direction, so it is no more similar to one input
    // than another. 0 is the honest answer; 1 would claim a perfect match.
    return 0;
  }

  const cosine = dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));

  // Clamp before rescaling — floating point can nudge this a hair past ±1.
  return (Math.max(-1, Math.min(1, cosine)) + 1) / 2;
}

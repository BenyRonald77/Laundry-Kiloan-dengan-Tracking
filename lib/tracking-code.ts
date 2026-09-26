import crypto from "crypto";

// Generator kode acak sederhana (pengganti ringan nanoid) - hanya butuh
// alfanumerik acak yang cukup unik untuk kode tracking, dicek unique di DB.
export function customAlphabet(alphabet: string, size: number) {
  return function generate(): string {
    const bytes = crypto.randomBytes(size);
    let result = "";
    for (let i = 0; i < size; i++) {
      result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
  };
}

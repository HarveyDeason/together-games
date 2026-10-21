const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 4;

export function randomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

export function normaliseCode(input) {
  return String(input ?? '').trim().toUpperCase();
}

export function isValidCode(input) {
  if (input === null || input === undefined) return false;
  return /^[A-Z]{4}$/.test(normaliseCode(input));
}

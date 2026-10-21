const KEY = 'together-games.identity';

export function getIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.clientId || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveName(name) {
  const trimmed = String(name).trim().slice(0, 40);
  if (!trimmed) throw new Error('Name cannot be empty');
  const existing = getIdentity();
  const identity = {
    clientId: existing?.clientId ?? crypto.randomUUID(),
    name: trimmed
  };
  localStorage.setItem(KEY, JSON.stringify(identity));
  return identity;
}

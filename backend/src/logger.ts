const phoneFieldNames = new Set(['phone', 'callerNumber', 'caller_number']);

export function maskPhoneNumber(value: string): string {
  const visibleDigits = value.replace(/\D/g, '').slice(-4);

  if (visibleDigits.length === 0) {
    return '***';
  }

  return `***${visibleDigits}`;
}

export function maskLogFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      phoneFieldNames.has(key) && typeof value === 'string'
        ? maskPhoneNumber(value)
        : value,
    ]),
  );
}

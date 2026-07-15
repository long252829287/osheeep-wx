export const parseInventoryQuantity = (
  input: string,
): number | undefined | null => {
  const normalized = input.trim();
  if (!normalized) return undefined;

  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(normalized);
  if (!match) return null;

  const integerDigits = match[1].replace(/^0+/, '') || '0';
  if (integerDigits.length > 9) return null;

  const quantity = Number(normalized);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
};

import { parseInventoryQuantity } from '../miniprogram/utils/inventory-input';

test.each([
  ['', undefined],
  ['   ', undefined],
  ['0', 0],
  ['000001.230', 1.23],
  ['8.5', 8.5],
  ['999999999.999', 999999999.999],
] as const)('parses valid inventory quantity %p', (input, expected) => {
  expect(parseInventoryQuantity(input)).toBe(expected);
});

test.each([
  '-1',
  '1.',
  '1e2',
  'abc',
  'Infinity',
  'NaN',
  '1e309',
  '1.2345',
  '1000000000',
  '999999999.9999',
  '12kg',
] as const)('rejects invalid inventory quantity %p', (input) => {
  expect(parseInventoryQuantity(input)).toBeNull();
});

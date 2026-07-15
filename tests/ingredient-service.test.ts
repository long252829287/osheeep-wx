import { createIngredientService } from '../miniprogram/services/ingredient-service';

test('maps ingredient inventory reads and item writes', async () => {
  const request = jest.fn().mockResolvedValue([]);
  const service = createIngredientService({ request });

  await service.listIngredients();
  await service.listInventory();
  await service.saveInventoryItem(3, {
    quantity: 8,
    unit: '枚',
    version: 2,
  });
  await service.removeInventoryItem(3, 3);

  expect(request).toHaveBeenNthCalledWith(1, '/api/dinner/ingredients');
  expect(request).toHaveBeenNthCalledWith(2, '/api/dinner/inventory');
  expect(request).toHaveBeenNthCalledWith(3, '/api/dinner/inventory/3', {
    method: 'PUT',
    data: { quantity: 8, unit: '枚', version: 2 },
  });
  expect(request).toHaveBeenNthCalledWith(
    4,
    '/api/dinner/inventory/3?version=3',
    { method: 'DELETE' },
  );
});

test('preserves an explicitly unknown inventory quantity', async () => {
  const request = jest.fn().mockResolvedValue({});
  const service = createIngredientService({ request });

  await service.saveInventoryItem(5, {
    quantity: null,
    unit: '克',
    version: 0,
  });

  expect(request).toHaveBeenCalledWith('/api/dinner/inventory/5', {
    method: 'PUT',
    data: { quantity: null, unit: '克', version: 0 },
  });
});

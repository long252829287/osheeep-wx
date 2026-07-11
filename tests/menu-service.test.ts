import { createMenuService } from '../miniprogram/services/menu-service';
import { createRecipeService } from '../miniprogram/services/recipe-service';
import { createRecordService } from '../miniprogram/services/record-service';

test('maps dinner menu read and write endpoints', async () => {
  const request = jest.fn().mockResolvedValue({ status: 'DRAFT', version: 5 });
  const service = createMenuService({ request });

  await service.getToday();
  await service.saveSelections([1, 2], 4);
  await service.confirm(5, 'action-1');
  await service.complete(6, 'action-2');

  expect(request).toHaveBeenNthCalledWith(1, '/api/dinner/menus/today');
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/api/dinner/menus/today/selections',
    { method: 'PUT', data: { recipeIds: [1, 2], version: 4 } },
  );
  expect(request).toHaveBeenNthCalledWith(
    3,
    '/api/dinner/menus/today/confirm',
    { method: 'POST', data: { version: 5, idempotencyKey: 'action-1' } },
  );
  expect(request).toHaveBeenNthCalledWith(
    4,
    '/api/dinner/menus/today/complete',
    { method: 'POST', data: { version: 6, idempotencyKey: 'action-2' } },
  );
});

test('maps recipe and record read endpoints', async () => {
  const request = jest.fn().mockResolvedValue([]);
  const recipeService = createRecipeService({ request });
  const recordService = createRecordService({ request });

  await recipeService.list();
  await recordService.list();
  await recordService.detail(91);

  expect(request).toHaveBeenNthCalledWith(1, '/api/dinner/recipes');
  expect(request).toHaveBeenNthCalledWith(2, '/api/dinner/records');
  expect(request).toHaveBeenNthCalledWith(3, '/api/dinner/records/91');
});

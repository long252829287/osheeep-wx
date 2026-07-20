import { createRecipeService } from '../miniprogram/services/recipe-service';

test('maps every custom recipe endpoint without changing discovery', async () => {
  const request = jest.fn().mockResolvedValue({ id: 9, version: 1 });
  const service = createRecipeService({ request });

  await service.list({ onlyCookable: true });
  await service.listFamily('DRAFT');
  await service.createDraft();
  await service.detail(9);
  await service.saveBasicInfo(9, {
    version: 1,
    name: '番茄炒蛋',
    category: '家常菜',
    flavor: '酸甜',
    servings: 2,
    estimatedMinutes: 15,
  });
  await service.saveIngredients(9, {
    version: 2,
    ingredients: [
      { ingredientId: 1, quantity: null, unit: '克', required: true },
    ],
  });
  await service.saveDefaultMethod(9, {
    version: 3,
    name: '家常炒',
    cookingStyle: '炒',
    steps: [{ instruction: '切番茄' }],
  });
  await service.saveImage(9, 4, 8);
  await service.listImages('番茄');
  await service.publish(9, 5);

  expect(request).toHaveBeenNthCalledWith(
    1,
    '/api/dinner/recipes?onlyCookable=true',
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/api/dinner/recipes/family?tab=DRAFT',
  );
  expect(request).toHaveBeenNthCalledWith(3, '/api/dinner/recipes/drafts', {
    method: 'POST',
  });
  expect(request).toHaveBeenNthCalledWith(4, '/api/dinner/recipes/9');
  expect(request).toHaveBeenNthCalledWith(
    5,
    '/api/dinner/recipes/9/basic-info',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(request).toHaveBeenNthCalledWith(
    6,
    '/api/dinner/recipes/9/ingredients',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(request).toHaveBeenNthCalledWith(
    7,
    '/api/dinner/recipes/9/default-method',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(request).toHaveBeenNthCalledWith(8, '/api/dinner/recipes/9/image', {
    method: 'PUT',
    data: { version: 4, imageAssetId: 8 },
  });
  expect(request).toHaveBeenNthCalledWith(
    9,
    '/api/dinner/image-assets?query=%E7%95%AA%E8%8C%84',
  );
  expect(request).toHaveBeenNthCalledWith(10, '/api/dinner/recipes/9/publish', {
    method: 'POST',
    data: { version: 5 },
  });
});

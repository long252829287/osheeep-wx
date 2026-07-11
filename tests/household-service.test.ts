import { createHouseholdService } from '../miniprogram/services/household-service';

test('maps an omitted household response to null', async () => {
  const request = jest.fn().mockResolvedValue(undefined);
  const service = createHouseholdService({ request });

  await expect(service.getCurrent()).resolves.toBeNull();
  expect(request).toHaveBeenCalledWith('/api/dinner/household');
});

test('creates and refreshes household invites without implicit retries', async () => {
  const request = jest.fn().mockResolvedValue({ inviteCode: 'DINNER 5268' });
  const service = createHouseholdService({ request });

  await service.create('我们的小家');
  await service.refreshInviteCode();

  expect(request).toHaveBeenNthCalledWith(1, '/api/dinner/households', {
    method: 'POST',
    data: { name: '我们的小家' },
  });
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/api/dinner/households/invite-code/refresh',
    { method: 'POST' },
  );
});

test('normalizes invite spacing before joining', async () => {
  const request = jest.fn().mockResolvedValue({ id: 11, memberCount: 2 });
  const service = createHouseholdService({ request });

  await service.join(' dinner   5268 ');

  expect(request).toHaveBeenCalledWith('/api/dinner/households/join', {
    method: 'POST',
    data: { inviteCode: 'DINNER 5268' },
  });
});

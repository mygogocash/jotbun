import { ServiceUnavailableException } from '@nestjs/common';

import { SpendBankLinkService } from './spend-bank-link.service';

describe('SpendBankLinkService', () => {
  const previousId = process.env.SALT_EDGE_APP_ID;
  const previousSecret = process.env.SALT_EDGE_SECRET;

  afterEach(() => {
    if (previousId === undefined) delete process.env.SALT_EDGE_APP_ID;
    else process.env.SALT_EDGE_APP_ID = previousId;
    if (previousSecret === undefined) delete process.env.SALT_EDGE_SECRET;
    else process.env.SALT_EDGE_SECRET = previousSecret;
  });

  it('reports unavailable and refuses connect when Salt Edge keys are missing', async () => {
    delete process.env.SALT_EDGE_APP_ID;
    delete process.env.SALT_EDGE_SECRET;
    const service = new SpendBankLinkService(
      { findOne: jest.fn(), create: jest.fn(), updateOne: jest.fn() } as never,
      { findOneAndUpdate: jest.fn() } as never,
      { findOneAndUpdate: jest.fn() } as never,
      { create: jest.fn() } as never,
    );
    await expect(service.status('507f1f77bcf86cd799439011')).resolves.toEqual({
      available: false,
      link_status: 'none',
      provider_code: null,
    });
    await expect(
      service.startConnect('507f1f77bcf86cd799439011'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

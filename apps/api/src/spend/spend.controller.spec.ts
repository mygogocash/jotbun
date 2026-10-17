import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { ProductAccessService } from 'src/product-access/product-access.service';
import { SpendController } from './spend.controller';
import { SpendImportService } from './spend-import.service';
import { SpendService } from './spend.service';

const USER_ID = '507f1f77bcf86cd799439011';

describe('SpendController allowlist', () => {
  it('404s when product access denies the member', async () => {
    const spend = {
      summary: jest.fn().mockResolvedValue({
        month: '2025-12',
        expense_minor: 0,
        income_minor: 0,
        pie: [],
        tx_count: 0,
      }),
      listTxs: jest.fn(),
      addTx: jest.fn(),
    };
    const controller = makeController(spend, false);

    await expect(
      controller.summary(reqWithSub(USER_ID), '2025-12'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(spend.summary).not.toHaveBeenCalled();
  });

  it('401s when the session has no subject', async () => {
    const spend = { summary: jest.fn(), listTxs: jest.fn(), addTx: jest.fn() };
    const controller = makeController(spend, true);
    await expect(
      controller.summary({ user: {} } as unknown as Request, '2025-12'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('forwards an allowed add then summary in satang', async () => {
    const spend = {
      summary: jest.fn().mockResolvedValue({
        month: '2025-12',
        expense_minor: 29000,
        income_minor: 0,
        pie: [{ category: 'อาหาร', amount_minor: 29000 }],
        tx_count: 1,
      }),
      listTxs: jest.fn(),
      addTx: jest.fn().mockResolvedValue({ id: 'abc' }),
    };
    const controller = makeController(spend, true);

    await expect(
      controller.addTx(reqWithSub(USER_ID), {
        amount_minor: 29000,
        type: 'expense',
        occurred_on: '2025-12-01',
        category: 'อาหาร',
      }),
    ).resolves.toEqual({ id: 'abc' });
    expect(spend.addTx).toHaveBeenCalledWith(USER_ID, {
      amount_minor: 29000,
      type: 'expense',
      occurred_on: '2025-12-01',
      category: 'อาหาร',
    });

    await expect(
      controller.summary(reqWithSub(USER_ID), '2025-12'),
    ).resolves.toMatchObject({
      expense_minor: 29000,
      month: '2025-12',
      successful_import_count: 0,
    });
    expect(spend.summary).toHaveBeenCalledWith(USER_ID, '2025-12');
  });

  it('attaches successful import count for the LINE share gate', async () => {
    const spend = {
      summary: jest.fn().mockResolvedValue({
        month: '2025-12',
        expense_minor: 0,
        income_minor: 0,
        pie: [],
        tx_count: 0,
      }),
      listTxs: jest.fn(),
      addTx: jest.fn(),
    };
    const controller = new SpendController(
      spend as unknown as SpendService,
      {
        enqueue: jest.fn(),
        getJob: jest.fn(),
        countSucceeded: jest.fn().mockResolvedValue(20),
      } as unknown as SpendImportService,
      { status: jest.fn(), startConnect: jest.fn() } as never,
      {
        canUse: jest.fn().mockResolvedValue(true),
      } as unknown as ProductAccessService,
    );

    await expect(
      controller.summary(reqWithSub(USER_ID), '2025-12'),
    ).resolves.toMatchObject({ successful_import_count: 20 });
  });
});

/**
 * The month dropdown on the summary card (owner call 2026-09-06). Same gate as
 * every other read here: a member outside the product allowlist gets a 404, not
 * a list of the months they have records in.
 */
describe('SpendController month list', () => {
  it('given an allowed member > then it hands back the months the service found', async () => {
    const months = [
      { month: '2026-09', expense_minor: 8900, income_minor: 0 },
      { month: '2026-08', expense_minor: 24000, income_minor: 3200000 },
    ];
    const spend = { listMonths: jest.fn().mockResolvedValue(months) };
    const controller = makeController(spend, true);

    await expect(controller.listMonths(reqWithSub(USER_ID))).resolves.toEqual(
      months,
    );
    expect(spend.listMonths).toHaveBeenCalledWith(USER_ID);
  });

  it('given a member product access denies > then it 404s without asking the service', async () => {
    const spend = { listMonths: jest.fn() };
    const controller = makeController(spend, false);

    await expect(
      controller.listMonths(reqWithSub(USER_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(spend.listMonths).not.toHaveBeenCalled();
  });

  it('given a session with no subject > then it 401s', async () => {
    const controller = makeController({ listMonths: jest.fn() }, true);
    await expect(
      controller.listMonths({ user: {} } as unknown as Request),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function makeController(
  spend: Record<string, unknown>,
  allowed: boolean,
): SpendController {
  return new SpendController(
    spend as unknown as SpendService,
    {
      enqueue: jest.fn(),
      getJob: jest.fn(),
      countSucceeded: jest.fn().mockResolvedValue(0),
    } as unknown as SpendImportService,
    { status: jest.fn(), startConnect: jest.fn() } as never,
    {
      canUse: jest.fn().mockResolvedValue(allowed),
    } as unknown as ProductAccessService,
  );
}

function reqWithSub(sub: string): Request {
  return { user: { sub } } as unknown as Request;
}

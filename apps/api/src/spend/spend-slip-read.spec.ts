import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';

import { ProductAccessService } from 'src/product-access/product-access.service';
import { SpendController } from './spend.controller';
import { SpendImportService } from './spend-import.service';
import { SpendService } from './spend.service';
import { parseSpendUpload } from './mappers/parse-spend-file';

jest.mock('./mappers/parse-spend-file', () => ({
  ...jest.requireActual('./mappers/parse-spend-file'),
  parseSpendUpload: jest.fn(),
}));

const parseMock = parseSpendUpload as jest.MockedFunction<
  typeof parseSpendUpload
>;

const USER_ID = '507f1f77bcf86cd799439011';

/**
 * Reading a slip is deliberately NOT importing one. The panel needs the numbers
 * back so the member can confirm money out vs money in — our reader cannot tell
 * a slip you sent from one you received — so this path must never write.
 */
describe('SpendController.readSlip', () => {
  beforeEach(() => parseMock.mockReset());

  it('given a readable slip > then it returns the values and writes nothing', async () => {
    parseMock.mockResolvedValue({
      ok: true,
      mapper: 'slip_qr',
      rows: [
        {
          occurred_on: '2026-08-30',
          type: 'expense',
          amount_minor: 24000,
          category: 'Other',
          wallet_name: 'PromptPay',
          merchant: 'Starbucks',
          note: 'PromptPay slip',
          tags: [],
        },
      ],
      file_sum_minor: 24000,
      row_reject: 0,
      parsed_sum_minor: 24000,
      import_hash: 'hash',
    });
    const spend = { addTx: jest.fn() };
    const imports = {
      enqueue: jest.fn(),
      getJob: jest.fn(),
      countSucceeded: jest.fn().mockResolvedValue(0),
    };
    const controller = makeController(spend, imports, true);

    await expect(
      controller.readSlip(reqWithSub(USER_ID), file('slip.jpg')),
    ).resolves.toEqual({
      amount_minor: 24000,
      occurred_on: '2026-08-30',
      merchant: 'Starbucks',
      source: 'slip_qr',
    });
    expect(imports.enqueue).not.toHaveBeenCalled();
    expect(spend.addTx).not.toHaveBeenCalled();
  });

  it('given a member outside the allowlist > then it 404s before reading', async () => {
    const controller = makeController({}, {}, false);
    await expect(
      controller.readSlip(reqWithSub(USER_ID), file('slip.jpg')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it('given an unreadable slip > then it surfaces the reader’s own code', async () => {
    parseMock.mockResolvedValue({ ok: false, error_code: 'SLIP_OCR_EMPTY' });
    const controller = makeController({}, {}, true);

    await expect(
      controller.readSlip(reqWithSub(USER_ID), file('blurry.jpg')),
    ).rejects.toMatchObject({
      response: { code: 'SLIP_OCR_EMPTY' },
    });
  });

  it('given a spreadsheet instead of a slip > then it refuses as NOT_A_SLIP', async () => {
    parseMock.mockResolvedValue({
      ok: true,
      mapper: 'meowjot',
      rows: [
        {
          occurred_on: '2026-08-30',
          type: 'expense',
          amount_minor: 500,
          category: 'Food',
          wallet_name: 'Cash',
          merchant: '',
          note: '',
          tags: [],
        },
      ],
      file_sum_minor: 500,
      row_reject: 0,
      parsed_sum_minor: 500,
      import_hash: 'hash',
    });
    const controller = makeController({}, {}, true);

    await expect(
      controller.readSlip(reqWithSub(USER_ID), file('export.csv')),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      controller.readSlip(reqWithSub(USER_ID), file('export.csv')),
    ).rejects.toMatchObject({ response: { code: 'NOT_A_SLIP' } });
  });

  it('given no file > then it 404s', async () => {
    const controller = makeController({}, {}, true);
    await expect(
      controller.readSlip(
        reqWithSub(USER_ID),
        undefined as unknown as Express.Multer.File,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function makeController(
  spend: Record<string, unknown>,
  imports: Record<string, unknown>,
  allowed: boolean,
): SpendController {
  return new SpendController(
    spend as unknown as SpendService,
    {
      enqueue: jest.fn(),
      getJob: jest.fn(),
      countSucceeded: jest.fn().mockResolvedValue(0),
      ...imports,
    } as unknown as SpendImportService,
    { status: jest.fn(), startConnect: jest.fn() } as never,
    {
      canUse: jest.fn().mockResolvedValue(allowed),
    } as unknown as ProductAccessService,
  );
}

function file(originalname: string): Express.Multer.File {
  return {
    buffer: Buffer.from('not-really-an-image'),
    originalname,
  } as Express.Multer.File;
}

function reqWithSub(sub: string): Request {
  return { user: { sub } } as unknown as Request;
}

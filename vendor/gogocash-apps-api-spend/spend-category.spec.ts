import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

import { SPEND_CATEGORY_HUES } from '@gogocash/contracts';

import { ProductAccessService } from 'src/product-access/product-access.service';
import { SpendController } from './spend.controller';
import { SpendImportService } from './spend-import.service';
import { SpendService } from './spend.service';

const USER_ID = '507f1f77bcf86cd799439011';

/*
 * A member's own categories were stored and never handed back: the app drew a
 * fixed list of starters, so "Music" survived in the database and vanished
 * from the screen. These two endpoints are what make a custom category a thing
 * the member can see again — and the emoji and colour only mean anything once
 * it comes back.
 */
describe('spend categories', () => {
  it('lists the member’s own categories', async () => {
    const spend = {
      listCategories: jest
        .fn()
        .mockResolvedValue([
          { name: 'Music', type: 'expense', emoji: '🎵', hue: '#9B7EDB' },
        ]),
    };
    const controller = makeController(spend, true);

    await expect(
      controller.listCategories(reqWithSub(USER_ID)),
    ).resolves.toEqual([
      { name: 'Music', type: 'expense', emoji: '🎵', hue: '#9B7EDB' },
    ]);
    expect(spend.listCategories).toHaveBeenCalledWith(USER_ID);
  });

  it('404s the list when product access denies the member', async () => {
    const spend = { listCategories: jest.fn() };
    const controller = makeController(spend, false);

    await expect(
      controller.listCategories(reqWithSub(USER_ID)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(spend.listCategories).not.toHaveBeenCalled();
  });

  it('creates one with its emoji and colour', async () => {
    const spend = {
      createCategory: jest.fn().mockResolvedValue({
        name: 'Music',
        type: 'expense',
        emoji: '🎵',
        hue: '#9B7EDB',
      }),
    };
    const controller = makeController(spend, true);

    await controller.createCategory(reqWithSub(USER_ID), {
      name: '  Music  ',
      type: 'expense',
      emoji: '🎵',
      hue: '#9B7EDB',
    });

    // Trimmed before it reaches storage: " Music" and "Music " must not become
    // two categories that never add up in the month summary.
    expect(spend.createCategory).toHaveBeenCalledWith(USER_ID, {
      name: 'Music',
      type: 'expense',
      emoji: '🎵',
      hue: '#9B7EDB',
    });
  });

  it('refuses a colour that is not one of the twelve', async () => {
    // The palette is checked for readability as a set. An arbitrary hex from a
    // patched client could put unreadable ink on the member's own chip.
    const spend = { createCategory: jest.fn() };
    const controller = makeController(spend, true);

    await expect(
      controller.createCategory(reqWithSub(USER_ID), {
        name: 'Music',
        type: 'expense',
        hue: '#000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(spend.createCategory).not.toHaveBeenCalled();
  });

  it.each(['Music', 'เพลง', '🎵 Music', '   '])(
    'refuses %p in the emoji field',
    async (emoji) => {
      // The field is a mark, not a second name. Text here would show up
      // doubled on the chip and in every export.
      const spend = { createCategory: jest.fn() };
      const controller = makeController(spend, true);

      await expect(
        controller.createCategory(reqWithSub(USER_ID), {
          name: 'Music',
          type: 'expense',
          emoji,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(spend.createCategory).not.toHaveBeenCalled();
    },
  );

  it.each(['🎵', '👨‍👩‍👧‍👦', '👍🏽'])('accepts %p as an emoji', async (emoji) => {
    // Joined and skin-toned emoji run well past one code point; the cap counts
    // UTF-16 units so those still fit.
    const spend = { createCategory: jest.fn().mockResolvedValue({}) };
    const controller = makeController(spend, true);

    await controller.createCategory(reqWithSub(USER_ID), {
      name: 'Family',
      type: 'expense',
      emoji,
    });
    expect(spend.createCategory).toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    const spend = { createCategory: jest.fn() };
    const controller = makeController(spend, true);

    await expect(
      controller.createCategory(reqWithSub(USER_ID), {
        name: '   ',
        type: 'expense',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takes a category with no emoji and no colour', async () => {
    // Both are optional: someone who just wants the name gets today's look.
    const spend = { createCategory: jest.fn().mockResolvedValue({}) };
    const controller = makeController(spend, true);

    await controller.createCategory(reqWithSub(USER_ID), {
      name: 'Music',
      type: 'expense',
    });
    expect(spend.createCategory).toHaveBeenCalledWith(USER_ID, {
      name: 'Music',
      type: 'expense',
      emoji: undefined,
      hue: undefined,
    });
  });

  it('offers twelve colours, all of them distinct', () => {
    expect(SPEND_CATEGORY_HUES).toHaveLength(12);
    expect(new Set(SPEND_CATEGORY_HUES).size).toBe(12);
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

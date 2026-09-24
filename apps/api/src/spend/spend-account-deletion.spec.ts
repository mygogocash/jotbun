import { Types } from 'mongoose';

import { SpendImportService } from './spend-import.service';

/**
 * #2232 gap 1 — PDPA s.33 erasure must reach the aggregator.
 *
 * Deleting a GoGoCash account used to drop only our own copy of the imported
 * bank data; the Salt Edge customer (and every consent on it) survived, with
 * no route left to erase it once the row holding `saltedge_customer_id` was
 * gone. These tests pin the fix and, above all, its ORDERING.
 */
describe('SpendImportService.purgeForUser — Salt Edge erasure', () => {
  const userId = new Types.ObjectId();

  function harness(options?: {
    connections?: Array<{ saltedge_customer_id?: string }>;
    configured?: boolean;
    deleteCustomer?: jest.Mock;
  }) {
    /** Records the interleaving of remote revoke vs. local delete. */
    const calls: string[] = [];

    const connections = options?.connections ?? [
      { saltedge_customer_id: 'cus-1' },
    ];
    const deleteCustomer =
      options?.deleteCustomer ??
      jest.fn(async () => {
        calls.push('saltedge:delete');
        return true;
      });
    const saltEdge = {
      isConfigured: () => options?.configured ?? true,
      deleteCustomer,
    };

    const bankConnectionModel = {
      find: jest.fn(() => ({
        lean: () => ({ exec: async () => connections }),
      })),
      deleteMany: jest.fn(async () => {
        calls.push('local:bankConnections');
        return { deletedCount: connections.length };
      }),
    };
    const deleteManyRecorder = (label: string) =>
      jest.fn(async () => {
        calls.push(`local:${label}`);
        return { deletedCount: 0 };
      });
    const jobModel = {
      updateMany: jest.fn(async () => {
        calls.push('local:jobsFailed');
        return { modifiedCount: 0 };
      }),
      deleteMany: deleteManyRecorder('jobs'),
    };
    const txModel = { deleteMany: deleteManyRecorder('tx') };
    const walletModel = { deleteMany: deleteManyRecorder('wallets') };
    const categoryModel = { deleteMany: deleteManyRecorder('categories') };

    const service = new SpendImportService(
      jobModel as never,
      walletModel as never,
      categoryModel as never,
      txModel as never,
      undefined,
      bankConnectionModel as never,
      saltEdge as never,
    );
    return { service, calls, deleteCustomer, txModel, bankConnectionModel };
  }

  it('revokes the Salt Edge customer stored on the connection row', async () => {
    const { service, deleteCustomer } = harness();

    await service.purgeForUser(userId);

    expect(deleteCustomer).toHaveBeenCalledWith('cus-1');
  });

  /**
   * The regression that matters. `saltedge_customer_id` lives only on the row
   * being deleted, so a purge that dropped local rows first would leave an
   * un-erasable orphan at the aggregator.
   */
  it('revokes remotely BEFORE deleting the row that holds the customer id', async () => {
    const { service, calls } = harness();

    await service.purgeForUser(userId);

    expect(calls[0]).toBe('saltedge:delete');
    expect(calls).toContain('local:bankConnections');
    expect(calls.indexOf('saltedge:delete')).toBeLessThan(
      calls.indexOf('local:bankConnections'),
    );
  });

  it('deduplicates repeated customer ids into one revoke', async () => {
    const { service, deleteCustomer } = harness({
      connections: [
        { saltedge_customer_id: 'cus-dup' },
        { saltedge_customer_id: 'cus-dup' },
        { saltedge_customer_id: 'cus-other' },
      ],
    });

    await service.purgeForUser(userId);

    expect(deleteCustomer).toHaveBeenCalledTimes(2);
    expect(deleteCustomer.mock.calls.map((c) => c[0]).sort()).toEqual([
      'cus-dup',
      'cus-other',
    ]);
  });

  /**
   * Erasure of OUR copy cannot be contingent on a third party being up, and
   * this runs inside the deletion sweep — throwing would block every member
   * queued behind this one.
   */
  it('still purges local rows when the remote revoke fails', async () => {
    const deleteCustomer = jest
      .fn()
      .mockRejectedValue(new Error('saltedge_406'));
    const { service, txModel, bankConnectionModel } = harness({
      deleteCustomer,
    });

    await expect(service.purgeForUser(userId)).resolves.toBeUndefined();

    expect(txModel.deleteMany).toHaveBeenCalledWith({ user_id: userId });
    expect(bankConnectionModel.deleteMany).toHaveBeenCalledWith({
      user_id: userId,
    });
  });

  it('skips the aggregator entirely when Salt Edge is not configured', async () => {
    const { service, deleteCustomer, txModel } = harness({
      configured: false,
    });

    await service.purgeForUser(userId);

    expect(deleteCustomer).not.toHaveBeenCalled();
    expect(txModel.deleteMany).toHaveBeenCalledWith({ user_id: userId });
  });

  it('ignores connection rows carrying no customer id', async () => {
    const { service, deleteCustomer } = harness({
      connections: [{}, { saltedge_customer_id: '  ' }],
    });

    await service.purgeForUser(userId);

    expect(deleteCustomer).not.toHaveBeenCalled();
  });
});

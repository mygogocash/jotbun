import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Types } from 'mongoose';

import { ConflictException } from '@nestjs/common';

import {
  SpendImportService,
  SPEND_IMPORT_STALE_RUNNING_MS,
} from './spend-import.service';

const FIXTURES = path.resolve(__dirname, 'fixtures');
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439011');

describe('SpendImportService drain', () => {
  it('parses a MeowJot CSV then drops the original payload', async () => {
    const buf = readFileSync(path.join(FIXTURES, 'meowjot-export-sample.csv'));
    const jobId = new Types.ObjectId();
    const { service, jobModel, txModel } = makeImportService({
      _id: jobId,
      user_id: USER_ID,
      payload: buf,
      filename: 'Export_sample.csv',
      status: 'running',
    });

    await service.drainOne();

    expect(jobModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        $or: [
          { status: 'queued' },
          {
            status: 'running',
            started_at: { $lte: expect.any(Date) },
          },
        ],
      },
      { $set: { status: 'running', started_at: expect.any(Date) } },
      { returnDocument: 'after' },
    );
    const staleCutoff = (
      jobModel.findOneAndUpdate.mock.calls[0][0] as {
        $or: Array<{ started_at?: { $lte: Date } }>;
      }
    ).$or[1].started_at?.$lte as Date;
    expect(Date.now() - staleCutoff.getTime()).toBeGreaterThanOrEqual(
      SPEND_IMPORT_STALE_RUNNING_MS - 50,
    );
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      { _id: jobId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'succeeded',
          mapper: 'meowjot',
          parsed_sum_minor: 29000 + 23000 + 2000 + 100000 + 200000 + 35000,
        }),
        $unset: { payload: 1 },
      }),
    );
    expect(jobModel.updateOne).not.toHaveBeenCalledWith(
      { _id: jobId },
      { $unset: { payload: 1 } },
    );

    const firstTx = txModel.create.mock.calls[0][0] as {
      amount_minor: number;
      occurred_on: string;
      source: string;
      type: string;
    };
    expect(firstTx).toMatchObject({
      amount_minor: 29000,
      occurred_on: '2025-12-01',
      source: 'meowjot',
      type: 'expense',
    });
    expect(txModel.create.mock.calls.length).toBe(6);
    expect(JSON.stringify(txModel.create.mock.calls)).not.toMatch(/withdraw/i);
  });

  it('unsets payload when the file cannot be parsed', async () => {
    const jobId = new Types.ObjectId();
    const { service, jobModel, txModel } = makeImportService({
      _id: jobId,
      user_id: USER_ID,
      payload: Buffer.from('foo,bar\n1,2\n', 'utf8'),
      filename: 'unknown.csv',
      status: 'running',
    });

    await service.drainOne();

    expect(txModel.create).not.toHaveBeenCalled();
    expect(jobModel.updateOne).toHaveBeenCalledTimes(1);
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      { _id: jobId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          error_code: 'UNKNOWN_MAPPER',
        }),
        $unset: { payload: 1 },
      }),
    );
  });

  it('fails closed with PERSIST_FAILED and unsets payload when a wallet upsert returns null', async () => {
    const buf = readFileSync(path.join(FIXTURES, 'meowjot-export-sample.csv'));
    const jobId = new Types.ObjectId();
    const { service, jobModel, walletModel, txModel } = makeImportService({
      _id: jobId,
      user_id: USER_ID,
      payload: buf,
      filename: 'Export_sample.csv',
      status: 'running',
    });
    walletModel.findOneAndUpdate.mockResolvedValue(null);

    await service.drainOne();

    expect(txModel.create).not.toHaveBeenCalled();
    expect(jobModel.updateOne).toHaveBeenCalledTimes(1);
    expect(jobModel.updateOne).toHaveBeenCalledWith(
      { _id: jobId },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed',
          error_code: 'PERSIST_FAILED',
        }),
        $unset: { payload: 1 },
      }),
    );
    expect(jobModel.updateOne.mock.calls).not.toEqual(
      expect.arrayContaining([
        [
          { _id: jobId },
          expect.objectContaining({
            $set: expect.objectContaining({ status: 'succeeded' }),
          }),
        ],
      ]),
    );
  });
});

describe('SpendImportService enqueue', () => {
  it('re-queues a failed hash instead of mapping the unique index to IN_FLIGHT', async () => {
    const buf = readFileSync(path.join(FIXTURES, 'meowjot-export-sample.csv'));
    const jobId = new Types.ObjectId();
    const { service, jobModel } = makeImportService({
      _id: jobId,
      user_id: USER_ID,
      payload: buf,
      filename: 'Export_sample.csv',
      status: 'queued',
    });
    const failed = {
      _id: jobId,
      user_id: USER_ID,
      import_hash: createHash('sha256').update(buf).digest('hex'),
      status: 'failed',
      error_code: 'PERSIST_FAILED',
    };
    jobModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(failed),
    });
    jobModel.findOneAndUpdate.mockResolvedValue({
      ...failed,
      status: 'queued',
      payload: buf,
    });
    jobModel.create.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 11000 }),
    );

    const result = await service.enqueue(
      USER_ID.toHexString(),
      buf,
      'Export_sample.csv',
    );

    expect(result).toEqual({ job_id: String(jobId), status: 'queued' });
    expect(jobModel.create).not.toHaveBeenCalled();
    expect(jobModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: jobId, status: 'failed' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'queued',
          error_code: null,
          payload: buf,
        }),
      }),
      { returnDocument: 'after' },
    );
  });

  it('counts succeeded import jobs for LINE pie share unlock', async () => {
    const buf = readFileSync(path.join(FIXTURES, 'meowjot-export-sample.csv'));
    const { service, jobModel } = makeImportService({
      _id: new Types.ObjectId(),
      user_id: USER_ID,
      payload: buf,
      filename: 'Export_sample.csv',
      status: 'succeeded',
    });
    jobModel.countDocuments.mockResolvedValue(20);

    await expect(service.countSucceeded(USER_ID.toHexString())).resolves.toBe(
      20,
    );
    expect(jobModel.countDocuments).toHaveBeenCalledWith({
      user_id: USER_ID,
      status: 'succeeded',
    });
  });

  it('maps a unique in-flight collision on retry to IN_FLIGHT', async () => {
    const buf = readFileSync(path.join(FIXTURES, 'meowjot-export-sample.csv'));
    const jobId = new Types.ObjectId();
    const { service, jobModel } = makeImportService({
      _id: jobId,
      user_id: USER_ID,
      payload: buf,
      filename: 'Export_sample.csv',
      status: 'queued',
    });
    jobModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: jobId,
        user_id: USER_ID,
        status: 'failed',
        error_code: 'UNKNOWN_MAPPER',
      }),
    });
    jobModel.findOneAndUpdate.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 11000 }),
    );

    await expect(
      service.enqueue(USER_ID.toHexString(), buf, 'Export_sample.csv'),
    ).rejects.toBeInstanceOf(ConflictException);
    try {
      await service.enqueue(USER_ID.toHexString(), buf, 'Export_sample.csv');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toEqual({
        code: 'IN_FLIGHT',
      });
    }
    expect(jobModel.create).not.toHaveBeenCalled();
  });
});

function makeImportService(claimed: {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  payload: Buffer;
  filename: string;
  status: string;
}) {
  const jobModel = {
    createIndexes: jest.fn().mockResolvedValue([]),
    findOneAndUpdate: jest.fn().mockResolvedValue(claimed),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    findOne: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
  };
  const walletModel = {
    createIndexes: jest.fn().mockResolvedValue([]),
    findOneAndUpdate: jest.fn(async (filter: { name: string }): Promise<{ _id: Types.ObjectId; name: string } | null> => ({
      _id: new Types.ObjectId(),
      name: filter.name,
    })),
  };
  const categoryModel = {
    createIndexes: jest.fn().mockResolvedValue([]),
    findOneAndUpdate: jest.fn(async (filter: { name: string }) => ({
      _id: new Types.ObjectId(),
      name: filter.name,
    })),
  };
  const txModel = {
    createIndexes: jest.fn().mockResolvedValue([]),
    create: jest.fn(async (doc: Record<string, unknown>) => ({
      _id: new Types.ObjectId(),
      ...doc,
    })),
  };

  const service = new SpendImportService(
    jobModel as never,
    walletModel as never,
    categoryModel as never,
    txModel as never,
  );
  return { service, jobModel, walletModel, categoryModel, txModel };
}

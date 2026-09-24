import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AnalyticsService } from 'src/analytics/analytics.service';
import { ACTIVE_OFFER_FILTER } from 'src/offer/active-offer-filter';
import { Offer } from 'src/offer/schemas/offer.schema';
import type { SpendTxSource } from '@gogospend/contracts';

import { spendRowFingerprint } from './mappers/parse-spend-file';
import { SpendCategory } from './schemas/spend-category.schema';
import { SpendTx } from './schemas/spend-tx.schema';
import { SpendWallet } from './schemas/spend-wallet.schema';

export type UpdateSpendTxInput = {
  amount_minor?: number;
  occurred_on?: string;
  category?: string;
  note?: string;
};

/**
 * Sources whose AMOUNT the member owns, so they may correct it.
 *
 * `autolog` (a mirror of a GoGoCash cashback conversion) and `saltedge` (a line
 * the bank sent us) are deliberately absent: the number came from another book,
 * and editing it here would leave the two disagreeing with no way to tell which
 * is right. Those rows stay deletable — removing a row admits it is gone, where
 * a silently rewritten amount hides the conflict.
 */
const MEMBER_OWNED_AMOUNT_SOURCES: ReadonlySet<string> = new Set([
  'manual',
  'spendee',
  'meowjot',
  'moneylover',
  'slip_qr',
  'slip_ocr',
]);

/** One row of the summary card's month dropdown. */
export type SpendMonthTotals = {
  /** `YYYY-MM`. */
  month: string;
  expense_minor: number;
  income_minor: number;
};

export type SpendCategoryView = {
  name: string;
  type: 'expense' | 'income';
  emoji?: string;
  hue?: string;
};

export type AddSpendTxInput = {
  amount_minor: number;
  type: 'expense' | 'income' | 'transfer';
  occurred_on: string;
  category: string;
  wallet_name?: string;
  note?: string;
  merchant?: string;
  /** The provider's id for a row we filled in — never the member's own words. */
  external_ref?: string;
  source?: SpendTxSource;
};

@Injectable()
export class SpendService {
  private readonly logger = new Logger(SpendService.name);

  constructor(
    @InjectModel(SpendWallet.name)
    private readonly walletModel: Model<SpendWallet>,
    @InjectModel(SpendCategory.name)
    private readonly categoryModel: Model<SpendCategory>,
    @InjectModel(SpendTx.name)
    private readonly txModel: Model<SpendTx>,
    @Optional() private readonly analytics?: AnalyticsService,
    @Optional()
    @InjectModel(Offer.name)
    private readonly offerModel?: Model<Offer>,
  ) {}

  /**
   * Correct a row in place. Category and note are always the member's to change;
   * the amount and date only when the number was theirs to begin with — see
   * {@link MEMBER_OWNED_AMOUNT_SOURCES}.
   *
   * A row belonging to somebody else is reported as missing rather than
   * forbidden: "not yours" would confirm the id exists.
   */
  async updateTx(
    userId: string,
    txId: string,
    patch: UpdateSpendTxInput,
  ): Promise<{ id: string }> {
    const userOid = new Types.ObjectId(userId);
    if (!Types.ObjectId.isValid(txId)) {
      throw new NotFoundException({ code: 'SPEND_TX_NOT_FOUND' });
    }
    const txOid = new Types.ObjectId(txId);
    const existing = (await this.txModel
      .findOne({ _id: txOid, user_id: userOid })
      .lean()) as {
      source?: string;
      type?: string;
      category?: string;
      merchant?: string;
      note?: string;
      tags?: string[];
    } | null;
    if (!existing) {
      throw new NotFoundException({ code: 'SPEND_TX_NOT_FOUND' });
    }

    const changesTheNumber =
      patch.amount_minor !== undefined || patch.occurred_on !== undefined;
    if (
      changesTheNumber &&
      !MEMBER_OWNED_AMOUNT_SOURCES.has(String(existing.source))
    ) {
      throw new BadRequestException({ code: 'SPEND_AMOUNT_LOCKED' });
    }

    const set: Record<string, unknown> = {};
    if (patch.amount_minor !== undefined) {
      if (!Number.isInteger(patch.amount_minor) || patch.amount_minor < 1) {
        throw new BadRequestException({ code: 'SPEND_BAD_AMOUNT' });
      }
      set.amount_minor = patch.amount_minor;
    }
    if (patch.occurred_on !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.occurred_on)) {
        throw new BadRequestException({ code: 'SPEND_BAD_DATE' });
      }
      set.occurred_on = patch.occurred_on;
    }
    if (patch.note !== undefined) set.note = patch.note;
    if (patch.category !== undefined) {
      const categoryName = patch.category.trim() || 'Other';
      const categoryType = existing.type === 'income' ? 'income' : 'expense';
      // Same upsert as adding: a name the member types becomes theirs.
      const category = await this.categoryModel.findOneAndUpdate(
        { user_id: userOid, name: categoryName, type: categoryType },
        {
          $setOnInsert: {
            user_id: userOid,
            name: categoryName,
            type: categoryType,
            source: 'manual',
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      if (!category) {
        throw new Error('spend category upsert failed');
      }
      set.category = categoryName;
      set.category_id = category._id;
    }

    /*
     * Tags are stored, not derived at read time, so the compare rule has to run
     * again over the row's new words. Without this a row the member re-filed as
     * travel stayed invisible to Compare, and deleting and retyping it was the
     * only way out — the thing editing exists to avoid.
     *
     * `withCompareTag` only ever adds, so a tag the member or an importer set
     * survives the edit.
     *
     * The FINGERPRINT is deliberately left alone. It identifies the source row
     * this came from, not the member's current copy of it: re-importing the
     * same file must still recognise an edited row as already imported. A row
     * typed by hand carries an opaque per-row fingerprint (see `addTx`), so
     * there is nothing to recompute there either.
     */
    if (patch.category !== undefined || patch.note !== undefined) {
      set.tags = withCompareTag(
        existing.tags ?? [],
        String(set.category ?? existing.category ?? ''),
        existing.merchant ?? '',
        String(set.note ?? existing.note ?? ''),
      );
    }

    if (Object.keys(set).length > 0) {
      await this.txModel.updateOne(
        { _id: txOid, user_id: userOid },
        { $set: set },
      );
    }
    return { id: txId };
  }

  /** Remove a row the member owns. Any source may go — see the note above. */
  async deleteTx(userId: string, txId: string): Promise<{ id: string }> {
    const userOid = new Types.ObjectId(userId);
    if (!Types.ObjectId.isValid(txId)) {
      throw new NotFoundException({ code: 'SPEND_TX_NOT_FOUND' });
    }
    const txOid = new Types.ObjectId(txId);
    const result = await this.txModel.deleteOne({
      _id: txOid,
      user_id: userOid,
    });
    if ((result?.deletedCount ?? 0) === 0) {
      throw new NotFoundException({ code: 'SPEND_TX_NOT_FOUND' });
    }
    return { id: txId };
  }

  /**
   * The member's own categories, so the app can draw them back as chips.
   *
   * They were always being stored — every saved transaction upserts one — and
   * never read, so a category a member made vanished from the screen the moment
   * they left the page. Newest first: the one just made is the one they are
   * most likely looking for.
   */
  /**
   * PDPA data-export projection for one member. Read-only; serves the
   * machine-to-machine `GET /internal/spend/users/:id/export` route.
   * Standalone addition — no monorepo counterpart (the monorepo gathers
   * spend rows in-process via pdpa-gather).
   */
  async exportForUser(userId: string) {
    const userOid = new Types.ObjectId(userId);
    const [wallets, categories, txs] = await Promise.all([
      this.walletModel.find({ user_id: userOid }).lean(),
      this.categoryModel.find({ user_id: userOid }).lean(),
      this.txModel
        .find({ user_id: userOid })
        .select({ payload: 0 })
        .lean(),
    ]);
    return { wallets, categories, txs };
  }

  async listCategories(userId: string): Promise<SpendCategoryView[]> {
    const rows = await this.categoryModel
      .find({ user_id: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((row) => ({
      name: row.name,
      type: row.type,
      emoji: row.emoji,
      hue: row.hue,
    }));
  }

  /**
   * Make one up front, before any money has been recorded against it.
   *
   * An upsert rather than an insert: the same name may already exist from a
   * transaction saved earlier, and the member naming it now is choosing how it
   * should LOOK — so the mark and colour win, and nothing about the existing
   * category's transactions is touched.
   */
  async createCategory(
    userId: string,
    input: {
      name: string;
      type: 'expense' | 'income';
      emoji?: string;
      hue?: string;
    },
  ): Promise<SpendCategoryView> {
    const set: Record<string, unknown> = {
      name: input.name,
      type: input.type,
      source: 'manual',
    };
    // Only written when chosen, so naming a category without a colour never
    // wipes a colour it already had.
    if (input.emoji !== undefined) set.emoji = input.emoji;
    if (input.hue !== undefined) set.hue = input.hue;

    const row = await this.categoryModel
      .findOneAndUpdate(
        {
          user_id: new Types.ObjectId(userId),
          name: input.name,
          type: input.type,
        },
        { $set: set, $setOnInsert: { user_id: new Types.ObjectId(userId) } },
        // `returnDocument`, not the deprecated `new` boolean — swept for by
        // `mongoose-return-document`.
        { returnDocument: 'after', upsert: true },
      )
      .lean();
    if (!row) {
      throw new Error('spend category upsert failed');
    }
    return { name: row.name, type: row.type, emoji: row.emoji, hue: row.hue };
  }

  async summary(userId: string, month: string) {
    const userOid = new Types.ObjectId(userId);
    const { start, end } = monthBounds(month);
    const txs = await this.txModel
      .find({
        user_id: userOid,
        occurred_on: { $gte: start, $lte: end },
      })
      .lean();
    const expense = txs
      .filter((row) => row.type === 'expense')
      .reduce((sum, row) => sum + row.amount_minor, 0);
    const income = txs
      .filter((row) => row.type === 'income')
      .reduce((sum, row) => sum + row.amount_minor, 0);
    /*
     * Two breakdowns, not one. The card lets a member switch the ring from
     * money out to money in, and the transaction list cannot answer the second
     * question — `listTxs` is capped at 200 rows a month, so a busy month would
     * quietly under-report where the money came from.
     *
     * A transfer moves money between the member's own wallets and belongs in
     * neither, the same as it belongs in neither total above.
     */
    const pieMap = new Map<string, number>();
    const pieInMap = new Map<string, number>();
    /*
     * The cashback GoGoCash already paid this member, mirrored into the diary
     * as income and marked `autolog`. It is a SLICE of `income_minor`, not a
     * second total beside it — the Overview card leans on that, so double
     * counting it here would make the card disagree with its own figures.
     */
    let cashback = 0;
    for (const row of txs) {
      if (row.type === 'income' && row.source === 'autolog') {
        cashback += row.amount_minor;
      }
      const into =
        row.type === 'expense'
          ? pieMap
          : row.type === 'income'
            ? pieInMap
            : null;
      if (!into) continue;
      const key = String(row.category_id);
      into.set(key, (into.get(key) ?? 0) + row.amount_minor);
    }
    const categoryIds = [...pieMap.keys(), ...pieInMap.keys()].map(
      (id) => new Types.ObjectId(id),
    );
    const categories = categoryIds.length
      ? await this.categoryModel.find({ _id: { $in: categoryIds } }).lean()
      : [];
    const nameById = new Map(
      categories.map((cat) => [String(cat._id), cat.name]),
    );
    const slices = (totals: Map<string, number>) =>
      [...totals.entries()].map(([id, amount_minor]) => ({
        category: nameById.get(id) ?? 'Other',
        amount_minor,
      }));
    /*
     * How many of the month's purchases were at a brand that pays cashback.
     *
     * A COUNT, and never a baht total. `matchMissedCashback` resolves a
     * merchant to `{ href, offer_name }` — it knows a live offer exists for
     * that shop and nothing at all about the rate it would have paid. Stating
     * a figure here would mean inventing one, on the screen where a member
     * checks what their money did.
     */
    const offersByMerchant = await this.matchMissedCashback(
      txs.map((row) => row.merchant ?? ''),
    );
    /*
     * Expenses only. The month's autolog rows are income carrying the offer's
     * own name as their merchant, so an unfiltered match counted the cashback
     * GoGoCash had just paid as cashback the member had missed — on the same
     * card that states the earned figure directly above. A transfer is not a
     * purchase either.
     */
    const missedOfferCount = offersByMerchant.size
      ? txs.filter(
          (row) =>
            row.type === 'expense' &&
            offersByMerchant.has(normalizeMerchant(row.merchant ?? '')),
        ).length
      : 0;

    return {
      month: start.slice(0, 7),
      expense_minor: expense,
      income_minor: income,
      cashback_minor: cashback,
      missed_offer_count: missedOfferCount,
      pie: slices(pieMap),
      pie_in: slices(pieInMap),
      tx_count: txs.length,
    };
  }

  /**
   * Every month the member has a record in, newest first, each one totalled.
   *
   * The month dropdown on the summary card needs this and cannot work it out:
   * the app can ask for any month it likes, but "which months have anything in
   * them?" is a question about the whole collection, and walking backwards a
   * month at a time until one comes back empty would stop at the first gap.
   *
   * Grouped here rather than by the database. One member's rows are a bounded
   * set read once per page load, and the plain read stays honest about what it
   * costs; an aggregation pipeline would be the answer if that stops being true.
   */
  async listMonths(userId: string): Promise<SpendMonthTotals[]> {
    const txs = await this.txModel
      .find({ user_id: new Types.ObjectId(userId) })
      .lean();

    const byMonth = new Map<string, SpendMonthTotals>();
    for (const row of txs) {
      const month = String(row.occurred_on).slice(0, 7);
      let totals = byMonth.get(month);
      if (!totals) {
        totals = { month, expense_minor: 0, income_minor: 0 };
        byMonth.set(month, totals);
      }
      // A transfer is the member's own money moving between their own wallets.
      if (row.type === 'expense') totals.expense_minor += row.amount_minor;
      else if (row.type === 'income') totals.income_minor += row.amount_minor;
    }

    // `YYYY-MM` sorts correctly as a plain string; newest month first.
    return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  }

  async listTxs(userId: string, month: string) {
    const userOid = new Types.ObjectId(userId);
    const { start, end } = monthBounds(month);
    const txs = await this.txModel
      .find({
        user_id: userOid,
        occurred_on: { $gte: start, $lte: end },
      })
      .sort({ occurred_on: -1, _id: -1 })
      .limit(200)
      .lean();
    const categoryIds = [...new Set(txs.map((row) => String(row.category_id)))];
    const categories = categoryIds.length
      ? await this.categoryModel
          .find({
            _id: { $in: categoryIds.map((id) => new Types.ObjectId(id)) },
          })
          .lean()
      : [];
    const nameById = new Map(
      categories.map((cat) => [String(cat._id), cat.name]),
    );
    /*
     * Which wallet each row came out of.
     *
     * Every row has carried a `wallet_id` since the diary shipped and `addTx`
     * has always upserted one, but the list never resolved it, so the wallets
     * a member's money actually moves through were invisible to the app. Same
     * shape as the category lookup directly above: one read for the ids on the
     * page, never one per row.
     */
    const walletIds = [
      ...new Set(txs.map((row) => String(row.wallet_id))),
      /*
       * Validity-checked rather than trusted. `wallet_id` is required by the
       * schema, so every row written through this service has one — but a
       * single malformed id would otherwise throw out of `new ObjectId` and
       * take the member's whole month of records down with it. A row we cannot
       * place falls back to Cash below, which is what `addTx` defaults to.
       */
    ].filter((id) => Types.ObjectId.isValid(id));
    const wallets = walletIds.length
      ? await this.walletModel
          .find({ _id: { $in: walletIds.map((id) => new Types.ObjectId(id)) } })
          .lean()
      : [];
    const walletById = new Map(
      wallets.map((row) => [String(row._id), row.name]),
    );
    const cashbackByMerchant = await this.matchMissedCashback(
      txs.map((row) => row.merchant ?? ''),
    );
    return txs.map((row) => {
      const merchant = row.merchant ?? '';
      const tags = row.tags ?? [];
      return {
        id: String(row._id),
        occurred_on: row.occurred_on,
        type: row.type,
        amount_minor: row.amount_minor,
        category: nameById.get(String(row.category_id)) ?? 'Other',
        wallet: walletById.get(String(row.wallet_id)) ?? 'Cash',
        merchant,
        note: row.note,
        external_ref: row.external_ref ?? '',
        source: row.source,
        tags,
        compare: tags.includes('compare'),
        missed_cashback: cashbackByMerchant.get(normalizeMerchant(merchant)),
      };
    });
  }

  async addTx(userId: string, input: AddSpendTxInput) {
    const userOid = new Types.ObjectId(userId);
    const walletName = input.wallet_name?.trim() || 'Cash';
    const categoryName = input.category.trim() || 'Other';
    const wallet = await this.walletModel.findOneAndUpdate(
      { user_id: userOid, name: walletName },
      {
        $setOnInsert: {
          user_id: userOid,
          name: walletName,
          kind: 'cash',
          currency: 'THB',
          source: 'manual',
          import_id: null,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    const categoryType = input.type === 'income' ? 'income' : 'expense';
    const category = await this.categoryModel.findOneAndUpdate(
      { user_id: userOid, name: categoryName, type: categoryType },
      {
        $setOnInsert: {
          user_id: userOid,
          name: categoryName,
          type: categoryType,
          source: 'manual',
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!wallet || !category) {
      throw new Error('spend wallet or category upsert failed');
    }
    const source: SpendTxSource =
      input.source === 'autolog' ? 'autolog' : 'manual';
    const merchant = input.merchant ?? '';
    const note = input.note ?? '';
    const externalRef = input.external_ref?.trim() ?? '';
    if (source === 'autolog') {
      const importedDup = await this.findImportedDup(
        userOid,
        input.occurred_on,
        input.amount_minor,
        merchant,
      );
      if (importedDup) {
        return { id: importedDup, duplicate: true };
      }
    }
    const tags = withCompareTag([], categoryName, merchant, note);
    const row = {
      occurred_on: input.occurred_on,
      type: input.type,
      amount_minor: input.amount_minor,
      category: categoryName,
      wallet_name: walletName,
      merchant,
      note,
      tags,
    };
    /*
     * Content hashing is the right dedup key for sources that get replayed —
     * a re-imported file, a Salt Edge refetch, a second autolog run — but a
     * manual entry is not a replay. Two ฿60 coffees on one day hash alike, so
     * the unique `{user_id, fingerprint}` index rejected the second one and
     * addTx reported it as an already-seen duplicate. A typed row therefore
     * carries its own identity instead of its content's.
     */
    const fingerprint =
      source === 'manual'
        ? `manual:${new Types.ObjectId().toHexString()}`
        : spendRowFingerprint(source, row);
    try {
      const created = await this.txModel.create({
        user_id: userOid,
        wallet_id: wallet._id,
        category_id: category._id,
        type: input.type,
        amount_minor: input.amount_minor,
        occurred_on: input.occurred_on,
        note,
        merchant,
        tags,
        source,
        import_id: null,
        external_ref: externalRef,
        fingerprint,
      });
      this.analytics
        ?.capture(
          'spend_tx_added',
          { userId, distinctId: userId, platform: 'api' },
          { source },
        )
        ?.catch((error: unknown) => {
          this.logger.error(
            `Analytics emit failed for spend_tx_added: ${
              error instanceof Error ? error.name : 'unknown error'
            }`,
          );
        });
      return { id: String(created._id), duplicate: false };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const existing = await this.txModel
        .findOne({ user_id: userOid, fingerprint })
        .lean();
      return { id: String(existing?._id ?? fingerprint), duplicate: true };
    }
  }

  private async findImportedDup(
    userOid: Types.ObjectId,
    occurredOn: string,
    amountMinor: number,
    merchant: string,
  ): Promise<string | null> {
    const candidates = await this.txModel
      .find({
        user_id: userOid,
        occurred_on: occurredOn,
        amount_minor: amountMinor,
        source: { $ne: 'autolog' },
      })
      .lean();
    const needle = normalizeMerchant(merchant);
    const hit = candidates.find(
      (row) => normalizeMerchant(String(row.merchant ?? '')) === needle,
    );
    return hit ? String(hit._id) : null;
  }

  private async matchMissedCashback(
    merchants: string[],
  ): Promise<Map<string, { href: string; offer_name: string }>> {
    const found = new Map<string, { href: string; offer_name: string }>();
    if (!this.offerModel) return found;
    /*
     * Keyed by the normalized name the callers look rows up by, but carrying
     * the words, which normalizing throws away and matching needs.
     */
    const unique = new Map<string, string[]>();
    for (const raw of merchants) {
      const key = normalizeMerchant(raw);
      if (key.length < 3 || unique.has(key)) continue;
      unique.set(key, merchantTokens(raw));
    }
    if (unique.size === 0) return found;
    /*
     * The catalogue's own liveness rule, not a hand-written approximation.
     *
     * This matched `status: 'approved'` exactly, which is narrower than "live"
     * in one direction and wider in another. Narrower: legacy rows predate the
     * `status` field, and an equality match skips documents where it is absent,
     * so a live brand was never offered as a missed-cashback hint. Wider: there
     * was no `disabled` or `partner_availability` clause at all, so a hidden or
     * unavailable brand could be suggested to a member — a hint that leads to a
     * shop they cannot earn on.
     *
     * `ACTIVE_OFFER_FILTER` is the shared definition the customer offer reads
     * and the affiliate mint already use, and it documents precisely why
     * `status` must stay a `$nin`.
     */
    const offers = await this.offerModel
      .find({ ...ACTIVE_OFFER_FILTER })
      .select({ offer_name: 1, merchant_id: 1 })
      /*
       * An unsorted read with a cap is an arbitrary 2000 rows: a brand could be
       * inside the window one month and outside it the next, so a member's hint
       * appeared and vanished with nothing about their spending having changed.
       * `_id` is index-backed and never reshuffles.
       */
      .sort({ _id: 1 })
      .limit(2000)
      .lean();
    /*
     * Scored, then chosen — not "whichever row the scan reached first".
     *
     * The old rule asked whether either normalized name contained the other.
     * `normalizeMerchant` strips every separator, so "apple" sat inside
     * "pineapple" and a purchase at one advertised the other. It also took the
     * first row that matched, over an unsorted read, so which brand a member
     * was sent to could change between two identical months.
     */
    const offersByScore = offers.map((offer) => ({
      offer,
      name: String(offer.offer_name ?? ''),
      tokens: merchantTokens(String(offer.offer_name ?? '')),
    }));
    for (const [key, merchant] of unique) {
      let best: { score: number; name: string; merchantId: unknown } | null =
        null;
      for (const candidate of offersByScore) {
        const score = merchantMatchScore(merchant, candidate.tokens);
        if (score === 0) continue;
        const better =
          best === null ||
          score > best.score ||
          // Same strength: settle it by name so two equal candidates always
          // resolve the same way, whatever order the read returned them in.
          (score === best.score && candidate.name.localeCompare(best.name) < 0);
        if (better) {
          best = {
            score,
            name: candidate.name,
            merchantId: candidate.offer.merchant_id,
          };
        }
      }
      if (best) {
        found.set(key, {
          href: `/offer/${best.merchantId}`,
          offer_name: best.name,
        });
      }
    }
    return found;
  }
}

const COMPARE_HINT =
  /hotel|flight|airbnb|agoda|booking|klook|travel|trip|โรงแรม|ตั๋ว|เที่ยว|เครื่องบิน|vé máy bay|khách sạn/i;

function withCompareTag(
  tags: string[],
  category: string,
  merchant: string,
  note: string,
): string[] {
  if (tags.includes('compare')) return tags;
  if (COMPARE_HINT.test(`${category} ${merchant} ${note}`)) {
    return [...tags, 'compare'];
  }
  return tags;
}

/**
 * A name split into words, rather than flattened into one run of characters.
 *
 * `normalizeMerchant` deletes the separators, which is what a lookup key wants
 * and what matching must not have: with them gone there is no way to tell a
 * whole word from a fragment of one.
 */
function merchantTokens(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^a-z0-9฀-๿]+/)
    .filter(Boolean);
}

/** Whether `needle` appears in `haystack` as a run of whole words. */
function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let all = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

const THAI_CHARACTER = /[฀-๿]/;

/**
 * How strongly an offer name matches a merchant: 3 exact, 2 whole words, 1 a
 * Thai fragment, 0 not at all.
 *
 * Thai is the reason this is not simply word matching. Thai does not put spaces
 * between words, so a Thai name is a single token and "โลตัส" would never be
 * found inside a longer shop name written without spaces. Substring matching
 * stays available for Thai, with a length floor so a couple of shared letters
 * cannot carry it — while Latin names, which do have spaces to go on, must
 * match whole words and can no longer pair "apple" with "pineapple".
 */
function merchantMatchScore(
  merchantTokenList: string[],
  offerTokenList: string[],
): number {
  const merchant = merchantTokenList.join('');
  const offer = offerTokenList.join('');
  if (offer.length < 3 || merchant.length < 3) return 0;
  if (merchant === offer) return 3;
  if (
    containsTokenRun(merchantTokenList, offerTokenList) ||
    containsTokenRun(offerTokenList, merchantTokenList)
  ) {
    return 2;
  }
  const thai = THAI_CHARACTER.test(merchant) && THAI_CHARACTER.test(offer);
  if (thai && (merchant.includes(offer) || offer.includes(merchant))) {
    const shorter = Math.min(merchant.length, offer.length);
    return shorter >= 4 ? 1 : 0;
  }
  return 0;
}

function normalizeMerchant(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, '');
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

function monthBounds(month: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const mon = match ? Number(match[2]) : now.getUTCMonth() + 1;
  const start = `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const end = `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

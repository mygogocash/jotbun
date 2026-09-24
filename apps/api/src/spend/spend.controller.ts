import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { enforceSaltEdgeCallbackSignature } from './salt-edge-callback-signature';
import { multerLimits } from 'src/common/multer-limits';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { FirebaseAuthGuard } from 'src/auth/firebase-auth.guard';
import { RateLimit } from 'src/auth/rate-limit.decorator';
import { RateLimitGuard } from 'src/auth/rate-limit.guard';
import { TermsAcceptanceGuard } from 'src/legal-documents/terms-acceptance.guard';
import { TermsAccess } from 'src/legal-documents/terms-access.decorator';
import {
  SPEND_CATEGORY_EMOJI_MAX_UNITS,
  SPEND_CATEGORY_HUES,
  SPEND_MAX_UPLOAD_BYTES,
  SPEND_TX_TYPES,
} from '@gogospend/contracts';

import { ProductAccessService } from 'src/product-access/product-access.service';
import { isSpendParseFail, parseSpendUpload } from './mappers/parse-spend-file';
import { SpendBankLinkService } from './spend-bank-link.service';
import { SpendImportService } from './spend-import.service';
import { SpendService } from './spend.service';

/** The two mappers `parseSpendUpload` uses for a photograph. */
const SLIP_MAPPERS: ReadonlySet<string> = new Set(['slip_qr', 'slip_ocr']);

class AddSpendTxDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount_minor!: number;

  @IsIn(SPEND_TX_TYPES as unknown as string[])
  type!: 'expense' | 'income' | 'transfer';

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  occurred_on!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  wallet_name?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  /*
   * The provider's own id for a row GoGoCash filled in. Length-capped because
   * it is echoed straight back into the member's list.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  external_ref?: string;

  @IsOptional()
  @IsIn(['manual', 'autolog'] as const)
  source?: 'manual' | 'autolog';
}

class UpdateSpendTxDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount_minor?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  occurred_on?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * A category the member is naming up front, before any money is on it.
 *
 * `emoji` and `hue` are both optional — someone who only wants a name gets the
 * plain tag look — and both are checked HERE rather than trusted from the app.
 * The colour has to be one of the twelve because the set was checked for
 * readability as a set: a chip fills with its own colour and puts near-black
 * ink on top, so an arbitrary hex from a patched client could hand a member a
 * chip they cannot read.
 */
class CreateSpendCategoryDto {
  @IsString()
  name!: string;

  @IsIn(['expense', 'income'])
  type!: 'expense' | 'income';

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsIn(SPEND_CATEGORY_HUES as unknown as string[])
  hue?: string;
}

@ApiTags('spend')
@Controller('spend')
@TermsAccess('current_required')
export class SpendController {
  constructor(
    private readonly spend: SpendService,
    private readonly imports: SpendImportService,
    private readonly bankLink: SpendBankLinkService,
    private readonly productAccess: ProductAccessService,
  ) {}

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Get('summary')
  async summary(@Req() req: Request, @Query('month') month?: string) {
    const userId = await this.requireAllowlisted(req);
    const [body, successful_import_count] = await Promise.all([
      this.spend.summary(userId, month || currentBangkokMonth()),
      this.imports.countSucceeded(userId),
    ]);
    return { ...body, successful_import_count };
  }

  /*
   * The months a member has records in, for the summary card's dropdown.
   *
   * Read once when the card opens and again only when a row is added, so it
   * shares the same generous window as the other reads rather than earning one
   * of its own.
   */
  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Get('months')
  async listMonths(@Req() req: Request) {
    const userId = await this.requireAllowlisted(req);
    return this.spend.listMonths(userId);
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Get('txs')
  async listTxs(@Req() req: Request, @Query('month') month?: string) {
    const userId = await this.requireAllowlisted(req);
    return this.spend.listTxs(userId, month || currentBangkokMonth());
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Post('txs')
  async addTx(@Req() req: Request, @Body() body: AddSpendTxDto) {
    const userId = await this.requireAllowlisted(req);
    return this.spend.addTx(userId, body);
  }

  /*
   * Correcting and removing a row, added 2026-08-30 at the owner's request:
   * until now a member could only add, so a typo could only be lived with.
   *
   * Same rate window as adding — a member fixing a row is doing the same kind of
   * work at the same kind of pace.
   */
  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Patch('txs/:id')
  async updateTx(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateSpendTxDto,
  ) {
    const userId = await this.requireAllowlisted(req);
    return this.spend.updateTx(userId, id, body);
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Delete('txs/:id')
  async deleteTx(@Req() req: Request, @Param('id') id: string) {
    const userId = await this.requireAllowlisted(req);
    return this.spend.deleteTx(userId, id);
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({
    windowMs: 10 * 60_000,
    max: 3,
    key: 'spend:import',
    authenticatedPrincipal: { maxPerClient: 3 },
  })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: multerLimits({ fileSize: SPEND_MAX_UPLOAD_BYTES }),
    }),
  )
  @Post('imports')
  async enqueueImport(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = await this.requireAllowlisted(req);
    if (!file?.buffer?.length) {
      throw new NotFoundException();
    }
    return this.imports.enqueue(
      userId,
      file.buffer,
      file.originalname || 'import.csv',
    );
  }

  /**
   * Read a slip WITHOUT saving it.
   *
   * `POST imports` parses and persists in one go, which is wrong for the add
   * panel: our reader cannot tell a slip the member sent from one they
   * received, so the direction has to be confirmed by a human before anything
   * is written. This hands the numbers back and writes nothing.
   *
   * `type` is deliberately not returned. The parser fills in `expense` for
   * every slip, and shipping that guess to the client invites the client to
   * trust it.
   */
  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({
    // Looser than `imports` (3) because this is the daily path, tighter than
    // the plain read endpoints because OCR is the expensive part.
    windowMs: 10 * 60_000,
    max: 20,
    key: 'spend:slip-read',
    authenticatedPrincipal: { maxPerClient: 20 },
  })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: multerLimits({ fileSize: SPEND_MAX_UPLOAD_BYTES }),
    }),
  )
  @Post('slips/read')
  async readSlip(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.requireAllowlisted(req);
    if (!file?.buffer?.length) {
      throw new NotFoundException();
    }
    const parsed = await parseSpendUpload(
      file.buffer,
      file.originalname || 'slip.jpg',
    );
    if (isSpendParseFail(parsed)) {
      throw new UnprocessableEntityException({ code: parsed.error_code });
    }
    const [row] = parsed.rows;
    if (!SLIP_MAPPERS.has(parsed.mapper) || !row) {
      // A CSV or spreadsheet parses fine and is still not a slip. Saying so is
      // more useful than handing back its first row as if it were one.
      throw new UnprocessableEntityException({ code: 'NOT_A_SLIP' });
    }
    return {
      amount_minor: row.amount_minor,
      occurred_on: row.occurred_on,
      merchant: row.merchant,
      source: parsed.mapper,
    };
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Get('bank-link')
  async bankLinkStatus(@Req() req: Request) {
    const userId = await this.requireAllowlisted(req);
    return this.bankLink.status(userId);
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 10 * 60_000, max: 3, key: 'spend:bank-link' })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Post('bank-link/connect')
  async startBankLink(@Req() req: Request) {
    const userId = await this.requireAllowlisted(req);
    try {
      return await this.bankLink.startConnect(userId);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({ code: 'BANK_LINK_UNAVAILABLE' });
    }
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Get('imports/:id')
  async getImport(@Req() req: Request, @Param('id') id: string) {
    const userId = await this.requireAllowlisted(req);
    const job = await this.imports.getJob(userId, id);
    if (!job) throw new NotFoundException();
    return {
      job_id: String(job._id),
      status: job.status,
      mapper: job.mapper,
      error_code: job.error_code,
      row_ok: job.row_ok,
      row_reject: job.row_reject,
      parsed_sum_minor: job.parsed_sum_minor,
    };
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Get('categories')
  async listCategories(@Req() req: Request) {
    const userId = await this.requireAllowlisted(req);
    return this.spend.listCategories(userId);
  }

  @UseGuards(FirebaseAuthGuard, TermsAcceptanceGuard, RateLimitGuard)
  // Tighter than the reads: naming categories is a rare, deliberate act, and a
  // loop of them would fill a member's own chip row with junk.
  @RateLimit({ windowMs: 60_000, max: 20 })
  @ApiSecurity('access-token')
  @ApiBearerAuth()
  @Post('categories')
  async createCategory(
    @Req() req: Request,
    @Body() body: CreateSpendCategoryDto,
  ) {
    const userId = await this.requireAllowlisted(req);

    const name = (body.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('Category name is required');
    }
    if (
      body.hue !== undefined &&
      !SPEND_CATEGORY_HUES.includes(body.hue as never)
    ) {
      throw new BadRequestException('Unknown category colour');
    }

    const emoji = body.emoji === undefined ? undefined : body.emoji;
    if (emoji !== undefined && !isCategoryEmoji(emoji)) {
      throw new BadRequestException('Category emoji must be a single mark');
    }

    return this.spend.createCategory(userId, {
      name,
      type: body.type,
      emoji,
      hue: body.hue,
    });
  }

  private async requireAllowlisted(req: Request): Promise<string> {
    const user = req['user'] as { sub?: string } | undefined;
    const sub = user?.sub?.trim();
    if (!sub) {
      throw new UnauthorizedException('Authenticated subject missing');
    }
    if (!(await this.productAccess.canUse('spend', sub))) {
      throw new NotFoundException();
    }
    return sub;
  }
}

@ApiTags('spend')
@Controller('spend/bank-link')
export class SpendBankLinkCallbackController {
  private readonly logger = new Logger(SpendBankLinkCallbackController.name);

  constructor(private readonly bankLink: SpendBankLinkService) {}

  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30, key: 'spend:bank-link-callback' })
  @Post('callbacks')
  handleCallback(
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    /*
     * This route is unauthenticated by nature — Salt Edge calls it, not a
     * member — so the signature is the only thing separating a real callback
     * from anyone who knows the URL. Each one makes us spend a metered Salt
     * Edge call, so an unchecked route is a way to burn the budget as well as
     * to trigger imports.
     */
    const outcome = enforceSaltEdgeCallbackSignature({
      callbackUrl: process.env.SALT_EDGE_CALLBACK_URL?.trim() ?? '',
      rawBody: req.rawBody ?? Buffer.alloc(0),
      signature: String(req.headers['signature'] ?? ''),
      publicKeyPem: process.env.SALT_EDGE_CALLBACK_PUBLIC_KEY?.trim() ?? '',
    });
    if (outcome === 'unconfigured') {
      this.logger.warn(
        'saltedge callback accepted WITHOUT signature verification — set SALT_EDGE_CALLBACK_PUBLIC_KEY and SALT_EDGE_CALLBACK_URL to enforce it',
      );
    }
    return this.bankLink.handleCallback(body);
  }
}

function currentBangkokMonth(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 7);
}

/**
 * Whether a string is a mark rather than a second name.
 *
 * Deliberately not "exactly one code point": skin tones, variation selectors
 * and zero-width joiners push a single emoji well past that — the family emoji
 * is eleven UTF-16 units on its own. So the rule is a length cap plus a ban on
 * anything that reads as text, which is what the field is actually at risk of
 * collecting. Letters are matched by Unicode property, not ASCII, or "เพลง"
 * would sail through.
 */
function isCategoryEmoji(value: string): boolean {
  if (!value || value.length > SPEND_CATEGORY_EMOJI_MAX_UNITS) return false;
  if (/[\p{L}\p{N}\s]/u.test(value)) return false;
  return /\p{Extended_Pictographic}/u.test(value);
}

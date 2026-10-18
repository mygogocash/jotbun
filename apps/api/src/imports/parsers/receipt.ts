// A receipt image becomes one review candidate (image:1). Nothing is read
// from the picture in this release - QR decoding and OCR are not enabled (OCR
// would need language model assets pinned at build time; nothing is ever
// downloaded at runtime) - so every field stays unknown and needs review, and
// the file says why (receipt_fields_unread). The legacy slip reader filled in
// today's date and an "expense"; that guessing is deliberately not ported.
import type { ImageFormat, ParseBody } from './protocol.ts';
import type { SanitizedImage } from './image.ts';

export function receiptBody(image: SanitizedImage, format: ImageFormat): ParseBody {
  return {
    layout: 'receipt',
    rows: [
      {
        source_row_id: 'image:1',
        occurred_on: null,
        type: null,
        amount_minor: null,
        wallet_label: null,
        category_label: null,
        merchant: null,
        note: null,
        issues: [
          { field: 'occurred_on', code: 'missing_date' },
          { field: 'type', code: 'missing_type' },
          { field: 'amount_minor', code: 'missing_amount' },
          { field: 'wallet_label', code: 'missing_wallet' },
        ],
      },
    ],
    file_issues: ['receipt_fields_unread'],
    image: { format, width: image.width, height: image.height, base64: image.bytes.toString('base64') },
  };
}

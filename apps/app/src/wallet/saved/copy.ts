import type { DraftTable } from '../copy/draftText.ts';

/**
 * The saved moment's lines (P2-T17; bw-saved, rh-offline). Data only: the toast
 * reads them through `useDraftCopy`, with the shared lines (`common.undo`,
 * `common.amountHidden`, the baht words). Default pending owner Q3: the English
 * lines are drafts for E2-B.
 */
export const COPY = {
  'saved.toast': { th: 'บันทึกแล้ว · วันนี้ {amount}', en: 'Saved · Today {amount}' },
  'saved.toastPlain': { th: 'บันทึกแล้ว', en: 'Saved' },
  'saved.toastOffline': { th: 'เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์', en: 'Kept on this phone · Saves when you are online' },
  'saved.undone': { th: 'เลิกทำแล้ว', en: 'Undone' },
  'saved.undoneDeleted': { th: 'เลิกทำแล้ว กู้คืนได้ในรายการที่เพิ่งลบ', en: 'Undone. You can restore it from Recently deleted' },
  'saved.undoConflict': { th: 'ลบไม่ได้ รายการนี้ถูกแก้ในอีกเครื่อง', en: "Couldn't delete. This entry was changed on another device" },
} as const satisfies DraftTable;

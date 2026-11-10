// 1B-T7 typed stub (RED): the vault's AI functions answer empty or wrong values and write nothing. Step 4 puts the real module in place.
import type { AiFeature, AiFigure, AiLocale, AiPreferencesDto, AiPreferencesUpdate, BunFact, CategoryDto, WalletDto } from '@gogospend/contracts'

import type { VaultContext } from './context'

export type AiStoredPreferences = Omit<AiPreferencesDto, 'available'>

export type AiContext = { consent: boolean; wallets: WalletDto[]; categories: CategoryDto[] }

export type Allowance = { satang: string[]; counts: number[]; dates: string[] }

export type AiToolReply = { result: unknown; figures: AiFigure[]; allow: Allowance } | { error: string }

const NOTHING: AiStoredPreferences = { companion: false, cashback_tips: false, notice_version: null, current_notice_version: 0, remaining: { parse: 0, slip: 0, note: 0, ask: 0 } }

export function aiPreferences(_c: VaultContext): AiStoredPreferences {
  return NOTHING
}

export function setAiPreferences(_c: VaultContext, _update: AiPreferencesUpdate): AiStoredPreferences {
  return NOTHING
}

export function aiContext(_c: VaultContext): AiContext {
  return { consent: false, wallets: [], categories: [] }
}

export function consumeAi(_c: VaultContext, _feature: AiFeature): void {}

export function aiDayFacts(_c: VaultContext, _date: string): BunFact[] {
  return []
}

export function aiTool(_c: VaultContext, _name: string, _input: Record<string, unknown>, _locale: AiLocale): AiToolReply {
  return { error: 'stub' }
}

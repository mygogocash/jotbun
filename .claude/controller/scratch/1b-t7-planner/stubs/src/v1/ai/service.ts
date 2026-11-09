// 1B-T7 typed stub (RED): every method answers 501. Step 4 puts the real service in place.
import type { AiAskRequest, AiAskResult, AiLocale, AiNoteResult, AiParseRequest, AiParseResult, AiPreferencesDto, AiPreferencesUpdate, AiSlipRequest, AiSlipResult } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import type { SendMessage } from '../../server/ai/model'
import type { VaultSession } from '../worker-routes'

export type VaultAiServiceDeps = {
  send: SendMessage | null
  model: string
  now?: () => Date
}

const notYet = (): Promise<never> => Promise.reject(new ProblemException(501, 'INTERNAL_ERROR'))

export class VaultAiService {
  constructor(private readonly deps: VaultAiServiceDeps) {}

  get available(): boolean {
    return false
  }

  preferences(_s: VaultSession): Promise<AiPreferencesDto> {
    return notYet()
  }

  setPreferences(_s: VaultSession, _update: AiPreferencesUpdate): Promise<AiPreferencesDto> {
    return notYet()
  }

  parse(_s: VaultSession, _request: AiParseRequest): Promise<AiParseResult> {
    return notYet()
  }

  slip(_s: VaultSession, _request: AiSlipRequest): Promise<AiSlipResult> {
    return notYet()
  }

  note(_s: VaultSession, _date: string, _locale: AiLocale): Promise<AiNoteResult> {
    return notYet()
  }

  ask(_s: VaultSession, _request: AiAskRequest): Promise<AiAskResult> {
    return notYet()
  }
}

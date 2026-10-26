// A scripted stand-in for the Anthropic Messages API: each call returns the
// next scripted message and is recorded, so tests can assert what was sent.
import type { MessageParams, ModelMessage, SendMessage } from '../../src/server/ai/model'

type Step = ModelMessage | Error | ((params: MessageParams) => ModelMessage)

export function fakeModel(steps: Step[] = []) {
  const calls: MessageParams[] = []
  const queue = [...steps]
  const send: SendMessage = async (params) => {
    calls.push(structuredClone(params))
    const next = queue.shift()
    if (!next) throw new Error('fake model: no scripted reply left')
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next(params) : next
  }
  return { send, calls, push: (...more: Step[]) => queue.push(...more), left: () => queue.length }
}

const base = (content: unknown[], stop: string): ModelMessage =>
  ({
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }) as unknown as ModelMessage

export const text = (value: string, stop = 'end_turn') => base([{ type: 'text', text: value, citations: null }], stop)
export const json = (value: unknown) => text(JSON.stringify(value))
export const toolUse = (name: string, input: Record<string, unknown>, id = `toolu_${Math.random().toString(36).slice(2)}`) =>
  base([{ type: 'tool_use', id, name, input }], 'tool_use')
export const refusal = () => base([], 'refusal')

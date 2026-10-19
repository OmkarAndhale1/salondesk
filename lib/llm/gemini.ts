import type { LLMMessage, LLMProvider, LLMTool } from './types'

const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export class GeminiProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async generate(input: {
    systemPrompt: string
    history: LLMMessage[]
    tools: LLMTool[]
  }): Promise<LLMMessage> {
    const response = await fetch(`${endpoint}?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: input.history,
        tools: input.tools.length ? [{ functionDeclarations: input.tools }] : undefined,
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`)

    const payload: unknown = await response.json()
    if (typeof payload !== 'object' || payload === null || !('candidates' in payload)) {
      throw new Error('Gemini returned an invalid response')
    }
    const candidates = (payload as { candidates?: Array<{ content?: { parts?: LLMMessage['parts'] } }> }).candidates
    const parts = candidates?.[0]?.content?.parts
    if (!parts?.length) throw new Error('Gemini returned no response content')
    return { role: 'model', parts }
  }
}
export interface LLMMessage {
  role: 'user' | 'model'
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >
}

export interface LLMTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LLMProvider {
  generate(input: {
    systemPrompt: string
    history: LLMMessage[]
    tools: LLMTool[]
  }): Promise<LLMMessage>
}
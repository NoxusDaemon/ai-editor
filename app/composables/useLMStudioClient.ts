import { LMStudioClient } from '@lmstudio/sdk'

let _client: LMStudioClient | null = null

export const useLMStudioClient = () => {
  if (!_client) {
    _client = new LMStudioClient()
  }
  return _client
}

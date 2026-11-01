/**
 * Service registry. Stores reach side effects (files, LLM, dialogs, toasts, clipboard)
 * through these interfaces, so tests can swap in fakes with `provideServices`.
 */
import type { Clipboard } from './clipboard'
import type { FileSystem } from './files'
import type { LlmProvider } from './llm'

export interface PasswordRequest {
  title: string
  description?: string
  submitLabel?: string
  /** Ask twice and require both entries to match (for setting a new password). */
  confirm?: boolean
  /** Return `false` to show "incorrect password" and keep the dialog open. */
  verify?: (password: string) => Promise<boolean>
}

export interface ConfirmRequest {
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
}

export interface Notice {
  title: string
  description?: string
  color?: 'success' | 'error' | 'warning' | 'info'
}

export interface Dialogs {
  askPassword(request: PasswordRequest): Promise<string | null>
  confirm(request: ConfirmRequest): Promise<boolean>
  notify(notice: Notice): void
}

export interface Services {
  files: FileSystem
  llm: LlmProvider
  dialogs: Dialogs
  clipboard: Clipboard
}

let services: Services | undefined

export function provideServices(value: Services): void {
  services = value
}

export function useServices(): Services {
  if (!services) throw new Error('Services have not been provided yet.')
  return services
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

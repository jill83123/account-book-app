import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Line } from '@/db/types'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
}

export interface DialogState {
  title: string
  message?: string
  confirmText: string
  cancelText: string
  danger: boolean
  input?: { value: string; placeholder?: string }
  resolve: (v: string | boolean | null) => void
}

/** A record being prepared from a receipt scan, handed to the editor. */
export interface Draft {
  merchantName?: string
  date?: string
  time?: string
  lines: Pick<Line, 'name' | 'categoryId' | 'amount' | 'details'>[]
  note?: string
}

export const useUi = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const dialog = ref<DialogState | null>(null)
  const draft = ref<Draft | null>(null)
  /** the day shown on the home page: the + button adds a record to it */
  const selectedDate = ref('')
  /** the record whose details are open in the pop-up */
  const viewingId = ref('')
  /** picking several records to change them together */
  const selecting = ref(false)
  const selectedIds = ref<string[]>([])
  let seq = 0

  function startSelect(id?: string) {
    selecting.value = true
    selectedIds.value = id ? [id] : []
  }
  function stopSelect() {
    selecting.value = false
    selectedIds.value = []
  }
  function toggleSelect(id: string) {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id]
  }

  function toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action'], ms = 3200) {
    const id = ++seq
    toasts.value.push({ id, text, tone, action })
    setTimeout(() => dismiss(id), action ? ms + 2000 : ms)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function confirm(
    title: string,
    opts: { message?: string; confirmText?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) => {
      dialog.value = {
        title,
        message: opts.message,
        confirmText: opts.confirmText ?? '確定',
        cancelText: '取消',
        danger: opts.danger ?? false,
        resolve: (v) => resolve(Boolean(v)),
      }
    })
  }

  function prompt(
    title: string,
    opts: { value?: string; placeholder?: string; confirmText?: string; message?: string } = {},
  ): Promise<string | null> {
    return new Promise((resolve) => {
      dialog.value = {
        title,
        message: opts.message,
        confirmText: opts.confirmText ?? '確定',
        cancelText: '取消',
        danger: false,
        input: { value: opts.value ?? '', placeholder: opts.placeholder },
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      }
    })
  }

  const viewRecord = (id: string) => (viewingId.value = id)

  function closeDialog(result: string | boolean | null) {
    const d = dialog.value
    dialog.value = null
    d?.resolve(result)
  }

  return { toasts, dialog, draft, selectedDate, viewingId, viewRecord, selecting, selectedIds, startSelect, stopSelect, toggleSelect, toast, dismiss, confirm, prompt, closeDialog }
})

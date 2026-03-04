type SystemDialogHandlers = {
  alert: (message: string) => Promise<void>
  confirm: (message: string) => Promise<boolean>
}

let handlers: SystemDialogHandlers | null = null

const normalizeMessage = (value: unknown) => {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  try {
    return String(value)
  } catch {
    return ""
  }
}

export const registerSystemDialogHandlers = (next: SystemDialogHandlers) => {
  handlers = next
  return () => {
    if (handlers === next) handlers = null
  }
}

export const showSystemAlert = async (message: unknown) => {
  const text = normalizeMessage(message)
  if (handlers) {
    await handlers.alert(text)
    return
  }
  if (typeof window !== "undefined") {
    window.alert(text)
  }
}

export const showSystemConfirm = async (message: unknown) => {
  const text = normalizeMessage(message)
  if (handlers) {
    return handlers.confirm(text)
  }
  if (typeof window !== "undefined") {
    return window.confirm(text)
  }
  return false
}

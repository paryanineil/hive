/**
 * Extract the human-readable message from a frappe-react-sdk error.
 *
 * frappe.throw() messages arrive in `_server_messages` (a JSON array of JSON
 * strings, possibly containing HTML); `exception` / `message` carry the raw
 * exception text. Fall back to the caller's generic message.
 */
export function getFrappeErrorMessage(err: unknown, fallback: string): string {
  const e = err as { _server_messages?: string; message?: string; exception?: string } | undefined
  try {
    if (e?._server_messages) {
      const list = JSON.parse(e._server_messages) as string[]
      if (list.length) {
        const first = JSON.parse(list[0]) as { message?: string }
        if (first?.message) return first.message.replace(/<[^>]+>/g, "")
      }
    }
  } catch {
    // fall through to the other fields
  }
  if (e?.exception) {
    // "frappe.exceptions.ValidationError: Complete the checklist..." → drop the class
    const text = e.exception.split(":").slice(1).join(":").trim()
    if (text) return text
  }
  return fallback
}

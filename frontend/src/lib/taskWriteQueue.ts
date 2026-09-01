/**
 * Serializes writes to the same Hive Task from this page.
 *
 * Frappe's REST update is read-modify-write: it loads the whole document,
 * applies the payload, and saves — rewriting ALL child tables from the loaded
 * snapshot. So a scalar-only save (e.g. the sheet's autosave) that overlaps a
 * checklist save can silently revert the checklist to the state it loaded.
 * Queuing per task guarantees the second request loads the document only
 * after the first has committed.
 */
const queues = new Map<string, Promise<unknown>>()

export function enqueueTaskWrite<T>(taskName: string, write: () => Promise<T>): Promise<T> {
  const prev = queues.get(taskName) ?? Promise.resolve()
  // Run after the previous write settles, whether it succeeded or failed.
  const next = prev.then(write, write)
  queues.set(
    taskName,
    next.catch(() => {}),
  )
  return next
}

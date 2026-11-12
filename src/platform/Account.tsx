import { useState } from 'react'
import { doc, getDocFromServer } from 'firebase/firestore'

import type { Queued } from './storage'
import { readFlutterTrip } from '../legacy/ledger'
import { db } from './firebase'
import { useApp } from './context'

type SavedRecord = Record<string, unknown> & { revision: number }

function QueuedItem({ item }: { item: Queued }) {
  const { retry, discard } = useApp()
  const [latest, setLatest] = useState<SavedRecord | null>(null)
  const [message, setMessage] = useState('')
  const { payload } = item

  async function action(work: () => Promise<unknown>) {
    try {
      setMessage('')
      await work()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }
  async function review() {
    let path = `trips/${payload.tripId}`
    if (payload.entryId) {
      const isContribution =
        item.name === 'entry.contribute' || payload.entryType === 'contribution'
      const collection = isContribution ? 'contributions' : 'expenses'
      path += `/${collection}/${payload.entryId}`
    }
    const snapshot = await getDocFromServer(doc(db, path))
    if (!snapshot.exists()) throw Error('The original record is unavailable.')
    const record = snapshot.data()
    setLatest({
      ...record,
      revision: readFlutterTrip(snapshot.id, record).revision,
    })
  }
  return (
    <li>
      <strong>{item.name}</strong>
      <p>{item.error || 'Waiting to sync'}</p>
      <details>
        <summary>Review draft</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
      {latest && (
        <details open>
          <summary>Latest saved record</summary>
          <pre>{JSON.stringify(latest, null, 2)}</pre>
        </details>
      )}
      {item.code?.endsWith('/aborted') && !latest ? (
        <button onClick={() => void action(review)}>Load latest version</button>
      ) : (
        <button
          onClick={() => void action(() => retry(item, latest?.revision))}
        >
          {latest ? 'Retry using reviewed version' : 'Retry'}
        </button>
      )}
      <button onClick={() => void action(() => discard(item))}>Discard</button>
      <span role="status">{message}</span>
    </li>
  )
}
export function QueuePanel() {
  const { queue } = useApp()
  return (
    <div className="card">
      <h2>Pending changes</h2>
      {queue.length ? (
        <ol>
          {queue.map((item) => (
            <QueuedItem key={item.opId} item={item} />
          ))}
        </ol>
      ) : (
        <p>All changes synced.</p>
      )}
    </div>
  )
}

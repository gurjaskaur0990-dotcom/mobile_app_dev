import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from './context'
import { useAction, PageHeading } from '../collaboration/forms'
import { Feedback } from '../collaboration'
import './profile.css'

export function ProfilePage() {
  const { profile, admin, command, logout } = useApp()
  const action = useAction()
  const [field, setField] = useState<'' | 'displayName' | 'username'>('')
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState(false)
  const edit = (next: 'displayName' | 'username') => {
    setField(next)
    setValue(profile[next])
  }
  return (
    <section className="profile-page">
      <PageHeading title="Profile" />
      <section className="card identity-panel">
        {profile.photoURL ? (
          <img className="identity-photo" src={profile.photoURL} alt="" />
        ) : (
          <span className="identity-initial">{profile.displayName.slice(0, 1)}</span>
        )}
        <h2>
          {profile.displayName}{' '}
          <button
            className="edit-field"
            aria-label="Edit display name"
            onClick={() => edit('displayName')}
          >
            Edit
          </button>
        </h2>
        <p>
          @{profile.username}{' '}
          <button
            className="edit-field"
            aria-label="Edit username"
            onClick={() => edit('username')}
          >
            Edit
          </button>
        </p>
        <p>{profile.email}</p>
        {field && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void action.run(async () => {
                await command('profile.update', { [field]: value }, { onlineOnly: true })
                setField('')
                return 'Profile updated.'
              })
            }}
          >
            <label className="field">
              {field === 'username' ? 'Username' : 'Display name'}
              <input
                autoFocus
                required
                minLength={field === 'username' ? 3 : 1}
                maxLength={field === 'username' ? 20 : 100}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <button disabled={action.busy}>Save</button>{' '}
            <button type="button" onClick={() => setField('')}>
              Cancel
            </button>
          </form>
        )}
      </section>
      <section className="card profile-menu">
        {admin && <Link to="/admin">Admin panel</Link>}
        <label>
          <input
            type="checkbox"
            checked={!profile.emailVisible}
            disabled={action.busy}
            onChange={(e) => {
              const hide = e.target.checked
              void action.run(async () => {
                await command('profile.update', { emailVisible: !hide }, { onlineOnly: true })
                return 'Email visibility updated.'
              })
            }}
          />{' '}
          Hide email <small>Only show your username to other users.</small>
        </label>
        <Link to="/archive">Archive</Link>
        <Link to="/recently-deleted">Recently deleted</Link>
        {!admin && (
          <button className="secondary" onClick={() => setFeedback(!feedback)}>
            Submit feedback / bug report
          </button>
        )}
        <button
          className="secondary"
          onClick={() => {
            void logout()
          }}
        >
          Sign out
        </button>
      </section>
      {action.status}
      {feedback && <Feedback />}
    </section>
  )
}

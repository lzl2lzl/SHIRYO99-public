import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { games, lobbyGames } from '../games/registry'
import { Heart, HeartTransition, type HeartEntry } from './HeartMotion'
import './lobby.css'

// One quiet game directory, with gray/purple lettering and a tiny love-note interaction.
// No reference-site panel, theme controls or character art; game routes stay independent.
const BRAND_LOGO = `${import.meta.env.BASE_URL}assets/brand/shiryo99-love.svg`

function LoveNote() {
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    if (!burst) return
    const timeout = window.setTimeout(() => setBurst(0), 1600)
    return () => window.clearTimeout(timeout)
  }, [burst])

  return <div className="lobby-love-note">
    <button type="button" className="lobby-love-button" aria-label="让爱心飘起来" onClick={() => setBurst(value => value + 1)}>
      <Heart />
    </button>
    {burst > 0 ? <span className="lobby-heart-burst" aria-hidden="true" key={burst}>
      {[-66, -42, -15, 18, 44, 66].map((x, index) => <span key={index} className="lobby-flying-heart" style={{
        '--heart-x': `${x}px`, '--heart-y': `${-48 - (index % 3) * 22}px`,
        '--heart-turn': `${x / 2}deg`, '--heart-delay': `${index * 45}ms`,
      } as CSSProperties}><Heart /></span>)}
    </span> : null}
  </div>
}

function Lobby({ onEnter }: { onEnter: (event: MouseEvent<HTMLAnchorElement>, id: string) => void }) {
  return <main className="lobby-shell">
    <div className="lobby-content">
      <header className="brand-header">
        <div className="lobby-wordmark">
          <h1><img src={BRAND_LOGO} alt="SHIRYO99" width="480" height="116" /></h1>
          <LoveNote />
        </div>
        <p className="lobby-pair">Utsugi Shiro <span>×</span> Tsukumo Ryo</p>
      </header>
      <nav className="lobby-games" aria-label="小游戏">
        {lobbyGames.map((game) => (
          <a className="lobby-game-link" href={`#/game/${game.id}`} key={game.id} onClick={event => onEnter(event, game.id)}>
            <span className="lobby-game-title">{game.title}</span>
            <span className="lobby-play" aria-hidden="true">开始
              <span className="lobby-play-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" focusable="false">
                <path d="M4 12h15M13 5l7 7-7 7" />
              </svg></span>
            </span>
          </a>
        ))}
      </nav>
    </div>
    <footer className="lobby-footer">
      <p>非官方同人小游戏。角色权益归原权利方所有。</p>
      <p>联系作者：小红书@并不知道什么叫做可爱</p>
      <p>立绘感谢：蒲绒绒</p>
    </footer>
  </main>
}

export function App() {
  const [activeId, setActiveId] = useState<string | null>(() => location.hash.replace('#/game/', '') || null)
  const [entry, setEntry] = useState<HeartEntry | null>(null)
  const entryLocked = useRef(false)
  const gameViewport = useRef<HTMLDivElement>(null)
  const activeGame = games.find((game) => game.id === (entry?.id ?? activeId))

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', activeGame ? '#11110f' : '#f4f2f7')
  }, [activeGame])

  useEffect(() => {
    const onHashChange = () => {
      const id = location.hash.replace('#/game/', '') || null
      setActiveId(id)
      setEntry(current => {
        if (current && current.id !== id) { entryLocked.current = false; return null }
        return current
      })
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const closeGame = () => {
    history.replaceState(null, '', location.pathname + location.search)
    setEntry(null)
    entryLocked.current = false
    setActiveId(null)
  }

  const enterGame = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (entryLocked.current) return
    const link = event.currentTarget.getBoundingClientRect()
    const logo = document.querySelector('.lobby-love-button')?.getBoundingClientRect() ?? link
    const to = event.detail === 0 ? { x: link.left + link.width / 2, y: link.top + link.height / 2 } : { x: event.clientX, y: event.clientY }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced && CSS.supports('clip-path', 'url(#game-heart-reveal)')) {
      entryLocked.current = true
      setEntry({ id, from: { x: logo.left + logo.width / 2, y: logo.top + logo.height / 2 }, to })
    }
    setActiveId(id)
    location.hash = `/game/${id}`
    if (reduced) requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' })
      if (!gameViewport.current?.querySelector('[role="dialog"]')) gameViewport.current?.focus({ preventScroll: true })
    })
  }
  const finishEntry = useCallback(() => {
    entryLocked.current = false
    setEntry(null)
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' })
      // A restored ending owns its own dialog focus.
      if (!gameViewport.current?.querySelector('[role="dialog"]')) gameViewport.current?.focus({ preventScroll: true })
    })
  }, [])
  const Game = activeGame?.component
  return <>
    {(!activeGame || entry) ? <div className={`lobby-transition-base${entry ? ' is-entering' : ''}`} inert={Boolean(entry)} aria-hidden={entry ? true : undefined}>
      <Lobby onEnter={enterGame} />
    </div> : null}
    {Game ? <div ref={gameViewport} tabIndex={-1} className={`game-viewport${entry ? ' is-entering' : ''}`} inert={Boolean(entry)} aria-hidden={entry ? true : undefined}>
      <Game onExit={closeGame} />
    </div> : null}
    {entry ? <HeartTransition entry={entry} onComplete={finishEntry} /> : null}
  </>
}

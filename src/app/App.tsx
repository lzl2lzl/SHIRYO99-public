import { useEffect, useState } from 'react'
import { games, lobbyGames } from '../games/registry'

const BRAND_LOGO = `${import.meta.env.BASE_URL}assets/brand/shiryo99.svg`

export function App() {
  const [activeId, setActiveId] = useState<string | null>(() => location.hash.replace('#/game/', '') || null)
  const activeGame = games.find((game) => game.id === activeId)

  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', activeGame ? '#11110f' : '#ffffff')
  }, [activeGame])

  useEffect(() => {
    const onHashChange = () => setActiveId(location.hash.replace('#/game/', '') || null)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const closeGame = () => {
    history.replaceState(null, '', location.pathname + location.search)
    setActiveId(null)
  }

  if (activeGame) {
    const Game = activeGame.component
    return <Game onExit={closeGame} />
  }

  return (
    <main className="lobby-shell">
      <header className="brand-header">
        <h1><img src={BRAND_LOGO} alt="SHIRYO99" width="350" height="82" /></h1>
      </header>
      <nav className="lobby-games" aria-label="小游戏">
        {lobbyGames.map((game) => (
          <a className="lobby-game-link" href={`#/game/${game.id}`} key={game.id}>
            <span>{game.title}</span><span className="lobby-play" aria-hidden="true">开始 ›</span>
          </a>
        ))}
      </nav>
      <footer className="lobby-footer">非官方同人小游戏。角色权益归原权利方所有。</footer>
    </main>
  )
}

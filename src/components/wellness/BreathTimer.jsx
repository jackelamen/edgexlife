import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { BREATH_PRESETS, cycleSeconds, phaseAt, cueAhead, breathsPerMinute, LONG_PHASE_SECONDS, MEDITATION_FADE_SECONDS, MEDITATION_TRACKS } from '../../lib/practices'
import { metricColor } from '../../lib/design'

// Breath phase colour = identity, not decoration (lib/design.js rule 1):
// inhale/hold reads as Clarity (the metric this practice trains), exhale
// reads as Groundedness (the metric release/letting-go maps to). Both are
// real wellness metrics elsewhere on this page, not arbitrary lavender/mint.
const BREATH_IN = { hex: metricColor('clarity'), glow: '123,92,214' }
const BREATH_OUT = { hex: metricColor('grounded'), glow: '14,124,134' }

/*
  Practice timer, ported from wellness.html's breath/meditation engine.

  Session lifecycle, same as the original:
    idle -> intro countdown (3-2-1) -> running (breath guide + session
    countdown) -> if paused, everything stops and resumes from where it was
    -> on natural completion (remaining hits 0) the timer lets the CURRENT
    exhale finish before stopping, so a session never cuts off mid-inhale.
    The meditation audio fades out over the last ~10s and pauses.

  Breath phase math is wall-clock (Date.now() - startedAt), not a tick
  accumulator, so a backgrounded tab doesn't drift the visual out of sync
  with the actual elapsed time.
*/
export default function BreathTimer({ onComplete, suggestion }) {
  const [preset, setPreset] = useState(BREATH_PRESETS[0])
  const [duration, setDuration] = useState(preset.minutes * 60)
  const [remaining, setRemaining] = useState(preset.minutes * 60)
  const [running, setRunning] = useState(false)
  const [phaseLabel, setPhaseLabel] = useState('Ready')
  const [phaseView, setPhaseView] = useState({ scale: 0.12, color: BREATH_IN.hex, text: 'Ready', sub: 'ready', progress: 0, key: 'idle', hold: null, cue: null })
  const [fullscreen, setFullscreen] = useState(false)
  const fsRef = useRef(null)
  const [audioSync, setAudioSync] = useState(true)
  const [trackId, setTrackId] = useState(MEDITATION_TRACKS[0].id)
  const track = MEDITATION_TRACKS.find((t) => t.id === trackId) || MEDITATION_TRACKS[0]

  const timerRef = useRef(null)
  const breathRef = useRef(null)
  const introRef = useRef(null)
  const audioRef = useRef(null)
  const fadeRef = useRef(null)
  const fadeStartedRef = useRef(false)
  const startedAtRef = useRef(0)
  const completingRef = useRef(false)
  const remainingRef = useRef(remaining)
  const durationRef = useRef(duration)
  const presetRef = useRef(preset)
  remainingRef.current = remaining
  durationRef.current = duration
  presetRef.current = preset

  useEffect(() => () => clearAll(), [])

  /*
    The overlay alone still leaves the browser's own chrome (tab strip, URL
    bar, OS menu bar) on screen, which is exactly what you don't want to look
    at mid-session. So entering full screen ALSO asks for real document full
    screen; if the browser refuses (iOS Safari has no Fullscreen API on
    non-video elements) the overlay still covers the viewport and everything
    works, just with chrome visible. Esc / the OS gesture leaving native full
    screen closes the overlay too, so the two can't drift out of sync.
  */
  useEffect(() => {
    if (!fullscreen) return
    const el = fsRef.current
    el?.requestFullscreen?.().catch(() => {})
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [fullscreen])

  function clearAll() {
    clearInterval(timerRef.current); timerRef.current = null
    stopBreathGuide()
    clearInterval(introRef.current); introRef.current = null
    clearFade(true)
  }

  function clearFade(restoreVolume) {
    clearInterval(fadeRef.current); fadeRef.current = null
    fadeStartedRef.current = false
    if (restoreVolume && audioRef.current) audioRef.current.volume = 1
  }

  // Linear progress feels mechanical to breathe along with; smoothstep gives
  // the orb a soft start and settle at each end of the phase, which is what
  // an actual inhale/exhale does. Holds have from === to so easing is a no-op.
  const ease = (t) => t * t * (3 - 2 * t)

  /*
    `sub` is the small line under the phase word. It prefers the most specific
    thing it can say: which breath of 30 you're on (Wim Hof only), otherwise
    the preset's pattern. `hold` is a live seconds-remaining readout, shown
    only for phases long enough that a static "Hold" tells you nothing —
    the 60/90/120s retentions especially.
  */
  function applyBreathVisual(phase, progress, remaining, cue) {
    const scale = phase.from + (phase.to - phase.from) * ease(progress)
    setPhaseView({
      scale, color: phase.key === 'out' ? BREATH_OUT.hex : BREATH_IN.hex,
      text: phase.label,
      sub: phase.rep ? `Breath ${phase.rep} / ${phase.reps}${phase.round ? ` · Round ${phase.round}` : ''}` : presetRef.current.pattern,
      progress, key: phase.key,
      hold: phase.seconds >= LONG_PHASE_SECONDS && remaining != null ? Math.ceil(remaining) : null,
      cue: cue || null,
    })
    setPhaseLabel(phase.label)
  }

  function applyIntroVisual(text, sub) {
    setPhaseView({ scale: 0.12, color: BREATH_IN.hex, text, sub, progress: 0, key: 'idle', hold: null, cue: null })
  }

  function updateBreathGuide() {
    if (!startedAtRef.current) { applyBreathVisual(presetRef.current.phases[0], 0); return }
    const elapsed = (Date.now() - startedAtRef.current) / 1000
    const { phase, progress, remaining } = phaseAt(presetRef.current, elapsed)
    applyBreathVisual(phase, progress, remaining, cueAhead(presetRef.current, elapsed))
  }

  function secondsUntilExhaleComplete() {
    if (!startedAtRef.current) return 0
    const elapsed = (Date.now() - startedAtRef.current) / 1000
    const p = presetRef.current
    const total = cycleSeconds(p)
    let t = elapsed % total
    let idx = 0
    for (let i = 0; i < p.phases.length; i++) {
      idx = i
      if (t < p.phases[i].seconds) break
      t -= p.phases[i].seconds
    }
    let seconds = p.phases[idx].seconds - t
    if (p.phases[idx].key === 'out') return Math.ceil(seconds)
    for (let offset = 1; offset <= p.phases.length; offset++) {
      const ph = p.phases[(idx + offset) % p.phases.length]
      seconds += ph.seconds
      if (ph.key === 'out') return Math.ceil(seconds)
    }
    return 0
  }

  // Driven by requestAnimationFrame rather than a 200ms interval: the orb and
  // the halo rings are now continuous motion the user is meant to breathe
  // along with, and 5fps steps read as stuttering however long the CSS
  // transition is. Wall-clock math inside updateBreathGuide is unchanged, so a
  // backgrounded tab (where rAF pauses) still resyncs on the next frame.
  function startBreathGuide() {
    startedAtRef.current = Date.now()
    updateBreathGuide()
    stopBreathGuide()
    const loop = () => { updateBreathGuide(); breathRef.current = requestAnimationFrame(loop) }
    breathRef.current = requestAnimationFrame(loop)
  }

  function stopBreathGuide() {
    if (breathRef.current) cancelAnimationFrame(breathRef.current)
    breathRef.current = null
  }

  function shouldSyncAudio() { return audioSync }

  function playAudio() {
    if (!shouldSyncAudio() || !audioRef.current) return
    clearFade(true)
    audioRef.current.play().catch(() => {})
  }
  function pauseAudio() { clearFade(true); audioRef.current?.pause() }
  function stopAudio() {
    clearFade(true)
    if (!audioRef.current) return
    audioRef.current.pause(); audioRef.current.currentTime = 0; audioRef.current.volume = 1
  }
  function fadeAudioOver(seconds) {
    const audio = audioRef.current
    if (!audio || audio.paused) return
    clearFade(false)
    fadeStartedRef.current = true
    const startVolume = Number.isFinite(audio.volume) ? audio.volume : 1
    const startedAt = Date.now()
    const durationMs = Math.max(1, seconds) * 1000
    fadeRef.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / durationMs)
      audio.volume = Math.max(0, startVolume * (1 - progress))
      if (progress >= 1) { clearFade(false); audio.pause(); audio.volume = 1 }
    }, 100)
  }
  function updateFade() {
    if (fadeStartedRef.current || !shouldSyncAudio()) return
    const fadeWindow = Math.min(MEDITATION_FADE_SECONDS, Math.max(1, durationRef.current))
    if (remainingRef.current > fadeWindow) return
    fadeAudioOver(Math.max(remainingRef.current, 1))
  }

  function completeSession() {
    clearInterval(timerRef.current); timerRef.current = null
    stopBreathGuide()
    completingRef.current = false
    fadeAudioOver(1.6)
    setRunning(false)
    setPhaseLabel('Complete')
    onComplete?.({ preset: presetRef.current, minutes: Math.round(durationRef.current / 60) || 1 })
  }

  function startSessionTimer() {
    startBreathGuide()
    completingRef.current = false
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        let next = r - 1
        if (next <= 0 && !completingRef.current) {
          const finishSeconds = secondsUntilExhaleComplete()
          if (finishSeconds > 0) { completingRef.current = true; next = finishSeconds }
        }
        remainingRef.current = next
        updateFade()
        if (next <= 0) setTimeout(completeSession, 0)
        return next
      })
    }, 1000)
  }

  function startIntroCountdown() {
    let step = 0
    setPhaseLabel('Get ready')
    applyIntroVisual('Begin', "let's begin")
    clearInterval(introRef.current)
    introRef.current = setInterval(() => {
      step++
      if (step <= 3) { setPhaseLabel('Get ready'); applyIntroVisual(String(4 - step), 'starting soon'); return }
      clearInterval(introRef.current); introRef.current = null
      startSessionTimer()
    }, 1000)
  }

  function toggleTimer() {
    if (timerRef.current || introRef.current) {
      clearInterval(timerRef.current); timerRef.current = null
      clearInterval(introRef.current); introRef.current = null
      stopBreathGuide()
      startedAtRef.current = 0
      pauseAudio()
      setRunning(false)
      setPhaseLabel('Paused')
      return
    }
    setRunning(true)
    playAudio()
    startIntroCountdown()
  }

  function resetTimer() {
    clearAll()
    stopAudio()
    startedAtRef.current = 0
    completingRef.current = false
    setRunning(false)
    setRemaining(durationRef.current)
    setPhaseLabel('Ready')
    applyBreathVisual(presetRef.current.phases[0], 0)
  }

  function setMinutesPreset(min) {
    clearAll()
    startedAtRef.current = 0
    completingRef.current = false
    setRunning(false)
    setDuration(min * 60)
    setRemaining(min * 60)
    setPhaseLabel('Ready')
    applyBreathVisual(presetRef.current.phases[0], 0)
  }

  function selectPreset(p) {
    clearAll()
    startedAtRef.current = 0
    completingRef.current = false
    setRunning(false)
    setPreset(p)
    setDuration(p.minutes * 60)
    setRemaining(p.minutes * 60)
    setPhaseLabel('Ready')
    applyBreathVisual(p.phases[0], 0)
  }

  const m = String(Math.floor(remaining / 60)).padStart(2, '0')
  const s = String(remaining % 60).padStart(2, '0')

  const glowRGB = phaseView.color === BREATH_OUT.hex ? BREATH_OUT.glow : BREATH_IN.glow
  // 0 at fully-collapsed, ~1 at fully-expanded — one normalized value that
  // every ambient layer (aura brightness, halo spread, ring opacity) reads
  // from, so the whole scene breathes as a single organism instead of a
  // handful of independently-timed animations.
  const openness = Math.max(0, Math.min(1, (phaseView.scale - 0.12) / 1.02))
  const RING = 2 * Math.PI * 68

  const face = (isFs) => (
    <div className="timer-face">
      {!isFs && (
        <button className="med-full-btn" title="Full screen" onClick={() => setFullscreen(true)}>
          <Icon name="fullscreen" size={20} />
        </button>
      )}
      <div className="breath-visual">
        {/* Halo rings: three copies of the orb's outline trailing it outward at
            increasing scale and decreasing opacity. Reads as an expanding wave
            on the inhale and a collapsing one on the exhale — the "something
            to look at" that is still literally the breath, not decoration
            running on its own clock. */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="breath-halo" style={{
            transform: `scale(${(phaseView.scale * (1 + (i + 1) * 0.16)).toFixed(3)})`,
            borderColor: `rgba(${glowRGB},${(0.30 - i * 0.08) * (0.35 + openness * 0.65)})`,
            opacity: 0.35 + openness * 0.65,
          }} />
        ))}
        <svg viewBox="0 0 156 156">
          <circle cx="78" cy="78" r="68" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7" />
          {/* Now a real progress arc for the current phase rather than a static
              full ring — it sweeps once per inhale/hold/exhale/rest, giving a
              second, slower read on where you are in the pattern. */}
          <circle className="breath-ring" cx="78" cy="78" r="68" fill="none" strokeWidth="7"
            strokeLinecap="round"
            style={{
              stroke: phaseView.color,
              strokeDasharray: RING,
              strokeDashoffset: running ? RING * (1 - phaseView.progress) : 0,
            }} />
        </svg>
        <div className="breath-orb" style={{
          transform: `scale(${phaseView.scale.toFixed(3)})`,
          background: `rgba(${glowRGB},${(0.16 + openness * 0.12).toFixed(3)})`,
          boxShadow: `0 0 ${(24 + openness * 40).toFixed(0)}px rgba(${glowRGB},${(0.12 + openness * 0.16).toFixed(3)}), inset 0 0 28px rgba(255,255,255,.10)`,
        }} />
        <div className="breath-count">
          {/* The cue takes over the centre entirely for its last few seconds.
              Replacing the phase word rather than sitting beside it is the
              point: eyes-closed-ish peeking at a screen, one word has to win. */}
          {phaseView.cue ? (
            <>
              <strong className="breath-cue-num" key={Math.ceil(phaseView.cue.seconds)}>
                {Math.max(1, Math.ceil(phaseView.cue.seconds))}
              </strong>
              <span className="breath-cue-label">{phaseView.cue.cue} in</span>
            </>
          ) : (
            <>
              <strong>{phaseView.text}</strong>
              {phaseView.hold != null && <em className="breath-hold-count">{phaseView.hold}s</em>}
              <span>{phaseView.sub}</span>
            </>
          )}
        </div>
      </div>
      <div className="timer-time">{m}:{s}</div>
      <div style={{ fontSize: isFs ? 18 : 12, color: 'rgba(255,255,255,.55)', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        {phaseLabel}
      </div>
      {isFs && (
        <div className="fs-controls">
          <button className="btn btn-primary" onClick={toggleTimer}>
            <Icon name={running ? 'pause' : 'play_arrow'} size={17} /> {running ? 'Pause' : 'Start'}
          </button>
          <button className="btn btn-secondary" onClick={resetTimer}>
            <Icon name="stop" size={17} /> Reset
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      {face(false)}

      {/* Routed off the dominant state on today's latest check-in. Shown
          even once you've picked something else, because the reason is
          the useful part — it says what it's reasoning from, so you can
          disagree with it rather than just obey a highlighted button. */}
      {suggestion && (
        <div className="breath-suggest">
          <div className="breath-suggest-hd">
            <Icon name="auto_awesome" size={15} />
            <span>{suggestion.state ? `You logged “${suggestion.state}” today` : 'No check-in yet today'}</span>
          </div>
          <strong>Try {suggestion.preset.label}</strong>
          <p>{suggestion.why}</p>
          {/* A suggestion that carries a safety caution has to show it HERE,
              not only in the panel below: that panel describes whichever
              preset is selected, so recommending Wim Hof to a flat day would
              otherwise put "never do this in water" one click away from the
              person being told to try it. Suppressed only when the suggested
              preset is already the selected one, where the panel below is
              showing the same text a few centimetres down. */}
          {suggestion.preset.caution && suggestion.preset.id !== preset.id && (
            <p className="breath-caution">
              <Icon name="warning" size={14} />
              <span>{suggestion.preset.caution}</span>
            </p>
          )}
          {suggestion.preset.id !== preset.id && (
            <button className="btn btn-secondary btn-sm" onClick={() => selectPreset(suggestion.preset)}>
              <Icon name="play_arrow" size={14} /> Load it
            </button>
          )}
        </div>
      )}

      <div className="breath-presets">
        {BREATH_PRESETS.map((p) => (
          <button key={p.id} type="button"
            className={`breath-preset${p.id === preset.id ? ' active' : ''}`}
            onClick={() => selectPreset(p)}>
            <strong>{p.label}</strong>
            <span>{p.pattern} · {p.minutes} min</span>
            {suggestion?.preset.id === p.id && <em className="breath-preset-tag">Suggested</em>}
          </button>
        ))}
      </div>

      <PresetInfo preset={preset} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setMinutesPreset(2)}>2m</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setMinutesPreset(5)}>5m</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setMinutesPreset(10)}>10m</button>
        <button className="btn btn-primary" onClick={toggleTimer}>
          <Icon name={running ? 'pause' : 'play_arrow'} size={17} /> {running ? 'Pause' : 'Start'}
        </button>
        <button className="btn btn-secondary" onClick={resetTimer}>
          <Icon name="stop" size={17} /> Reset
        </button>
      </div>

      <div className="audio-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 800 }}>{track.label} Music</h2>
            <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{track.sub}</p>
          </div>
          <Icon name="music_note" size={18} style={{ color: 'var(--accent)' }} />
        </div>
        {MEDITATION_TRACKS.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {MEDITATION_TRACKS.map((t) => (
              <button key={t.id} type="button"
                className={`btn btn-sm ${t.id === trackId ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTrackId(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {/* key={track.id} forces a fresh <audio> element on switch instead of
            fiddling with .load() — a track change mid-session is rare enough
            that a clean reset (paused, from the top) is the right behavior. */}
        <audio ref={audioRef} key={track.id} controls loop preload="metadata" src={track.src} />
        <label className="audio-toggle">
          <input type="checkbox" checked={audioSync} onChange={(e) => setAudioSync(e.target.checked)} />
          Start and pause with timer
        </label>
      </div>

      {fullscreen && (
        <div className="meditation-fullscreen" ref={fsRef} style={{ '--breath-glow': glowRGB, '--breath-open': openness.toFixed(3) }}>
          {/* Slow-drifting blurred blobs, brightness tied to --breath-open so
              the whole room lightens as you inhale and dims as you exhale. */}
          <div className="fs-aura" aria-hidden="true"><i /><i /><i /></div>
          <button className="fs-exit" title="Exit full screen" onClick={() => setFullscreen(false)}>
            <Icon name="fullscreen_exit" size={24} />
          </button>
          <div className="fs-inner">
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>
              Meditation Timer
            </div>
            {face(true)}
          </div>
        </div>
      )}
    </div>
  )
}

/*
  What the selected pattern is for. Every field here is written and sourced
  under the rules in lib/practices.js — in particular `evidence` says how
  well-tested a pattern actually is, including when the answer is "this one
  is popular rather than tested," which is the whole reason that line exists
  rather than a row of confident benefit claims.

  `caution` deliberately does NOT use red or amber. Rule 3 of the design
  system reserves the status ramp for performance indicators, so a colour
  shift always means a number moved; borrowing red for a safety note would
  break that. It earns attention from the icon, the rule down its left edge
  and its position instead.
*/
function PresetInfo({ preset }) {
  const rate = breathsPerMinute(preset)
  return (
    <div className="breath-info">
      <div className="breath-info-hd">
        <strong>{preset.label}</strong>
        <span>{preset.pattern}{rate ? ` · ${rate.toFixed(1).replace(/\.0$/, '')} breaths/min` : ''}</span>
      </div>

      <ul className="breath-use">
        {preset.use.map((u) => <li key={u}>{u}</li>)}
      </ul>

      <p className="breath-how">{preset.how}</p>

      <p className="breath-evidence">
        <Icon name="science" size={13} />
        <span>{preset.evidence}</span>
      </p>

      {preset.caution && (
        <p className="breath-caution">
          <Icon name="warning" size={14} />
          <span>{preset.caution}</span>
        </p>
      )}

      <p className="breath-disclaimer">
        General wellness information, not medical advice. Breathing practice is
        not a treatment for a medical or psychiatric condition — if something
        feels wrong, stop and breathe normally.
      </p>
    </div>
  )
}

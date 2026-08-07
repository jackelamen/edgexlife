import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import { BREATH_PRESETS, cycleSeconds, phaseAt, MEDITATION_FADE_SECONDS, MEDITATION_AUDIO_SRC } from '../../lib/practices'
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
export default function BreathTimer({ onComplete }) {
  const [preset, setPreset] = useState(BREATH_PRESETS[0])
  const [duration, setDuration] = useState(preset.minutes * 60)
  const [remaining, setRemaining] = useState(preset.minutes * 60)
  const [running, setRunning] = useState(false)
  const [phaseLabel, setPhaseLabel] = useState('Ready')
  const [phaseView, setPhaseView] = useState({ scale: 0.12, color: BREATH_IN.hex, text: 'Ready', sub: 'ready' })
  const [fullscreen, setFullscreen] = useState(false)
  const [audioSync, setAudioSync] = useState(true)

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

  function clearAll() {
    clearInterval(timerRef.current); timerRef.current = null
    clearInterval(breathRef.current); breathRef.current = null
    clearInterval(introRef.current); introRef.current = null
    clearFade(true)
  }

  function clearFade(restoreVolume) {
    clearInterval(fadeRef.current); fadeRef.current = null
    fadeStartedRef.current = false
    if (restoreVolume && audioRef.current) audioRef.current.volume = 1
  }

  function applyBreathVisual(phase, progress) {
    const scale = phase.from + (phase.to - phase.from) * progress
    setPhaseView({
      scale, color: phase.key === 'out' ? BREATH_OUT.hex : BREATH_IN.hex,
      text: phase.label, sub: presetRef.current.pattern,
    })
    setPhaseLabel(phase.label)
  }

  function applyIntroVisual(text, sub) {
    setPhaseView({ scale: 0.12, color: BREATH_IN.hex, text, sub })
  }

  function updateBreathGuide() {
    if (!startedAtRef.current) { applyBreathVisual(presetRef.current.phases[0], 0); return }
    const elapsed = (Date.now() - startedAtRef.current) / 1000
    const { phase, progress } = phaseAt(presetRef.current, elapsed)
    applyBreathVisual(phase, progress)
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

  function startBreathGuide() {
    startedAtRef.current = Date.now()
    updateBreathGuide()
    clearInterval(breathRef.current)
    breathRef.current = setInterval(updateBreathGuide, 200)
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
    clearInterval(breathRef.current); breathRef.current = null
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
      clearInterval(breathRef.current); breathRef.current = null
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

  const face = (isFs) => (
    <div className="timer-face">
      {!isFs && (
        <button className="med-full-btn" title="Full screen" onClick={() => setFullscreen(true)}>
          <Icon name="fullscreen" size={20} />
        </button>
      )}
      <div className="breath-visual">
        <svg viewBox="0 0 156 156">
          <circle cx="78" cy="78" r="68" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7" />
          <circle className="breath-ring" cx="78" cy="78" r="68" fill="none" strokeWidth="7"
            strokeLinecap="round" style={{ stroke: phaseView.color }} />
        </svg>
        <div className="breath-orb" style={{
          transform: `scale(${phaseView.scale.toFixed(3)})`,
          background: phaseView.color === BREATH_OUT.hex ? `rgba(${BREATH_OUT.glow},.20)` : `rgba(${BREATH_IN.glow},.24)`,
          boxShadow: phaseView.color === BREATH_OUT.hex
            ? `0 0 28px rgba(${BREATH_OUT.glow},.16), inset 0 0 28px rgba(255,255,255,.08)`
            : `0 0 30px rgba(${BREATH_IN.glow},.18), inset 0 0 28px rgba(255,255,255,.10)`,
        }} />
        <div className="breath-count">
          <strong>{phaseView.text}</strong>
          <span>{phaseView.sub}</span>
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

      <div className="breath-presets">
        {BREATH_PRESETS.map((p) => (
          <button key={p.id} type="button"
            className={`breath-preset${p.id === preset.id ? ' active' : ''}`}
            onClick={() => selectPreset(p)}>
            <strong>{p.label}</strong>
            <span>{p.pattern} · {p.minutes} min</span>
          </button>
        ))}
      </div>

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
            <h2 style={{ fontSize: 13, fontWeight: 800 }}>Meditation Music</h2>
            <p style={{ fontSize: 12, color: 'var(--text-2)' }}>20 minute deep meditation track.</p>
          </div>
          <Icon name="music_note" size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <audio ref={audioRef} controls loop preload="metadata">
          <source src={MEDITATION_AUDIO_SRC} type="audio/mpeg" />
        </audio>
        <label className="audio-toggle">
          <input type="checkbox" checked={audioSync} onChange={(e) => setAudioSync(e.target.checked)} />
          Start and pause with timer
        </label>
      </div>

      {fullscreen && (
        <div className="meditation-fullscreen">
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

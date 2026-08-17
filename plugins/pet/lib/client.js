// harness-pet client half bundle (lazy CJS module via __ModuleLoader__).
window.__ModuleLoader__.load({
  id: 'harness-pet',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    const POS_KEY = 'dsh.pet.pos.v1'
    const HUNGER_KEY = 'dsh.pet.hunger.v1'
    const SCALE_KEY = 'dsh.pet.scale.v1'
    const PICK = (arr) => arr[Math.floor(Math.random() * arr.length)]

    const FW = 192
    const FH = 208
    const SHEET_W = 1536
    const SHEET_H = 1872
    const SPRITE_URL = '/pet-sprite.webp'
    const ROWS = {
      happy: { row: 0, frames: 6 },
      hungry: { row: 5, frames: 8 },
      eating: { row: 8, frames: 6 },
      runR: { row: 1, frames: 8 },
      runL: { row: 2, frames: 8 },
      jump: { row: 4, frames: 5 },
    }
    const HUNGRY_AT = 10
    const MIN_SCALE = 0.3
    const MAX_SCALE = 1
    // 饱食度消耗速率：100 点 8 小时消耗完 → 每秒 100/(8*3600) ≈ 0.00347 点
    const HUNGER_PER_SEC = 100 / (8 * 3600)

    function viewportSize() {
      try {
        const w = window.innerWidth
        const h = window.innerHeight
        if (typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0) return { w, h }
      } catch (e) {}
      return null
    }

    function initialPos() {
      // 重启/无保存位置时默认放在右下角（宠物尺寸 FW×FH，留 24px 边距）
      const vp = viewportSize()
      const fallback = vp ? { x: Math.max(0, vp.w - FW - 24), y: Math.max(0, vp.h - FH - 24) } : { x: 40, y: 60 }
      try {
        const raw = localStorage.getItem(POS_KEY)
        if (raw) {
          const p = JSON.parse(raw)
          if (typeof p.x === 'number' && typeof p.y === 'number') {
            if (vp) {
              if (p.x < -100 || p.y < -100 || p.x > vp.w - 60 || p.y > vp.h - 60) return fallback
            }
            return { x: p.x, y: p.y }
          }
        }
      } catch (e) {}
      return fallback
    }

    function PetApp(props) {
      const timer = props.timer
      const [pos, setPos] = React.useState(initialPos)
      const [scale, setScale] = React.useState(() => {
        try {
          const raw = localStorage.getItem(SCALE_KEY)
          if (raw) {
            const v = Number(raw)
            if (Number.isFinite(v)) return Math.max(MIN_SCALE, Math.min(MAX_SCALE, v))
          }
        } catch (e) {}
        return 0.5
      })
      const [hunger, setHunger] = React.useState(() => {
        try {
          const raw = localStorage.getItem(HUNGER_KEY)
          if (raw) {
            const s = JSON.parse(raw)
            if (typeof s.value === 'number' && typeof s.ts === 'number') {
              return Math.max(0, Math.min(100, s.value - ((Date.now() - s.ts) / 1000) * HUNGER_PER_SEC))
            }
          }
        } catch (e) {}
        return 80
      })
      const [menu, setMenu] = React.useState(false)
      const [bubble, setBubble] = React.useState(null)
      const [eating, setEating] = React.useState(null)
      const [anim, setAnim] = React.useState('idle')
      const dragRef = React.useRef(null)
      const spriteRef = React.useRef(null)
      const rootRef = React.useRef(null)
      const frameRef = React.useRef(0)
      const lastUpRef = React.useRef(0)
      const mood = eating ? 'eating' : hunger <= HUNGRY_AT ? 'hungry' : 'happy'
      const moodRef = React.useRef(mood)
      moodRef.current = mood
      const animRef = React.useRef(anim)
      animRef.current = anim
      const activeRow = () => {
        const a = animRef.current
        if (a === 'runR' || a === 'runL') return ROWS[a]
        if (a === 'jump') return ROWS.jump
        return ROWS[moodRef.current]
      }
      React.useEffect(() => {
        const el = rootRef.current
        if (!el) return
        const onWheel = (e) => {
          e.preventDefault()
          setScale((s) => {
            const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + (e.deltaY < 0 ? 0.1 : -0.1)))
            try {
              localStorage.setItem(SCALE_KEY, String(next))
            } catch (err) {}
            return next
          })
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
      }, [])
      React.useEffect(() => {
        const d = timer.interval(() => {
          const el = spriteRef.current
          if (!el) return
          const cfg = activeRow()
          frameRef.current = (frameRef.current + 1) % cfg.frames
          el.style.backgroundPosition = '-' + (frameRef.current * FW) + 'px -' + (cfg.row * FH) + 'px'
        }, 160)
        return () => d()
      }, [timer])
      React.useEffect(() => {
        frameRef.current = 0
        const el = spriteRef.current
        if (el) {
          const cfg = activeRow()
          el.style.backgroundPosition = '0px -' + (cfg.row * FH) + 'px'
        }
      }, [anim, mood])
      React.useEffect(() => {
        const d = timer.interval(() => {
          setHunger((h) => {
            const n = Math.max(0, h - HUNGER_PER_SEC * 5)
            if (n !== h) {
              try {
                localStorage.setItem(HUNGER_KEY, JSON.stringify({ value: n, ts: Date.now() }))
              } catch (e) {}
            }
            return n
          })
        }, 5000)
        return () => d()
      }, [timer])
      const say = (text) => {
        setBubble({ text })
        timer.timeout(() => setBubble((b) => (b && b.text === text ? null : b)), 2800)
      }
      const feed = (food, delta) => {
        setEating({ food, stage: 0 })
        setMenu(false)
        timer.timeout(() => setEating((e) => (e ? { ...e, stage: 1 } : e)), 450)
        timer.timeout(() => setEating((e) => (e ? { ...e, stage: 2 } : e)), 1000)
        timer.timeout(() => setEating(null), 1500)
        setHunger((h) => {
          const n = Math.min(100, h + delta)
          try {
            localStorage.setItem(HUNGER_KEY, JSON.stringify({ value: n, ts: Date.now() }))
          } catch (e) {}
          return n
        })
        say(PICK(['好吃！汪～', '满足！', '再来一份！']))
      }
      const pet = () => {
        setMenu(false)
        say(PICK(['汪呜～', '摸摸～', '好舒服！']))
      }
      const onDown = (e) => {
        if (e.button !== 0) return
        if (!(e.target && e.target.closest && e.target.closest('[data-pet-body]'))) return
        dragRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch (err) {}
      }
      const onMove = (e) => {
        const d = dragRef.current
        if (!d) return
        const dx = e.clientX - d.x
        const dy = e.clientY - d.y
        if (!d.moved && Math.abs(dx) + Math.abs(dy) > 5) {
          d.moved = true
          setAnim(dx >= 0 ? 'runR' : 'runL')
        }
        if (d.moved) {
          setPos({ x: d.px + dx, y: d.py + dy })
          const dir = dx >= 0 ? 'runR' : 'runL'
          if (animRef.current !== dir) setAnim(dir)
        }
      }
      const onUp = () => {
        const d = dragRef.current
        if (!d) return
        dragRef.current = null
        if (d.moved) {
          setAnim('idle')
          try {
            localStorage.setItem(POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }))
          } catch (e) {}
        } else {
          const now = Date.now()
          const isDouble = now - lastUpRef.current < 320
          lastUpRef.current = now
          if (isDouble) {
            setMenu(false)
            setAnim('jump')
            timer.timeout(() => setAnim('idle'), ROWS.jump.frames * 160 + 60)
            say(PICK(['嘿！', '哈！', '看我跳得多高！']))
          } else {
            setMenu((m) => {
              if (!m) {
                if (hunger <= HUNGRY_AT) say(PICK(['我饿了…', '肚肚咕咕叫…', '有吃的吗？']))
                else say(PICK(['汪～', '今天也要加油哦！', '剑在手，跟我走！', '盯着你的代码很久了…']))
              }
              return !m
            })
          }
        }
      }
      const foodAnim = eating
        ? {
            0: { dx: 20, dy: 4, scale: 1, opacity: 1 },
            1: { dx: -4, dy: 0, scale: 0.55, opacity: 1 },
            2: { dx: -4, dy: 0, scale: 0.3, opacity: 0 },
          }[eating.stage]
        : null
      const hungerBar = React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' } },
        React.createElement('span', null, '饱食度'),
        React.createElement('div', { style: { flex: 1, height: 6, borderRadius: 3, background: 'var(--dsw-alias-bg-module-platform)', overflow: 'hidden' } },
          React.createElement('div', { style: { height: '100%', width: hunger + '%', background: hunger <= HUNGRY_AT ? 'var(--dsw-alias-state-error-primary)' : hunger < 55 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)', transition: 'width .4s' } }),
        ),
        React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, Math.round(hunger)),
      )
      return React.createElement('div', {
        ref: rootRef,
        style: {
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 10000, pointerEvents: 'auto', userSelect: 'none',
          transform: 'scale(' + scale + ')', transformOrigin: '0 0',
        },
        onPointerDown: onDown,
        onPointerMove: onMove,
        onPointerUp: onUp,
      },
        menu ? React.createElement('div', {
          style: {
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', width: 170,
            background: 'var(--dsw-specific-menu)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,.14)',
            padding: 10, marginBottom: 8, fontSize: 13, color: 'var(--dsw-alias-label-primary)',
          },
        },
          React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 } }, hunger <= HUNGRY_AT ? '我饿了…' : '汪？想吃点啥？'),
          React.createElement('button', { onClick: () => feed('🍖', 25), style: { display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none', padding: '5px 6px', borderRadius: 6, fontSize: 13 } }, '🍖 喂肉骨头（+25）'),
          React.createElement('button', { onClick: () => feed('🥛', 20), style: { display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none', padding: '5px 6px', borderRadius: 6, fontSize: 13 } }, '🥛 喂牛奶（+20）'),
          React.createElement('button', { onClick: pet, style: { display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none', padding: '5px 6px', borderRadius: 6, fontSize: 13 } }, '💕 摸摸头'),
          hungerBar,
        ) : null,
        bubble ? React.createElement('div', {
          style: {
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
            background: 'var(--dsw-specific-menu)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, boxShadow: '0 3px 12px rgba(0,0,0,.1)',
            padding: '5px 10px', marginBottom: 6, fontSize: 12, color: 'var(--dsw-alias-label-primary)',
          },
        }, bubble.text) : null,
        React.createElement('div', { 'data-pet-body': 'true', style: { position: 'relative', width: FW, height: FH, cursor: dragRef.current ? 'grabbing' : 'grab' } },
          eating && foodAnim ? React.createElement('div', {
            style: {
              position: 'absolute', left: 116 + foodAnim.dx, top: 104 + foodAnim.dy, fontSize: 22, zIndex: 2,
              transform: 'scale(' + foodAnim.scale + ')', opacity: foodAnim.opacity, transition: 'all .45s ease-in',
              pointerEvents: 'none',
            },
          }, eating.food) : null,
          React.createElement('div', {
            ref: spriteRef,
            style: {
              width: FW, height: FH,
              backgroundImage: 'url(' + SPRITE_URL + ')',
              backgroundSize: SHEET_W + 'px ' + SHEET_H + 'px',
              backgroundPosition: '0px 0px',
              backgroundRepeat: 'no-repeat',
            },
          }),
        ),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      return slots.inject('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'harness-pet', order: 90 },
        () => React.createElement(PetApp, { timer: ctx.timer }),
      ))
    }

    exports.apply = apply
    exports.inject = ['timer']
    return module.exports
  },
})

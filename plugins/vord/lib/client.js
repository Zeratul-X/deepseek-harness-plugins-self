// harness-vord client half bundle: drag conversation view tabs to reorder.
window.__ModuleLoader__.load({
  id: 'harness-vord',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const VIEW_KEY = 'conversation.view'
    const STORE_KEY = 'dsh.view-order.v1'

    function resolveLabel(label) {
      if (typeof label === 'function') {
        try {
          const v = label()
          return typeof v === 'string' && v.length > 0 ? v : null
        } catch (e) {
          return null
        }
      }
      return typeof label === 'string' && label.length > 0 ? label : null
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      const reorder = (ids) => {
        const entries = slots.entries(VIEW_KEY)
        const byId = {}
        for (const e of entries) if (e.options.id) byId[e.options.id] = e
        const order = ids.filter((id) => byId[id])
        const rest = entries.map((e) => e.options.id).filter((id) => !order.includes(id))
        const all = [...order, ...rest]
        entries.length = 0
        for (const id of all) entries.push(byId[id])
        for (let i = 0; i < entries.length; i++) entries[i].options.order = i * 10
        const disposeTick = slots.register({ name: VIEW_KEY, id: '__order-tick', order: 1000000000, label: '·' }, () => null)
        disposeTick()
      }
      const applySaved = () => {
        try {
          const raw = localStorage.getItem(STORE_KEY)
          if (raw) {
            const ids = JSON.parse(raw)
            if (Array.isArray(ids) && ids.length > 0) reorder(ids)
          }
        } catch (e) {}
      }
      const disposers = []
      disposers.push(slots.inject(VIEW_KEY, () => {
        applySaved()
        return () => {}
      }))
      const drag = { active: false, moved: false, sx: 0, sy: 0, tab: null, tablist: null, map: {} }
      const labelMap = () => {
        const map = {}
        for (const e of slots.entries(VIEW_KEY)) {
          const label = resolveLabel(e.options.label)
          if (label) map[label.trim()] = e.options.id
        }
        return map
      }
      const onDown = (e) => {
        if (e.button !== 0) return
        const target = e.target && e.target.closest ? e.target.closest('button[role="tab"]') : null
        if (!target) return
        const tablist = target.parentElement
        if (!tablist || tablist.getAttribute('role') !== 'tablist') return
        drag.active = true
        drag.moved = false
        drag.sx = e.clientX
        drag.sy = e.clientY
        drag.tab = target
        drag.tablist = tablist
        drag.map = labelMap()
      }
      const onMove = (e) => {
        if (!drag.active) return
        if (!drag.moved) {
          if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return
          drag.moved = true
          drag.tab.style.opacity = '0.45'
          drag.tab.style.cursor = 'grabbing'
          try {
            e.preventDefault()
          } catch (err) {}
        }
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const target = el && el.closest ? el.closest('button[role="tab"]') : null
        if (!target || target === drag.tab) return
        const buttons = Array.from(drag.tablist.querySelectorAll('button[role="tab"]'))
        const ti = buttons.indexOf(target)
        const di = buttons.indexOf(drag.tab)
        if (ti < 0 || di < 0) return
        if (ti < di) drag.tablist.insertBefore(drag.tab, target)
        else drag.tablist.insertBefore(drag.tab, target.nextSibling)
      }
      const onUp = () => {
        if (!drag.active) return
        drag.active = false
        if (!drag.moved) return
        drag.moved = false
        drag.tab.style.opacity = ''
        drag.tab.style.cursor = ''
        const buttons = Array.from(drag.tablist.querySelectorAll('button[role="tab"]'))
        const ids = buttons.map((b) => drag.map[(b.textContent || '').trim()]).filter(Boolean)
        if (ids.length > 0) {
          reorder(ids)
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(ids))
          } catch (e) {}
        }
      }
      document.addEventListener('pointerdown', onDown, true)
      document.addEventListener('pointermove', onMove, true)
      document.addEventListener('pointerup', onUp, true)
      disposers.push(() => {
        document.removeEventListener('pointerdown', onDown, true)
        document.removeEventListener('pointermove', onMove, true)
        document.removeEventListener('pointerup', onUp, true)
      })
      return () => {
        for (const d of disposers) d()
      }
    }

    exports.apply = apply
    return module.exports
  },
})

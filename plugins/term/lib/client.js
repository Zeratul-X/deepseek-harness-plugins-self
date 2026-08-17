// harness-term client half bundle.
window.__ModuleLoader__.load({
  id: 'harness-term',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    function stripAnsi(s) {
      return String(s)
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b\[[0-9;]*[A-Za-z][^\x1b]*/g, '')
    }

    const STORES = {}
    const callApi = (body) =>
      fetch('/term-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())

    function nextInstName(sessionId) {
      const s = STORES[sessionId]
      return '终端 ' + ((s ? s.instances.length : 0) + 1)
    }

    function makeInst(sessionId) {
      return { id: 't' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: nextInstName(sessionId), blocks: [], running: null, input: '', cwd: '' }
    }

    function activeInst(state) {
      if (!state) return null
      for (const i of state.instances) if (i.id === state.activeId) return i
      return state.instances.length > 0 ? state.instances[0] : null
    }

    function TerminalView(props) {
      const sessionId = props.sessionId
      const timer = props.timer
      const [, force] = React.useState(0)
      const refresh = () => force((x) => x + 1)
      const state = STORES[sessionId] || (STORES[sessionId] = { instances: [], activeId: null })
      const scrollRef = React.useRef(null)
      React.useEffect(() => {
        if (state.instances.length === 0) {
          const inst = makeInst(sessionId)
          state.instances.push(inst)
          state.activeId = inst.id
          refresh()
        }
        callApi({ op: 'cwd', sessionId }).then(
          (d) => {
            if (d && d.cwd) {
              let changed = false
              for (const i of state.instances) if (!i.cwd) {
                i.cwd = d.cwd
                changed = true
              }
              if (changed) refresh()
            }
          },
          () => {},
        )
        const disposer = timer.interval(() => {
          const i = activeInst(state)
          if (!i || !i.running) return
          const block = i.blocks.find((b) => b.id === i.running)
          if (!block || !block.runId) return
          callApi({ op: 'poll', runId: block.runId }).then(
            (data) => {
              if (!data || data.gone) {
                block.running = false
                i.running = null
                refresh()
                return
              }
              if (data.stdout) block.stdout += data.stdout
              if (data.stderr) block.stderr += data.stderr
              if (data.done) {
                block.running = false
                block.code = data.code
                block.timedOut = data.timedOut
                i.running = null
              }
              refresh()
            },
            () => {},
          )
        }, 300)
        return () => disposer()
      }, [sessionId])
      React.useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
      const inst = activeInst(state)
      const runCmd = () => {
        const cmd = String(inst.input || '').trim()
        if (!cmd || inst.running) return
        const block = { id: 'b' + Date.now() + '-' + Math.floor(Math.random() * 1e6), command: cmd, stdout: '', stderr: '', running: true, code: null, runId: null, error: null }
        inst.blocks.push(block)
        inst.running = block.id
        inst.input = ''
        refresh()
        callApi({ op: 'start', sessionId, command: cmd }).then(
          (d) => {
            if (d && d.error) {
              block.running = false
              block.error = d.error
              inst.running = null
              refresh()
              return
            }
            block.runId = d.runId
            if (d.cwd) inst.cwd = d.cwd
            refresh()
          },
          (err) => {
            block.running = false
            block.error = String((err && err.message) || err)
            inst.running = null
            refresh()
          },
        )
      }
      const instTabs = []
      for (const i of state.instances) {
        const isActive = i.id === state.activeId
        instTabs.push(React.createElement('div', {
          key: i.id,
          style: {
            display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px 3px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
            background: isActive ? 'var(--dsw-alias-bg-layer-3)' : 'transparent', color: isActive ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
            border: '1px solid ' + (isActive ? 'var(--dsw-alias-border-l4)' : 'transparent'),
          },
          onClick: () => {
            state.activeId = i.id
            refresh()
          },
        },
          React.createElement('span', null, i.name),
          React.createElement('span', {
            style: { cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', padding: '0 2px', fontSize: 11 },
            onClick: (e) => {
              e.stopPropagation()
              const idx = state.instances.indexOf(i)
              state.instances = state.instances.filter((x) => x !== i)
              if (state.activeId === i.id) {
                const next = state.instances[Math.min(idx, state.instances.length - 1)]
                state.activeId = next ? next.id : null
              }
              if (state.instances.length === 0) {
                const n = makeInst(sessionId)
                state.instances.push(n)
                state.activeId = n.id
              }
              refresh()
            },
          }, '✕'),
        ))
      }
      const blocks = []
      if (inst) {
        for (const item of inst.blocks) {
          const lines = []
          lines.push(React.createElement('div', { key: 'p', style: { color: '#4ec9b0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } },
            'PS ' + (inst.cwd || '') + '> ' + item.command))
          if (item.error) {
            lines.push(React.createElement('div', { key: 'e', style: { color: 'var(--dsw-alias-state-error-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, item.error))
          } else {
            if (item.stdout && item.stdout.length > 0) {
              lines.push(React.createElement('div', { key: 'o', style: { color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, stripAnsi(item.stdout)))
            }
            if (item.stderr && item.stderr.length > 0) {
              lines.push(React.createElement('div', { key: 'r', style: { color: 'var(--dsw-alias-state-error-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }, stripAnsi(item.stderr)))
            }
            if (item.running) {
              lines.push(React.createElement('div', { key: 'run', style: { color: 'var(--dsw-alias-state-warn-primary)', fontSize: 11 } }, '运行中…'))
            } else {
              lines.push(React.createElement('div', { key: 'c', style: { color: item.code === 0 ? 'var(--dsw-alias-state-success-secondary)' : 'var(--dsw-alias-state-error-secondary)', fontSize: 11, marginTop: 2 } },
                '退出码 ' + (item.timedOut ? '超时终止' : item.code)))
            }
          }
          blocks.push(React.createElement('div', { key: item.id, style: { marginBottom: 10 } }, ...lines))
        }
      }
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', fontFamily: 'Consolas, monospace', fontSize: 12 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2)', overflowX: 'auto' } },
          ...instTabs,
          React.createElement('button', {
            onClick: () => {
              const n = makeInst(sessionId)
              state.instances.push(n)
              state.activeId = n.id
              refresh()
            },
            style: { cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)', fontSize: 14, lineHeight: 1, padding: '3px 8px' },
            title: '新增终端',
          }, '+'),
          React.createElement('span', { style: { marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: 11 } }, '运行中的命令不随 tab 切换丢失'),
        ),
        React.createElement('div', { ref: scrollRef, style: { flex: 1, overflowY: 'auto', padding: '8px 12px' } },
          !inst || inst.blocks.length === 0
            ? React.createElement('div', { style: { color: 'var(--dsw-alias-state-success-secondary)' } }, '就绪。在下方输入命令（如 yarn dev、git status、node -v）后回车执行。')
            : blocks,
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--dsw-alias-border-l2)' } },
          React.createElement('span', { style: { color: '#4ec9b0', whiteSpace: 'nowrap' } }, 'PS ' + (inst ? inst.cwd : '') + '>'),
          React.createElement('input', {
            value: inst ? inst.input : '',
            onChange: (e) => {
              inst.input = e.target.value
              refresh()
            },
            onKeyDown: (e) => {
              if (e.key === 'Enter') runCmd()
            },
            placeholder: inst && inst.running ? '执行中…' : '输入命令，回车执行',
            style: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--dsw-alias-label-primary)', fontFamily: 'inherit', fontSize: 12 },
          }),
        ),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      return slots.inject('conversation.view', () => slots.register(
        { name: 'conversation.view', id: 'term', order: 30, label: '终端' },
        (props) => React.createElement(TerminalView, { ...props, timer: ctx.timer }),
      ))
    }

    exports.apply = apply
    exports.inject = ['timer']
    return module.exports
  },
})

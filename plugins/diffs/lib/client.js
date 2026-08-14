// harness-diffs client half bundle.
window.__ModuleLoader__.load({
  id: 'harness-diffs',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    function lineDiff(oldText, newText) {
      const a = oldText == null ? [] : String(oldText).split('\n')
      const b = newText == null ? '' : String(newText).split('\n')
      const n = a.length
      const m = b.length
      const out = []
      if (n > 600 || m > 600) {
        for (const line of a) out.push({ t: 'del', text: line })
        for (const line of b) out.push({ t: 'add', text: line })
        return out
      }
      const dp = []
      for (let i = 0; i <= n; i++) dp.push(new Int32Array(m + 1))
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : (dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1])
        }
      }
      let i = 0
      let j = 0
      while (i < n && j < m) {
        if (a[i] === b[j]) {
          out.push({ t: 'ctx', text: a[i] })
          i++
          j++
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
          out.push({ t: 'del', text: a[i] })
          i++
        } else {
          out.push({ t: 'add', text: b[j] })
          j++
        }
      }
      while (i < n) {
        out.push({ t: 'del', text: a[i] })
        i++
      }
      while (j < m) {
        out.push({ t: 'add', text: b[j] })
        j++
      }
      return out
    }

    function fmtTime(t) {
      if (typeof t !== 'number' || !Number.isFinite(t)) return ''
      const d = new Date(t)
      const p = (x) => String(x).padStart(2, '0')
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    }

    function titleCase(name) {
      if (typeof name !== 'string' || name.length === 0) return 'tool'
      return name.charAt(0).toUpperCase() + name.slice(1)
    }

    function countStats(lines) {
      let add = 0
      let del = 0
      if (lines) {
        for (const ln of lines) {
          if (ln.t === 'add') add++
          else if (ln.t === 'del') del++
        }
      }
      return { add, del }
    }

    const stateColor = { M: '#e67e22', A: '#27ae60', D: '#c0392b', R: '#2980b9', '??': '#8e44ad' }
    const callApi = (body) =>
      fetch('/git-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())

    function GitSection(props) {
      const sessionId = props.sessionId
      const [git, setGit] = React.useState({ phase: 'loading' })
      const [open, setOpen] = React.useState({})
      const load = React.useCallback(() => {
        setGit({ phase: 'loading' })
        callApi({ sessionId }).then(
          (data) => setGit({ phase: 'done', data }),
          (err) => setGit({ phase: 'error', message: String((err && err.message) || err) }),
        )
      }, [sessionId])
      React.useEffect(() => {
        load()
      }, [load])
      const branch = git.phase === 'done' && git.data && git.data.branch ? git.data.branch : null
      const header = React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #eee' } },
        React.createElement('strong', { style: { fontSize: 13 } }, 'Git 工作区'),
        branch === null ? null : React.createElement('span', { style: { fontSize: 11, padding: '1px 8px', borderRadius: 10, background: '#eaf2f8', color: '#2471a3', fontWeight: 600, whiteSpace: 'nowrap' } },
          '分支 ' + branch),
        React.createElement('span', { style: { fontSize: 11, color: git.phase === 'loading' ? '#999' : git.phase === 'error' ? '#c0392b' : git.data && git.data.clean ? '#27ae60' : '#e67e22' } },
          git.phase === 'loading' ? '读取中…'
            : git.phase === 'error' ? '读取失败'
              : git.data.clean ? '✓ 工作区干净，无改动' : '有 ' + git.data.entries.length + ' 个文件改动'),
        React.createElement('button', {
          style: { marginLeft: 'auto', fontSize: 11, padding: '2px 8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fff' },
          onClick: load,
        }, '刷新'),
      )
      const body = []
      if (git.phase === 'loading') {
        body.push(React.createElement('div', { key: 'l', style: { padding: '12px 16px', color: '#999', fontSize: 12 } }, '正在读取 git 状态…'))
      } else if (git.phase === 'error') {
        body.push(React.createElement('div', { key: 'e', style: { padding: '12px 16px', color: '#c0392b', fontSize: 12, fontFamily: 'monospace' } }, git.message))
      } else if (!git.data.clean && git.data.entries.length > 0) {
        for (const entry of git.data.entries) {
          const isOpen = open[entry.path] === true
          const stats = countStats(entry.lines)
          const badge = React.createElement('span', {
            style: { fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3, color: '#fff', background: stateColor[entry.state] || '#7f8c8d', fontFamily: 'monospace' },
          }, entry.state)
          body.push(React.createElement('div', { key: entry.path, style: { borderBottom: '1px solid #f0f0f0' } },
            React.createElement('div', {
              style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer' },
              onClick: () => setOpen((prev) => ({ ...prev, [entry.path]: !isOpen })),
            },
              React.createElement('span', { style: { color: '#666', fontSize: 11, width: 12 } }, isOpen ? '▾' : '▸'),
              badge,
              React.createElement('span', { style: { fontSize: 12, fontFamily: 'monospace', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.path),
              entry.lines && entry.lines.length > 0
                ? React.createElement('span', { style: { fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', marginLeft: 'auto' } },
                    React.createElement('span', { style: { color: '#1e8449' } }, '+' + stats.add),
                    ' ',
                    React.createElement('span', { style: { color: '#c0392b' } }, '−' + stats.del),
                  )
                : null,
            ),
            isOpen && entry.lines && entry.lines.length > 0
              ? React.createElement('div', { style: { padding: '0 12px 8px 28px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55, overflowX: 'auto' } },
                  entry.lines.map((ln, idx) => React.createElement('div', {
                    key: idx,
                    style: ln.t === 'del'
                      ? { background: '#fdecea', color: '#c0392b', padding: '0 4px', whiteSpace: 'pre' }
                      : ln.t === 'add'
                        ? { background: '#eafaf1', color: '#1e8449', padding: '0 4px', whiteSpace: 'pre' }
                        : { color: '#666', padding: '0 4px', whiteSpace: 'pre' },
                  }, (ln.t === 'del' ? '- ' : ln.t === 'add' ? '+ ' : '  ') + ln.text)),
                )
              : null,
          ))
        }
      }
      return React.createElement('div', { style: { border: '1px solid #e5e5e5', borderRadius: 6, margin: 8, background: '#fff', overflow: 'hidden' } },
        header,
        ...body,
      )
    }

    function ChangesView(props) {
      const nodes = props.useSession((s) => s.nodes)
      const running = props.useSession((s) => s.runningCalls)
      const [open, setOpen] = React.useState({})
      const entries = []
      for (const node of nodes) {
        if (node.kind !== 'tool-result') continue
        const view = node.resultView || node.callView
        if (!view || view.card !== 'diff' || !view.diffs || view.diffs.length === 0) continue
        entries.push({ key: 'n' + node.seq, time: node.time, name: node.call ? node.call.name : 'tool', diffs: view.diffs })
      }
      for (const call of running) {
        const view = call.callView
        if (!view || view.card !== 'diff' || !view.diffs || view.diffs.length === 0) continue
        entries.push({ key: 'r' + call.callId, time: call.time, name: call.name, diffs: view.diffs, running: true })
      }
      entries.sort((a, b) => b.time - a.time)
      const items = []
      items.push(React.createElement(GitSection, { key: 'git', sessionId: props.sessionId }))
      items.push(React.createElement('div', { key: 'sess-head', style: { padding: '10px 12px 4px', fontSize: 13, fontWeight: 700 } },
        '会话改动',
        React.createElement('span', { style: { fontWeight: 400, fontSize: 11, color: '#999', marginLeft: 6 } }, entries.length + ' 条'),
      ))
      if (entries.length === 0) {
        items.push(React.createElement('div', { key: 'empty', style: { padding: '4px 12px 12px', color: '#888', fontSize: 12 } }, '本会话暂无文件改动'))
      }
      for (const entry of entries) {
        const isOpen = open[entry.key] === true
        const header = React.createElement(
          'div',
          {
            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', background: '#fafafa' },
            onClick: () => setOpen((prev) => ({ ...prev, [entry.key]: !isOpen })),
          },
          React.createElement('span', { style: { color: '#666', fontSize: 11, width: 12 } }, isOpen ? '▾' : '▸'),
          React.createElement('strong', { style: { fontSize: 12 } }, titleCase(entry.name)),
          React.createElement('span', { style: { color: '#999', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.diffs[0] ? entry.diffs[0].path : ''),
          entry.running ? React.createElement('span', { style: { color: '#e67e22', fontSize: 11 } }, '运行中') : null,
          React.createElement('span', { style: { color: '#bbb', fontSize: 11, marginLeft: 'auto', whiteSpace: 'nowrap' } }, fmtTime(entry.time)),
        )
        const body = []
        if (isOpen) {
          for (const diff of entry.diffs) {
            const lines = lineDiff(diff.oldText, diff.newText)
            body.push(React.createElement('div', { key: 'f' + diff.path, style: { padding: '2px 12px 8px' } },
              React.createElement('div', { style: { fontSize: 11, color: '#555', fontFamily: 'monospace', padding: '4px 0' } }, diff.path),
              React.createElement('div', { style: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.55, overflowX: 'auto' } },
                lines.map((ln, idx) => React.createElement('div', {
                  key: idx,
                  style: ln.t === 'del'
                    ? { background: '#fdecea', color: '#c0392b', padding: '0 4px', whiteSpace: 'pre' }
                    : ln.t === 'add'
                      ? { background: '#eafaf1', color: '#1e8449', padding: '0 4px', whiteSpace: 'pre' }
                      : { color: '#666', padding: '0 4px', whiteSpace: 'pre' },
                }, (ln.t === 'del' ? '- ' : ln.t === 'add' ? '+ ' : '  ') + ln.text)),
              ),
            ))
          }
        }
        items.push(React.createElement('div', { key: entry.key, style: { border: '1px solid #e5e5e5', borderRadius: 6, margin: 8, overflow: 'hidden', background: '#fff' } },
          header,
          ...(isOpen ? body : []),
        ))
      }
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' } }, items)
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      return slots.inject('conversation.view', () => slots.register(
        { name: 'conversation.view', id: 'changes', order: 20, label: '改动' },
        (props) => React.createElement(ChangesView, props),
      ))
    }

    exports.apply = apply
    return module.exports
  },
})

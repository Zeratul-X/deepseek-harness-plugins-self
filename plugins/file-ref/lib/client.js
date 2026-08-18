// harness-file-ref client half:
// 1) registers the '@' file reference source into the input-trigger pipeline —
//    typing @ in the composer opens a file picker scoped to the CURRENT
//    session's workspace (fuzzy substring filter); picking one inserts plain
//    text '@relative/path ' directly into the draft (NO chip, NO placeholder —
//    the input stays a normal textarea with normal caret behavior).
// 2) a reference dock above the composer scans the draft for '@token' refs and
//    shows each that resolves to a REAL file in the current workspace (async
//    /api/exists verification, cached); click opens the code preview overlay
//    with line selection (click a line number, Shift-click / drag for a range,
//    Ctrl+F to search); ✕ removes the token from the draft.
// 3) confirming in the preview rewrites that token in place to plain text
//    '@relative/path line <a>-<b>'.
window.__ModuleLoader__.load({
  id: 'harness-file-ref',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const react = require('react')

    const API = '/__file-ref/api/search'
    const READ_API = '/__file-ref/api/read'
    const EXISTS_API = '/__file-ref/api/exists'

    // 最近一次 @ 拉取所属的会话 id：搜索与预览读取都按会话归属的工作区定位。
    let activeSessionId = null

    // dock 引用校验缓存：path -> true/false；只展示当前工作区真实存在的文件引用，
    // 随手打的 @xxx 文本不会上 dock。
    const fileExistsCache = {}
    const fileExistsPending = {}
    function verifyFileToken(path, sessionId, cb) {
      if (path in fileExistsCache) { cb(fileExistsCache[path]); return }
      if (fileExistsPending[path]) return
      fileExistsPending[path] = true
      let qs = '?path=' + encodeURIComponent(path)
      if (sessionId) qs += '&session=' + encodeURIComponent(sessionId)
      fetch(EXISTS_API + qs)
        .then(function (res) { return res.json() })
        .then(function (data) {
          fileExistsCache[path] = !!(data && data.exists)
          delete fileExistsPending[path]
          cb(fileExistsCache[path])
        })
        .catch(function () {
          fileExistsCache[path] = false
          delete fileExistsPending[path]
          cb(false)
        })
    }

    function fetchFiles(query, signal, sessionId) {
      let qs = '?q=' + encodeURIComponent(query || '')
      if (sessionId) qs += '&session=' + encodeURIComponent(sessionId)
      return fetch(API + qs, { signal })
        .then(function (res) { return res.json() })
        .then(function (data) {
          if (!data.ok) return []
          return data.files || []
        })
    }

    const source = {
      trigger: '@',
      name: 'file',
      order: 1,
      async candidates(session, { query, signal }) {
        if (session && session.sessionId) activeSessionId = session.sessionId
        const files = await fetchFiles(query, signal, activeSessionId)
        if (signal.aborted) return []
        return files.map(function (file) {
          const parts = file.path.split('/')
          return {
            // 文件名放主位：官方菜单 name 最多显示 40% 且尾部省略，
            // 完整路径会被截掉文件名，所以主位只放短文件名。
            name: parts[parts.length - 1],
            description: file.path,
            _path: file.path
          }
        })
      },
      warm() {
        fetchFiles('', null).catch(function () {})
      },
      onPick({ candidate }) {
        // 纯文本插入（与官方 @subagent 相同的 outcome 形状：text 直接挂在
        // outcome 上，走 slash/input-insert-text）：直接写入 '@path '，
        // 不做 chip / 占位符 / dock，输入框就是普通文本，光标行为完全正常。
        // 注意：不能写成 { insert: { text } } —— 那会被 execute() 当作
        // reference 走 insert-reference，重新引入 \uFFFC 占位符。
        return {
          text: '@' + candidate._path + ' ',
        }
      }
    }

    // ---------- reference dock + preview overlay: '@token' click → line-range rewrite ----------

    const CSS = [
      // 引用 dock：输入框上方，扫描草稿里的 '@token' 展示（不依赖 chip 占位符），
      // 点击弹代码预览选行，✕ 移除草稿中的对应 token。
      '.fr-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto 6px;padding:0 var(--dsh-composer-dock-inset);display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
      '.fr-ref{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:2px 8px;font-size:12px;line-height:20px;cursor:pointer;font-family:Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.fr-ref:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);color:var(--dsw-alias-label-primary)}',
      '.fr-x{border:none;background:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0 3px;font-size:12px;line-height:16px;border-radius:4px;flex:none}',
      '.fr-x:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      // 预览浮层
      '.rs-mask{position:fixed;inset:0;z-index:99999;background:var(--dsw-alias-bg-mask-2);display:flex;align-items:center;justify-content:center}',
      '.rs-panel{width:min(720px,92vw);max-height:min(560px,86vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden}',
      '.rs-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.rs-title{font-size:13px;font-family:Consolas,monospace;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.rs-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);flex-shrink:0}',
      '.rs-close{margin-left:auto;border:none;background:none;color:var(--dsw-alias-label-secondary);font-size:14px;cursor:pointer;padding:2px 6px;border-radius:6px}',
      '.rs-close:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs-body{flex:1;overflow-y:auto;font-family:Consolas,monospace;font-size:12px;line-height:1.6;padding:6px 0;user-select:none}',
      '.rs-row{display:flex;align-items:stretch;cursor:default}',
      '.rs-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.rs-row.sel{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}',
      '.rs-ln{flex:none;width:3.2em;padding:0 8px 0 4px;text-align:right;color:var(--dsw-alias-label-caption);user-select:none;cursor:pointer;border-right:1px solid var(--dsw-alias-border-l1);margin-right:10px}',
      '.rs-ln.sel{color:var(--dsw-alias-state-business-primary);font-weight:700}',
      '.rs-code{white-space:pre;color:var(--dsw-alias-label-primary);padding-right:14px}',
      '.rs-foot{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.rs-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);flex:1}',
      '.rs-foot button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 14px;font-size:12px;cursor:pointer}',
      '.rs-foot button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '.rs-foot button:disabled{opacity:.5;cursor:not-allowed}',
      '.rs-ok{border-color:transparent!important;background:var(--dsw-alias-button-info-fill)!important;color:#fff!important}',
      // VSCode 风格行内搜索条（Ctrl+F）
      '.rs-search{display:none;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);flex:none}',
      '.rs-search.open{display:flex}',
      '.rs-search input{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 8px;font-size:12px;outline:none;font-family:inherit}',
      '.rs-search input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.rs-count{font-size:11px;color:var(--dsw-alias-label-tertiary);min-width:4em;text-align:center;flex:none}',
      '.rs-nav{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:1px 8px;font-size:12px;cursor:pointer;flex:none;line-height:18px}',
      '.rs-nav:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.rs-body mark{background:rgba(255,213,0,.32);color:inherit;border-radius:2px;padding:0}',
      '.rs-body mark.current{background:rgba(255,166,0,.55)}',
      '.rs-row.current-match{box-shadow:inset 3px 0 0 var(--dsw-alias-state-business-primary)}',
    ].join('')

    let styleEl = null
    let overlay = null
    let sel = { anchor: null, current: null, rows: [] }
    let dragging = false
    let search = { input: null, countEl: null, matches: [], index: -1, rows: [] }
    let searchTimer = null
    // 预览对应的输入框与 '@token' 跨度：确认后原位替换为 '@path line a-b'。
    let edit = { ta: null, start: -1, end: -1 }

    function ensureStyle() {
      if (styleEl) return
      styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /** '@token' 的路径：去掉前导 @ 与尾部标点（如 '@foo.ts，' → 'foo.ts'）。 */
    function tokenPath(token) {
      return String(token || '')
        .replace(/^@/, '')
        .replace(/[,.;:!?，。；：！？、)）\]】}》>]+$/, '')
    }

    /** Find the '@token' (token = '@' + non-space run) containing draft offset `off`. */
    function tokenAt(value, off) {
      if (!value || typeof off !== 'number' || off < 0 || off > value.length) return null
      const re = /@\S+/g
      let m
      while ((m = re.exec(value)) !== null) {
        if (off >= m.index && off <= m.index + m[0].length) {
          return { path: tokenPath(m[0]), start: m.index, end: m.index + m[0].length }
        }
      }
      return null
    }

    /** Re-scan the current draft for the first '@token' whose path equals `path`. */
    function findTokenInDraft(draft, path) {
      if (!draft) return null
      const re = /@\S+/g
      let m
      while ((m = re.exec(draft)) !== null) {
        if (tokenPath(m[0]) === path) {
          return { path, start: m.index, end: m.index + m[0].length }
        }
      }
      return null
    }

    /** Delete one '@token' span from the draft (plus one adjacent space). */
    function removeToken(ta, start, end) {
      if (!ta || start < 0 || end < start) return false
      const value = ta.value
      let s = start
      let e = end
      if (value[e] === ' ') e += 1
      else if (value[s - 1] === ' ') s -= 1
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, value.slice(0, s) + value.slice(e))
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
      try {
        ta.setSelectionRange(s, s)
      } catch (err) { /* noop */ }
      return true
    }

    /** Replace the recorded '@token' span in the textarea with plain text (native setter + input event). */
    function applyLineText(text) {
      const ta = edit.ta
      if (!ta || edit.start < 0 || edit.end < edit.start) return false
      const value = ta.value
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, value.slice(0, edit.start) + text + value.slice(edit.end))
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
      const caret = edit.start + text.length
      try {
        ta.setSelectionRange(caret, caret)
      } catch (e) { /* noop */ }
      return true
    }

    function closeOverlay() {
      closeSearch()
      if (overlay) {
        overlay.remove()
        overlay = null
      }
      sel = { anchor: null, current: null, rows: [] }
      dragging = false
      edit = { ta: null, start: -1, end: -1 }
    }

    function selRange() {
      if (sel.anchor === null || sel.current === null) return null
      return {
        lo: Math.min(sel.anchor, sel.current),
        hi: Math.max(sel.anchor, sel.current),
      }
    }

    function paintSelection() {
      const range = selRange()
      sel.rows.forEach(function (row, i) {
        const active = range !== null && i >= range.lo && i <= range.hi
        row.classList.toggle('sel', active)
        const ln = row.firstElementChild
        if (ln) ln.classList.toggle('sel', active)
      })
      const ok = overlay && overlay.querySelector('.rs-ok')
      if (ok) {
        ok.disabled = range === null
        ok.textContent = range === null ? '插入 line 引用' : '插入 line ' + (range.lo + 1) + '-' + (range.hi + 1)
      }
    }

    function rowIndexOf(el) {
      const row = el && el.closest ? el.closest('.rs-row') : null
      return row ? sel.rows.indexOf(row) : -1
    }

    function onOverlayDown(e) {
      if (e.target && e.target.closest && e.target.closest('.rs-ln')) {
        const idx = rowIndexOf(e.target)
        if (idx >= 0) {
          dragging = true
          if (e.shiftKey && sel.anchor !== null) sel.current = idx
          else {
            sel.anchor = idx
            sel.current = idx
          }
          paintSelection()
          e.preventDefault()
        }
      }
    }

    /** 松开鼠标结束拖拽；拖拽结束后 hover 不再扩展选择范围。 */
    function onDocUp() {
      dragging = false
    }

    function onDocMove(e) {
      if (!dragging || sel.anchor === null || !overlay) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const idx = rowIndexOf(el)
      if (idx >= 0 && idx !== sel.current) {
        sel.current = idx
        paintSelection()
      }
    }

    // ---------- VSCode 风格行内搜索（Ctrl+F） ----------

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      })
    }

    function escapeRegExp(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    function searchOpen() {
      return !!overlay && !!overlay.querySelector('.rs-search.open')
    }

    function updateCount() {
      search.countEl.textContent =
        search.matches.length === 0 ? '' : search.index + 1 + '/' + search.matches.length
    }

    /** 清除所有高亮与当前匹配，把每行还原为纯文本。 */
    function clearMarks() {
      search.matches = []
      search.index = -1
      search.rows.forEach(function (row) {
        row.classList.remove('current-match')
        const code = row.querySelector('.rs-code')
        if (code) code.textContent = code.textContent
      })
      updateCount()
    }

    /** 按输入词重建每行高亮并收集所有匹配；匹配时跳到第一个。 */
    function runSearch() {
      const q = search.input.value
      if (q === '') {
        clearMarks()
        return
      }
      const pattern = escapeRegExp(q)
      search.matches = []
      search.rows.forEach(function (row) {
        const code = row.querySelector('.rs-code')
        const text = code.textContent
        const re = new RegExp(pattern, 'gi')
        let html = ''
        let last = 0
        let m
        while ((m = re.exec(text)) !== null) {
          if (m.index === re.lastIndex) re.lastIndex++
          html += escapeHtml(text.slice(last, m.index))
          html += '<mark data-offset="' + m.index + '">' + escapeHtml(m[0]) + '</mark>'
          search.matches.push({ row: row, offset: m.index })
          last = m.index + m[0].length
        }
        html += escapeHtml(text.slice(last))
        code.innerHTML = html
      })
      search.index = -1
      if (search.matches.length > 0) jumpToMatch(1)
      else search.countEl.textContent = '0/0'
    }

    /** 循环跳转到下一个/上一个匹配，滚动定位并标记当前匹配。 */
    function jumpToMatch(dir) {
      if (search.matches.length === 0) return
      const old = search.matches[search.index]
      if (old) {
        const oldMark = old.row.querySelector('mark.current')
        if (oldMark) oldMark.classList.remove('current')
        old.row.classList.remove('current-match')
      }
      search.index = (search.index + dir + search.matches.length) % search.matches.length
      const match = search.matches[search.index]
      const marks = match.row.querySelectorAll('mark')
      for (let i = 0; i < marks.length; i++) {
        if (Number(marks[i].getAttribute('data-offset')) === match.offset) {
          marks[i].classList.add('current')
          break
        }
      }
      match.row.classList.add('current-match')
      match.row.scrollIntoView({ block: 'center' })
      updateCount()
    }

    /** 显示搜索条并聚焦（Ctrl+F）。 */
    function openSearch() {
      if (!overlay) return
      const bar = overlay.querySelector('.rs-search')
      if (!bar) return
      bar.classList.add('open')
      search.input.focus()
      search.input.select()
    }

    /** 隐藏搜索条并清除高亮（Esc / ✕）。 */
    function closeSearch() {
      const bar = overlay && overlay.querySelector('.rs-search')
      if (bar) bar.classList.remove('open')
      clearMarks()
    }

    function onKeyDown(e) {
      // 浮层关闭后监听仍挂在 document 上（直到被替换/卸载），
      // 必须先判 overlay，否则 Ctrl+F 会被永久劫持。
      if (!overlay) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openSearch()
        return
      }
      if (e.key === 'Escape') {
        if (searchOpen()) closeSearch()
        else closeOverlay()
        return
      }
      if (searchOpen() && e.key === 'Enter') {
        e.preventDefault()
        jumpToMatch(e.shiftKey ? -1 : 1)
      }
    }

    function fetchRead(path, sessionId) {
      let qs = '?path=' + encodeURIComponent(path)
      if (sessionId) qs += '&session=' + encodeURIComponent(sessionId)
      return fetch(READ_API + qs).then(function (res) { return res.json() })
    }

    /** Build and show the overlay with already-fetched file data. */
    function showOverlay(path, ta, token, data) {
      if (overlay) closeOverlay()
      edit = { ta: ta || null, start: token ? token.start : -1, end: token ? token.end : -1 }
      const mask = document.createElement('div')
      mask.className = 'rs-mask'
      mask.innerHTML =
        '<div class="rs-panel">' +
        '<div class="rs-head"><span class="rs-title"></span><span class="rs-meta"></span>' +
        '<button class="rs-close" title="关闭">✕</button></div>' +
        '<div class="rs-search">' +
        '<input type="text" placeholder="查找（Ctrl+F）" spellcheck="false">' +
        '<span class="rs-count"></span>' +
        '<button class="rs-nav" data-fr-prev title="上一个（Shift+Enter）">↑</button>' +
        '<button class="rs-nav" data-fr-next title="下一个（Enter）">↓</button>' +
        '<button class="rs-close" title="关闭搜索">✕</button>' +
        '</div>' +
        '<div class="rs-body"></div>' +
        '<div class="rs-foot"><span class="rs-hint">点击行号选行，Shift 点击 / 拖拽连选 · Ctrl+F 搜索</span>' +
        '<button class="rs-cancel">取消</button><button class="rs-ok" disabled>插入 line 引用</button></div>' +
        '</div>'
      const title = mask.querySelector('.rs-title')
      const meta = mask.querySelector('.rs-meta')
      const body = mask.querySelector('.rs-body')
      const closeBtn = mask.querySelector('.rs-head .rs-close')
      const cancelBtn = mask.querySelector('.rs-cancel')
      const okBtn = mask.querySelector('.rs-ok')
      const searchBar = mask.querySelector('.rs-search')
      search.input = searchBar.querySelector('input')
      search.countEl = searchBar.querySelector('.rs-count')
      searchBar.querySelector('[data-fr-prev]').onclick = function () { jumpToMatch(-1) }
      searchBar.querySelector('[data-fr-next]').onclick = function () { jumpToMatch(1) }
      searchBar.querySelector('.rs-close').onclick = closeSearch
      search.input.addEventListener('input', function () {
        clearTimeout(searchTimer)
        searchTimer = setTimeout(runSearch, 120)
      })
      title.textContent = '@' + path
      meta.textContent = (data.workspace || '') + (data.truncated ? ' · 已截断' : '') + ' · ' + data.lines.length + ' 行'
      mask.addEventListener('mousedown', function (e) {
        if (e.target === mask) closeOverlay()
      })
      closeBtn.onclick = closeOverlay
      cancelBtn.onclick = closeOverlay
      okBtn.onclick = function () {
        const range = selRange()
        if (!range) return
        const text = '@' + path + ' line ' + (range.lo + 1) + '-' + (range.hi + 1)
        applyLineText(text)
        closeOverlay()
      }
      const rows = []
      data.lines.forEach(function (line, i) {
        const row = document.createElement('div')
        row.className = 'rs-row'
        const ln = document.createElement('span')
        ln.className = 'rs-ln'
        ln.textContent = String(i + 1)
        const code = document.createElement('span')
        code.className = 'rs-code'
        code.textContent = line
        row.appendChild(ln)
        row.appendChild(code)
        body.appendChild(row)
        rows.push(row)
      })
      sel.rows = rows
      search.rows = rows
      document.body.appendChild(mask)
      overlay = mask
      body.addEventListener('mousedown', onOverlayDown)
      document.addEventListener('mousemove', onDocMove, true)
      document.addEventListener('mouseup', onDocUp, true)
      document.addEventListener('keydown', onKeyDown, true)
    }

    /** Open the preview for one '@path' token: verify the file exists first (silent no-op otherwise). */
    function openPreviewForPath(path, ta, token, sessionId) {
      if (!path) return
      fetchRead(path, sessionId)
        .then(function (data) {
          if (data && data.ok) return data
          // 会话归属解析失败时回退全工作区再试一次
          if (sessionId) return fetchRead(path, null)
          return null
        })
        .then(function (data) {
          if (!data || !data.ok) return
          showOverlay(path, ta, token, data)
        })
        .catch(function () {})
    }

    /** Click in the composer textarea: if the caret sits on an '@path' token, open its preview. */
    function onDocClick(e) {
      if (overlay) return
      const ta = e.target
      if (!ta || ta.tagName !== 'TEXTAREA' || !ta.hasAttribute('data-phase')) return
      const token = tokenAt(ta.value, ta.selectionStart)
      if (!token) return
      openPreviewForPath(token.path, ta, token, activeSessionId)
    }

    /** The reference dock: scans the draft for '@token' refs and shows each that
     * resolves to a real file in the current workspace; click opens the preview,
     * ✕ removes the token from the draft. */
    function FileRefDock(props) {
      const input = props.input
      const draft = (input && input.draft) || ''
      const sessionId = (props.session && props.session.sessionId) || activeSessionId
      const tokens = []
      const re = /@\S+/g
      let m
      while ((m = re.exec(draft)) !== null) {
        tokens.push({ path: tokenPath(m[0]), start: m.index, end: m.index + m[0].length })
      }
      const [refresh, setRefresh] = react.useState(0)
      react.useEffect(function () {
        tokens.forEach(function (token) {
          if (!(token.path in fileExistsCache)) {
            verifyFileToken(token.path, sessionId, function () { setRefresh(function (n) { return n + 1 }) })
          }
        })
      }, [draft, sessionId, refresh])
      const visible = tokens.filter(function (token) { return fileExistsCache[token.path] === true })
      if (visible.length === 0) return null
      const items = visible.map(function (token, i) {
        const label = '@' + token.path
        return react.createElement(
          'span',
          {
            key: token.start + '-' + i,
            className: 'fr-ref',
            title: label,
            onClick: function (e) {
              e.stopPropagation()
              const seat = e.currentTarget.closest('[data-composer-seat]')
              const ta = seat ? seat.querySelector('textarea[data-phase]') : null
              if (!ta) return
              // 按当前草稿重新定位 token，避免渲染与点击之间草稿漂移
              const fresh = findTokenInDraft(ta.value, token.path)
              if (!fresh) return
              openPreviewForPath(fresh.path, ta, fresh, sessionId)
            }
          },
          label,
          react.createElement('button', {
            type: 'button',
            className: 'fr-x',
            title: '移除引用',
            onClick: function (e) {
              e.stopPropagation()
              const seat = e.currentTarget.closest('[data-composer-seat]')
              const ta = seat ? seat.querySelector('textarea[data-phase]') : null
              if (!ta) return
              const fresh = findTokenInDraft(ta.value, token.path)
              if (!fresh) return
              removeToken(ta, fresh.start, fresh.end)
            }
          }, '✕')
        )
      })
      return react.createElement('div', { className: 'fr-dock', 'data-fr-dock': true }, items)
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots !== undefined) {
        ctx.effect(function () {
          return slots.inject('conversation.input.dock', function () {
            return slots.register({
              name: 'conversation.input.dock',
              id: 'file-refs',
              order: 1
            }, FileRefDock)
          })
        }, 'harness-file-ref: reference dock')
      }
      const inputTriggers = ctx.get('inputTriggers')
      if (inputTriggers === undefined) {
        console.error('[harness-file-ref] inputTriggers service unavailable')
        return
      }
      ensureStyle()
      document.addEventListener('click', onDocClick, true)
      ctx.effect(() => inputTriggers.registerSource(source), 'harness-file-ref: @ file source')
      return function () {
        closeOverlay()
        document.removeEventListener('click', onDocClick, true)
        document.removeEventListener('mousemove', onDocMove, true)
        document.removeEventListener('mouseup', onDocUp, true)
        document.removeEventListener('keydown', onKeyDown, true)
      }
    }

    exports.source = source
    exports.apply = apply
    exports.inject = ['inputTriggers', 'slots']
    return module.exports
  }
})

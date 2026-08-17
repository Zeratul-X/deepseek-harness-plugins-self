// harness-file-ref client half:
// 1) registers the '@' file reference source into the input-trigger pipeline —
//    typing @ in the composer opens a workspace file picker (fuzzy substring
//    filter), picking one inserts '@relative/path'.
// 2) clicking the '@path' chip in the composer opens a file preview overlay
//    with line selection; confirming rewrites the chip into
//    '@relative/path line <a>-<b>' in the draft.
window.__ModuleLoader__.load({
  id: 'harness-file-ref',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const API = '/__file-ref/api/search'
    const READ_API = '/__file-ref/api/read'

    function fetchFiles(query, signal) {
      return fetch(API + '?q=' + encodeURIComponent(query || ''), { signal })
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
        const files = await fetchFiles(query, signal)
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
        return { text: '@' + candidate._path + ' ' }
      },
      codec: {
        clipboardText: (ref) => '@' + ref,
        serialize: (ref) => Promise.resolve('@' + ref)
      }
    }

    // ---------- chip → preview → line-range rewrite ----------

    const CSS = [
      // @文件引用 chip：背景色块 + padding 上下 4px 左右 12px；
      // backdrop 装饰层默认 pointer-events:none（点击穿透到输入框），这里恢复点击
      '[data-decoration="chip"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);padding:4px 12px;border-radius:6px;pointer-events:auto;cursor:pointer}',
      '[data-decoration="chip"]:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 20%,transparent)}',
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
    ].join('')

    let styleEl = null
    let overlay = null
    let sel = { anchor: null, current: null, rows: [] }
    let chipEl = null

    function ensureStyle() {
      if (styleEl) return
      styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /** Rebuild the chip's offset in the draft by walking the backdrop children (DOM order == draft order). */
    function chipOffset(el) {
      const backdrop = el.closest('[data-input-backdrop]')
      if (!backdrop) return -1
      let off = 0
      const nodes = backdrop.childNodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        if (node === el) return off
        if (node.nodeType === 3) {
          off += node.textContent.length
        } else if (node.nodeType === 1) {
          if (node.getAttribute && node.getAttribute('data-decoration') === 'chip') off += 1
          else off += (node.textContent || '').length
        }
      }
      return -1
    }

    function chipLabel(el) {
      const label = el.querySelector('.chipLabel, [class*="chipLabel"]')
      return (label && label.textContent) || el.getAttribute('title') || ''
    }

    function applyLineRef(text) {
      const backdrop = chipEl && chipEl.closest('[data-input-backdrop]')
      const ta = backdrop && backdrop.parentElement
        ? backdrop.parentElement.querySelector('textarea')
        : document.querySelector('textarea[data-phase]')
      if (!ta || !chipEl) return false
      const off = chipOffset(chipEl)
      const value = ta.value
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      let next
      if (off >= 0 && value[off] === '\uFFFC') {
        // 占位符原位替换为 '@path line a-b'（后面原有的空格保留）
        next = value.slice(0, off) + text + value.slice(off + 1)
      } else {
        // 占位符已被其他操作改写：退化为在末尾追加
        next = value.length ? value.replace(/\s+$/, '') + ' ' + text : text
      }
      setter.call(ta, next)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
      return true
    }

    function closeOverlay() {
      if (overlay) {
        overlay.remove()
        overlay = null
      }
      sel = { anchor: null, current: null, rows: [] }
      chipEl = null
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

    function onDocMove(e) {
      if (sel.anchor === null || !overlay) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const idx = rowIndexOf(el)
      if (idx >= 0 && idx !== sel.current) {
        sel.current = idx
        paintSelection()
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') closeOverlay()
    }

    function openPreview() {
      if (!chipEl) return
      const label = chipLabel(chipEl)
      const path = String(label || '').replace(/^@/, '')
      if (!path) return
      const mask = document.createElement('div')
      mask.className = 'rs-mask'
      mask.innerHTML =
        '<div class="rs-panel">' +
        '<div class="rs-head"><span class="rs-title"></span><span class="rs-meta"></span>' +
        '<button class="rs-close" title="关闭">✕</button></div>' +
        '<div class="rs-body"></div>' +
        '<div class="rs-foot"><span class="rs-hint">点击行号选行，Shift 点击 / 拖拽连选</span>' +
        '<button class="rs-cancel">取消</button><button class="rs-ok" disabled>插入 line 引用</button></div>' +
        '</div>'
      const title = mask.querySelector('.rs-title')
      const meta = mask.querySelector('.rs-meta')
      const body = mask.querySelector('.rs-body')
      const closeBtn = mask.querySelector('.rs-close')
      const cancelBtn = mask.querySelector('.rs-cancel')
      const okBtn = mask.querySelector('.rs-ok')
      title.textContent = '@' + path
      meta.textContent = '读取中…'
      mask.addEventListener('mousedown', function (e) {
        if (e.target === mask) closeOverlay()
      })
      closeBtn.onclick = closeOverlay
      cancelBtn.onclick = closeOverlay
      okBtn.onclick = function () {
        const range = selRange()
        if (!range) return
        const text = '@' + path + ' line ' + (range.lo + 1) + '-' + (range.hi + 1)
        applyLineRef(text)
        closeOverlay()
      }
      document.body.appendChild(mask)
      overlay = mask
      body.addEventListener('mousedown', onOverlayDown)
      document.addEventListener('mousemove', onDocMove, true)
      document.addEventListener('keydown', onKeyDown, true)

      fetch(READ_API + '?path=' + encodeURIComponent(path))
        .then(function (res) { return res.json() })
        .then(function (data) {
          if (!data.ok) {
            meta.textContent = '读取失败: ' + (data.error || 'unknown')
            return
          }
          meta.textContent = (data.workspace || '') + (data.truncated ? ' · 已截断' : '') + ' · ' + data.lines.length + ' 行'
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
        })
        .catch(function (err) {
          meta.textContent = '读取失败: ' + String((err && err.message) || err)
        })
    }

    function onDocClick(e) {
      const el = e.target && e.target.closest ? e.target.closest('[data-decoration="chip"]') : null
      if (!el) return
      if (overlay) return
      chipEl = el
      openPreview()
    }

    function apply(ctx) {
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
        document.removeEventListener('keydown', onKeyDown, true)
      }
    }

    exports.source = source
    exports.apply = apply
    exports.inject = ['inputTriggers']
    return module.exports
  }
})

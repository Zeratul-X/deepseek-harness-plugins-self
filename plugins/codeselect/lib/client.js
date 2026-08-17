// harness-codeselect client half: line-level selection for message code blocks.
// 在会话消息的代码块上提供行选择：悬停/点击左侧行号选中整行，
// Shift+点击或拖拽连选，选中后浮出工具条：复制选中 / 插入输入框。
window.__ModuleLoader__.load({
  id: 'harness-codeselect',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const CSS = [
      '.cs-codeselect-root{position:relative}',
      '.cs-codeselect-ln{display:inline-block;min-width:2em;padding-right:.5em;margin-right:.5em;text-align:right;color:var(--dsw-alias-label-caption);user-select:none;cursor:pointer;font-style:normal}',
      '.cs-codeselect-ln:hover{color:var(--dsw-alias-label-primary)}',
      '.cs-codeselect-sel-ln{color:var(--dsw-alias-state-business-primary);font-weight:700}',
      '.cs-codeselect-sel-line{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}',
      '.cs-codeselect-bar{position:absolute;right:10px;bottom:10px;z-index:6;display:flex;gap:6px;padding:4px;background:var(--dsw-specific-menu);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18)}',
      '.cs-codeselect-bar button{border:none;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;white-space:nowrap}',
      '.cs-codeselect-bar button:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
    ].join('')

    var states = new WeakMap()
    var preMos = new WeakMap()
    var drag = null
    var preTimer = 0

    function syncLines(st) {
      var pre = st.pre
      var old = pre.querySelectorAll('.cs-codeselect-ln')
      for (var k = 0; k < old.length; k++) old[k].remove()
      var lines = Array.prototype.slice.call(pre.querySelectorAll('span.line'))
      lines.forEach(function (line, i) {
        var ln = document.createElement('span')
        ln.className = 'cs-codeselect-ln'
        ln.textContent = String(i + 1)
        ln.title = '选择第 ' + (i + 1) + ' 行（Shift 连选）'
        line.parentNode.insertBefore(ln, line)
      })
      st.lines = lines
      st.anchor = null
      st.current = null
    }

    function ensureBar(block) {
      var bar = block.querySelector(':scope > .cs-codeselect-bar')
      if (bar) return bar
      bar = document.createElement('div')
      bar.className = 'cs-codeselect-bar'
      bar.style.display = 'none'
      var copy = document.createElement('button')
      copy.className = 'cs-codeselect-copy'
      copy.onclick = function () {
        copySel(block)
        clearSel(block)
      }
      var send = document.createElement('button')
      send.className = 'cs-codeselect-send'
      send.textContent = '插入输入框'
      send.onclick = function () {
        insertSel(block)
        clearSel(block)
      }
      bar.appendChild(copy)
      bar.appendChild(send)
      block.appendChild(bar)
      return bar
    }

    function selText(st) {
      if (!st || st.anchor === null || st.current === null) return ''
      var lo = Math.min(st.anchor, st.current)
      var hi = Math.max(st.anchor, st.current)
      return st.lines
        .slice(lo, hi + 1)
        .map(function (l) { return l.textContent.replace(/\n$/, '') })
        .join('\n')
    }

    function applySel(block, st) {
      var lo = Math.min(st.anchor, st.current)
      var hi = Math.max(st.anchor, st.current)
      st.lines.forEach(function (line, i) {
        var sel = i >= lo && i <= hi
        line.classList.toggle('cs-codeselect-sel-line', sel)
        var ln = line.previousElementSibling
        if (ln && ln.classList && ln.classList.contains('cs-codeselect-ln')) {
          ln.classList.toggle('cs-codeselect-sel-ln', sel)
        }
      })
      var bar = ensureBar(block)
      bar.querySelector('.cs-codeselect-copy').textContent = '复制选中（' + (hi - lo + 1) + ' 行）'
      bar.style.display = 'flex'
    }

    function clearSel(block) {
      var st = states.get(block)
      if (!st) return
      st.anchor = null
      st.current = null
      st.lines.forEach(function (line) {
        line.classList.remove('cs-codeselect-sel-line')
        var ln = line.previousElementSibling
        if (ln && ln.classList && ln.classList.contains('cs-codeselect-ln')) {
          ln.classList.remove('cs-codeselect-sel-ln')
        }
      })
      var bar = block.querySelector(':scope > .cs-codeselect-bar')
      if (bar) bar.style.display = 'none'
    }

    function legacyCopy(text) {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch (e) {}
      ta.remove()
    }

    function copySel(block) {
      var text = selText(states.get(block))
      if (!text) return
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { legacyCopy(text) })
      } else {
        legacyCopy(text)
      }
    }

    function insertSel(block) {
      var text = selText(states.get(block))
      if (!text) return
      var ta = document.querySelector('textarea[data-phase]')
      if (!ta) return
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      var next = ta.value.length ? ta.value.replace(/\s+$/, '') + '\n\n' + text : text
      setter.call(ta, next)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.focus()
    }

    function initBlock(block) {
      if (states.has(block)) return
      var pre = block.querySelector('pre')
      if (!pre) return
      if (!pre.querySelector('span.line')) return // 无高亮行的纯文本块：不做行选择
      var st = { pre: pre, lines: [], anchor: null, current: null }
      states.set(block, st)
      syncLines(st)
      block.classList.add('cs-codeselect-root')
      // 代码块内容被重新渲染（流式输出/更新）时重建行号
      var preMo = new MutationObserver(function () {
        clearTimeout(preTimer)
        preTimer = setTimeout(function () {
          syncLines(st)
          var bar = block.querySelector(':scope > .cs-codeselect-bar')
          if (bar) bar.style.display = 'none'
        }, 250)
      })
      preMo.observe(pre, { childList: true, subtree: true })
      preMos.set(block, preMo)
    }

    function scan(node) {
      if (!node || node.nodeType !== 1) return
      var blocks = node.classList && node.classList.contains('md-code-block')
        ? [node]
        : node.querySelectorAll ? Array.prototype.slice.call(node.querySelectorAll('.md-code-block')) : []
      blocks.forEach(initBlock)
    }

    function onDocDown(e) {
      var lnEl = e.target && e.target.closest ? e.target.closest('.cs-codeselect-ln') : null
      if (!lnEl) {
        // 点击代码块外部：清除当前选择
        for (var blk of states.keys()) {
          var st = states.get(blk)
          if (st.anchor !== null && !blk.contains(e.target)) clearSel(blk)
        }
        return
      }
      var block = lnEl.closest('.md-code-block')
      var st = block && states.get(block)
      if (!st) return
      var idx = st.lines.indexOf(lnEl.nextElementSibling)
      if (idx < 0) return
      if (e.shiftKey && st.anchor !== null) {
        st.current = idx
      } else {
        st.anchor = idx
        st.current = idx
      }
      drag = { block: block, st: st }
      e.preventDefault() // 行号区 user-select:none，防止原生选择干扰
      applySel(block, st)
    }

    function onDocMove(e) {
      if (!drag) return
      var el = document.elementFromPoint(e.clientX, e.clientY)
      var hit = el && el.closest
        ? el.closest('.cs-codeselect-ln') || el.closest('span.line')
        : null
      if (!hit) return
      var st = drag.st
      var idx = hit.classList.contains('cs-codeselect-ln')
        ? st.lines.indexOf(hit.nextElementSibling)
        : st.lines.indexOf(hit)
      if (idx >= 0) {
        st.current = idx
        applySel(drag.block, st)
      }
    }

    function onDocUp() {
      drag = null
    }

    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes
        for (var j = 0; j < added.length; j++) scan(added[j])
      }
    })

    function apply(ctx) {
      var style = document.createElement('style')
      style.textContent = CSS
      document.head.appendChild(style)
      scan(document.body)
      mo.observe(document.body, { childList: true, subtree: true })
      document.addEventListener('mousedown', onDocDown, true)
      document.addEventListener('mousemove', onDocMove, true)
      document.addEventListener('mouseup', onDocUp, true)
      return function () {
        style.remove()
        mo.disconnect()
        for (var m of preMos.values()) m.disconnect()
        preMos = new WeakMap()
        states = new WeakMap()
        document.removeEventListener('mousedown', onDocDown, true)
        document.removeEventListener('mousemove', onDocMove, true)
        document.removeEventListener('mouseup', onDocUp, true)
      }
    }

    exports.apply = apply
    return module.exports
  },
})

// harness-file-ref client half: registers the '@' file reference source into
// the input-trigger pipeline — typing @ in the composer opens a workspace
// file picker (fuzzy substring filter), picking one inserts '@relative/path'.
window.__ModuleLoader__.load({
  id: 'harness-file-ref',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const API = '/__file-ref/api/search'

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

    function apply(ctx) {
      const inputTriggers = ctx.get('inputTriggers')
      if (inputTriggers === undefined) {
        console.error('[harness-file-ref] inputTriggers service unavailable')
        return
      }
      ctx.effect(() => inputTriggers.registerSource(source), 'harness-file-ref: @ file source')
    }

    exports.source = source
    exports.apply = apply
    exports.inject = ['inputTriggers']
    return module.exports
  }
})

// harness-diffs host half: git workspace snapshot over an HTTP route.
// POST /git-api { sessionId } -> { branch, clean, entries, error? }
export const inject = ['webServer', 'subprocess', 'sessions', 'fs']

function parseUnified(text) {
  const files = []
  const segments = String(text).split(/^diff --git /m).filter(Boolean)
  for (const seg of segments) {
    const lines = seg.split('\n')
    let path = null
    const out = []
    for (const line of lines) {
      if (path === null) {
        const m = /^a\/.+ b\/(.+)$/.exec(line)
        if (m) {
          path = m[1].replace(/\s+$/, '')
          continue
        }
        continue
      }
      if (line.startsWith('@@')) continue
      if (line.startsWith('---') || line.startsWith('+++')) continue
      if (line.startsWith('\\')) continue
      if (line.startsWith('-')) out.push({ t: 'del', text: line.slice(1) })
      else if (line.startsWith('+')) out.push({ t: 'add', text: line.slice(1) })
      else if (line.startsWith(' ')) out.push({ t: 'ctx', text: line.slice(1) })
      else if (line === '') out.push({ t: 'ctx', text: '' })
    }
    if (path !== null) files.push({ path, lines: out })
  }
  return files
}

function stripPath(p) {
  if (typeof p !== 'string') return ''
  if (p.length >= 2 && p[0] === '"' && p[p.length - 1] === '"') return p.slice(1, -1)
  return p
}

export function apply(ctx) {
  const { webServer, subprocess, sessions, fs } = ctx

  const readBody = (req) =>
    new Promise((resolve) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'))
        } catch {
          resolve({})
        }
      })
    })

  return webServer.register({
    kind: 'exact',
    path: '/git-api',
    handler: async (req, res) => {
      const send = (obj) => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(obj))
      }
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const args = await readBody(req)
      const sessionId = args && args.sessionId
      const session = sessionId ? sessions.get(sessionId) : undefined
      const cwd = session && session.header ? session.header.cwd : undefined
      if (!cwd) {
        send({ error: '无法确定会话工作目录' })
        return
      }
      const run = async (argv) => {
        const handle = subprocess.spawn({
          argv,
          cwd,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 4000000 }, stderr: { maxBytes: 200000 } },
          graceMs: 15000,
        })
        const outcome = await handle.done
        const stdout = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
        return { code: outcome.exitCode, stdout }
      }
      try {
        let branch = ''
        try {
          const br = await run(['git', 'branch', '--show-current'])
          if (br.code === 0) branch = br.stdout.trim()
          else {
            const br2 = await run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
            if (br2.code === 0) branch = br2.stdout.trim()
          }
        } catch (error) {
          branch = ''
        }
        let status
        try {
          status = await run(['git', 'status', '--porcelain=v1'])
        } catch (error) {
          send({ error: 'git 执行失败: ' + String((error && error.message) || error) })
          return
        }
        if (status.code !== 0) {
          send({ error: 'git status 失败: ' + status.stdout.slice(0, 300) })
          return
        }
        const lines = status.stdout.split('\n').filter((l) => l.length > 0)
        if (lines.length === 0) {
          send({ clean: true, entries: [], branch })
          return
        }
        const entries = []
        const tracked = []
        for (const line of lines) {
          const state = line.slice(0, 2).replace(/ /g, '')
          const path = stripPath(line.slice(3))
          if (state === '??' || state === '!?') {
            entries.push({ path, state: '??', lines: null })
          } else {
            tracked.push(path)
            entries.push({ path, state: state || 'M', lines: null })
          }
        }
        if (tracked.length > 0) {
          let diff
          try {
            diff = await run(['git', 'diff', 'HEAD', '--no-color', '--', ...tracked])
          } catch (error) {
            diff = { code: -1, stdout: '' }
          }
          if (diff.code !== 0) {
            try {
              diff = await run(['git', 'diff', '--no-color', '--', ...tracked])
            } catch (error) {
              diff = { code: -1, stdout: '' }
            }
          }
          if (diff.code === 0) {
            const files = parseUnified(diff.stdout)
            const byPath = {}
            for (const f of files) byPath[f.path] = f.lines
            for (const entry of entries) {
              if (entry.lines === null && byPath[entry.path]) entry.lines = byPath[entry.path]
            }
          }
        }
        const untracked = entries.filter((e) => e.state === '??' && e.lines === null)
        for (const entry of untracked) {
          try {
            const target = await fs.resolve(cwd + '/' + entry.path)
            const info = await fs.stat(target)
            if (info && info.type === 'file') {
              const raw = await fs.readText(target)
              entry.lines = raw.split('\n').map((t) => ({ t: 'add', text: t }))
            }
          } catch (error) {
            entry.lines = [{ t: 'add', text: '(无法读取文件)' }]
          }
        }
        send({ clean: false, entries, branch })
      } catch (error) {
        send({ error: String((error && error.message) || error) })
      }
    },
  })
}

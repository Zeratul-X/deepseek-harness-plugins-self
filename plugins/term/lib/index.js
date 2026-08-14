// harness-term host half: terminal API over an HTTP route.
// POST /term-api { op: 'cwd' | 'start' | 'poll', ... } -> JSON
export const inject = ['webServer', 'subprocess', 'sessions', 'timer']

export function apply(ctx) {
  const { webServer, subprocess, sessions, timer } = ctx
  const runs = new Map()
  let nextRun = 1

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

  const cwdOf = (sessionId) => {
    const session = sessionId ? sessions.get(sessionId) : undefined
    return session && session.header ? session.header.cwd : undefined
  }

  return webServer.register({
    kind: 'exact',
    path: '/term-api',
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
      const op = args.op

      if (op === 'cwd') {
        send({ cwd: cwdOf(args.sessionId) || '' })
        return
      }

      if (op === 'start') {
        const command = typeof args.command === 'string' ? args.command.trim() : ''
        const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 86400000
        if (!command) {
          send({ error: '空命令' })
          return
        }
        const cwd = cwdOf(args.sessionId)
        if (!cwd) {
          send({ error: '无法确定会话工作目录' })
          return
        }
        let handle
        try {
          handle = subprocess.spawn({
            argv: ['C:\\Windows\\System32\\cmd.exe', '/d', '/s', '/c', 'chcp 65001 >nul & ' + command],
            cwd,
            stdio: { stdin: 'ignore', stdout: { maxBytes: 8000000 }, stderr: { maxBytes: 2000000 } },
            graceMs: 5000,
          })
        } catch (error) {
          send({ error: '启动失败: ' + String((error && error.message) || error), cwd })
          return
        }
        const runId = 'r' + nextRun++
        const run = { handle, stdoutOff: 0, stderrOff: 0, settled: false, outcome: null, timedOut: false, cwd }
        run.donePromise = handle.done.then((o) => {
          run.settled = true
          run.outcome = o
        })
        run.disposer = timer.timeout(() => {
          run.timedOut = true
          handle.terminate()
        }, timeoutMs)
        runs.set(runId, run)
        send({ runId, cwd })
        return
      }

      if (op === 'poll') {
        const run = runs.get(args.runId)
        if (!run) {
          send({ done: true, gone: true })
          return
        }
        let stdout = ''
        let stderr = ''
        if (run.handle.collected.stdout) {
          const read = run.handle.collected.stdout.readFrom(run.stdoutOff)
          stdout = read.text
          run.stdoutOff = read.nextOffset
        }
        if (run.handle.collected.stderr) {
          const read = run.handle.collected.stderr.readFrom(run.stderrOff)
          stderr = read.text
          run.stderrOff = read.nextOffset
        }
        send({
          stdout,
          stderr,
          done: run.settled,
          code: run.outcome ? run.outcome.exitCode : null,
          timedOut: run.timedOut,
        })
        return
      }

      send({ error: 'unknown op: ' + String(op) })
    },
  })
}

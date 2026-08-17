// harness-file-ref host half: workspace file search for the '@' file picker.
// Serves GET /__file-ref/api/search?q=<query> — a bounded recursive walk of
// every registered workspace, cached per workspace for 10s. Read-only.
// Also GET /__file-ref/api/read?path=<rel> — reads one workspace file (bounded).
import { open, readdir, stat } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export const inject = ['webServer']

const PREFIX = '/__file-ref'
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.DS_Store'])
const MAX_FILES = 20000
const MAX_DEPTH = 10
const CACHE_MS = 10_000
const RESULT_LIMIT = 50
const MAX_READ_BYTES = 512 * 1024
const MAX_READ_LINES = 3000

/** Per-workspace index cache: root -> { promise, builtAt }. */
const indexCache = new Map()

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(payload)
}

/** Bounded iterative walk of one workspace root; returns relative paths (sorted, dirs first by depth). */
async function walk(root) {
  const out = []
  const stack = [{ dir: root, depth: 0 }]
  while (stack.length > 0 && out.length < MAX_FILES) {
    const { dir, depth } = stack.pop()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || depth >= MAX_DEPTH) continue
        stack.push({ dir: resolve(dir, entry.name), depth: depth + 1 })
      } else if (entry.isFile()) {
        out.push(relative(root, resolve(dir, entry.name)).split(sep).join('/'))
        if (out.length >= MAX_FILES) break
      }
    }
  }
  out.sort((a, b) => {
    const aDepth = a.split(/[\\/]/).length
    const bDepth = b.split(/[\\/]/).length
    return aDepth - bDepth || a.localeCompare(b)
  })
  return out
}

/** Index one workspace with caching; concurrent callers share one build. */
function getIndex(root) {
  const cached = indexCache.get(root)
  if (cached !== undefined && Date.now() - cached.builtAt < CACHE_MS) return cached.promise
  const promise = walk(root)
  indexCache.set(root, { promise, builtAt: Date.now() })
  promise.catch(() => {
    // Failed builds are dropped so the next request retries.
    if (indexCache.get(root)?.promise === promise) indexCache.delete(root)
  })
  return promise
}

async function handleSearch(ctx, rawUrl, res) {
  const url = new URL(rawUrl, 'http://x')
  const query = (url.searchParams.get('q') ?? '').toLowerCase()
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) {
    sendJson(res, 200, { ok: true, files: [] })
    return
  }
  const files = []
  try {
    const workspaces = registry.list()
    for (const workspace of workspaces) {
      let rels
      try {
        rels = await getIndex(workspace.path)
      } catch {
        continue
      }
      for (const rel of rels) {
        if (query !== '' && !rel.toLowerCase().includes(query)) continue
        files.push({ path: rel, workspace: workspace.title })
        if (files.length >= RESULT_LIMIT) break
      }
      if (files.length >= RESULT_LIMIT) break
    }
    sendJson(res, 200, { ok: true, files })
  } catch (error) {
    sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** Read one workspace file by relative path (bounded size/lines); path must stay inside a registered workspace. */
async function handleRead(ctx, rawUrl, res) {
  const url = new URL(rawUrl, 'http://x')
  const rel = (url.searchParams.get('path') ?? '').replace(/^\/+/, '')
  if (rel === '' || rel.includes('\0')) {
    sendJson(res, 200, { ok: false, error: 'empty path' })
    return
  }
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) {
    sendJson(res, 200, { ok: false, error: 'no workspace registry' })
    return
  }
  for (const workspace of registry.list()) {
    const abs = resolve(workspace.path, rel)
    if (abs !== resolve(workspace.path) && !abs.startsWith(resolve(workspace.path) + sep)) continue
    let info
    try {
      info = await stat(abs)
    } catch {
      continue
    }
    if (!info.isFile()) continue
    try {
      const size = Math.min(info.size, MAX_READ_BYTES)
      const fh = await open(abs, 'r')
      const buf = Buffer.alloc(size)
      await fh.read(buf, 0, size, 0)
      await fh.close()
      const text = buf.toString('utf8')
      const lines = text.split('\n')
      const capped = lines.length > MAX_READ_LINES ? lines.slice(0, MAX_READ_LINES) : lines
      sendJson(res, 200, {
        ok: true,
        path: rel,
        workspace: workspace.title,
        lines: capped,
        truncated: lines.length > MAX_READ_LINES || info.size > MAX_READ_BYTES,
      })
      return
    } catch (error) {
      sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) })
      return
    }
  }
  sendJson(res, 200, { ok: false, error: 'file not found in any workspace' })
}

async function handle(ctx, req, res) {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  const rest = pathname.slice(PREFIX.length)
  if (rest === '/api/search') return handleSearch(ctx, req.url ?? '/', res)
  if (rest === '/api/read') return handleRead(ctx, req.url ?? '/', res)
  sendJson(res, 404, { ok: false, error: 'unknown file-ref route' })
}

export function apply(ctx) {
  return ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      try {
        await handle(ctx, req, res)
      } catch (error) {
        ctx.logger.warn(error)
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal error' })
        else res.destroy()
      }
    },
  })
}

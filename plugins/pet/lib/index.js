// harness-pet host half: serves the pet spritesheet over an HTTP route.
// 资源从插件目录内读取(发布自带 spritesheet.webp), 不再依赖本机绝对路径。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const inject = ['webServer', 'fs']

export function apply(ctx) {
  const { webServer, fs } = ctx
  let cached = null
  const spritePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'spritesheet.webp')
  return webServer.register({
    kind: 'exact',
    path: '/pet-sprite.webp',
    handler: async (req, res) => {
      try {
        if (!cached) {
          const target = await fs.resolve(spritePath)
          const info = await fs.stat(target)
          if (!info || info.type !== 'file') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('spritesheet.webp not found')
            return
          }
          cached = await fs.readBytes(target, undefined, 10000000)
        }
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' })
        res.end(cached)
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(String((error && error.message) || error))
      }
    },
  })
}

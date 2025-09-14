// Minimal shims to silence TypeScript errors in environments without @types/node
// If possible, install @types/node instead for full typing.

declare const __dirname: string

declare namespace NodeJS { interface Process { pid: number; send?: (msg: any) => void; exit(code?: number): void; } }

declare const process: NodeJS.Process

declare module 'cluster' {
  interface Worker { process: { pid: number }; on(event: 'message', cb: (msg: any) => void): void }
  const isPrimary: boolean
  function fork(): Worker
  function on(event: 'exit', cb: (worker: Worker, code: number) => void): void
  export { isPrimary, fork, on, Worker }
  export default { isPrimary, fork, on }
}

declare module 'fs' { const x: any; export = x }

declare module 'path' { const x: any; export = x }

// Do NOT redeclare 'Page' to avoid erasing actual Playwright types if present.
// If types are missing, install: npm i -D @types/node


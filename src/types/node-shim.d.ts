// Fallback in case @types/node not installed yet; ensures Process/stubs to reduce red squiggles.
// Prefer installing @types/node for full types.

interface ProcessEnv { [key: string]: string | undefined }

interface Process {
  pid: number
  exit(code?: number): never
  send?(message: any): void
  on(event: string, listener: (...args: any[]) => void): any
  stdin: { on(event: string, listener: (...args: any[]) => void): any }
  stdout: { write(chunk: any): boolean }
  env: ProcessEnv
}

declare var process: Process

// Minimal axios module declaration
declare module 'axios' {
  export interface AxiosRequestConfig { [key: string]: any }
  export interface AxiosResponse<T = any> { data: T }
  export interface AxiosInstance {
    defaults: any
    request<T=any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>
  }
  export interface AxiosStatic {
    (config: AxiosRequestConfig): Promise<AxiosResponse>
    request<T=any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>
    create(config?: AxiosRequestConfig): AxiosInstance
  }
  const axios: AxiosStatic
  export default axios
}

// Minimal readline
declare module 'readline' {
  export interface Interface { question(query: string, cb: (answer: string)=>void): void; close(): void }
  export function createInterface(opts: any): Interface
  export default {} as any
}

// Minimal crypto
declare module 'crypto' {
  export function randomBytes(size: number): { toString(encoding: string): string }
}

// Minimal os module
declare module 'os' {
  export function platform(): string
}

// Minimal cheerio subset
declare module 'cheerio' {
  export interface CheerioAPI {
    (selector: any): any
    load(html: string): CheerioAPI
    text(): string
  }
  export function load(html: string): CheerioAPI
}

declare module 'cluster' {
  import { EventEmitter } from 'events'
  interface WorkerLike extends EventEmitter {
    id: number
    process: { pid: number }
    send?(message: any): void
    on(event: 'message', listener: (msg: any) => void): any
  }
  interface Cluster extends EventEmitter {
    isPrimary: boolean
    fork(env?: NodeJS.ProcessEnv): WorkerLike
    workers?: Record<string, WorkerLike>
    on(event: 'exit', listener: (worker: WorkerLike, code: number) => void): any
  }
  const cluster: Cluster
  export default cluster
}

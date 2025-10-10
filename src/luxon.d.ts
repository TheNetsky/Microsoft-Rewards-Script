/* Minimal ambient declarations to unblock TypeScript when @types/luxon is absent. */
declare module 'luxon' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const DateTime: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const IANAZone: any
}

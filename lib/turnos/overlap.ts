export type Intervalo = { startMs: number; endMs: number }

export const isValidInterval = (intervalo: Intervalo) => intervalo.endMs > intervalo.startMs

export const overlaps = (a: Intervalo, b: Intervalo) => a.startMs < b.endMs && a.endMs > b.startMs

export const maxSimultaneous = (intervalos: Intervalo[]) => {
  if (!intervalos.length) return 0
  const events = intervalos
    .filter(isValidInterval)
    .flatMap((intervalo) => [
      { time: intervalo.startMs, delta: 1 },
      { time: intervalo.endMs, delta: -1 },
    ])
    .sort((a, b) => (a.time === b.time ? a.delta - b.delta : a.time - b.time))

  let current = 0
  let max = 0
  for (const event of events) {
    current += event.delta
    if (current > max) max = current
  }
  return max
}

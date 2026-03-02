import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const log = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : { formatters: { level: (label: string) => ({ level: label }) }, timestamp: pino.stdTimeFunctions.isoTime }
  ),
})

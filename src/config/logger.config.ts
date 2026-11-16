import type { Params } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';

export function buildLoggerOptions(nodeEnv: string): Params {
  const isDev = nodeEnv !== 'production';

  const pinoOptions: PinoHttpOptions = {
    level: isDev ? 'debug' : 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'passwordHash',
      ],
      remove: true,
    },
    customProps: () => ({ app: 'sinapse-api' }),
  };

  if (isDev) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,req.headers,res.headers',
      },
    };
  }

  return { pinoHttp: pinoOptions };
}

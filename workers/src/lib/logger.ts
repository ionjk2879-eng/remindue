type LogFields = Record<string, string | number | boolean | null | undefined>;

function write(level: 'info' | 'warn' | 'error', event: string, fields: LogFields = {}) {
  const payload = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) return '[redacted-email]';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname.slice(0, 12)}…`;
  } catch {
    return '[redacted-endpoint]';
  }
}

export const logger = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
};

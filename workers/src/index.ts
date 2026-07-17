import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import purchaseRoutes from './routes/purchases';
import { HttpError } from './lib/errors';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

app.route('/api/auth', authRoutes);
app.route('/api/purchases', purchaseRoutes);

// GlobalExceptionHandler.java와 동일한 매핑: {message}, 상태코드는 에러 종류에 따라 결정
app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ message: err.message }, err.status as never);
  }
  console.error(err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

export default app;

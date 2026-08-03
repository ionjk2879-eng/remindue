import { Hono } from 'hono';
import { PUBLIC_DOMAIN_CONFIG } from '../../../shared/domain-policy';
import type { Env } from '../types';

const config = new Hono<{ Bindings: Env }>();

config.get('/domain', (c) => c.json(PUBLIC_DOMAIN_CONFIG));

export default config;

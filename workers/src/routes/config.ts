import { Hono } from 'hono';
import { PURCHASE_TYPES } from '../../../shared/domain-policy';
import type { Env } from '../types';

const config = new Hono<{ Bindings: Env }>();

config.get('/domain', (c) => c.json({ purchaseTypes: PURCHASE_TYPES }));

export default config;

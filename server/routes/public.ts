import type { FastifyInstance } from 'fastify';
import { listCategories, listFeatures, listItems, listTables, menuVersion } from '../db.js';
import { getSettings } from '../settings.js';
import { ALLERGENS } from '../../web/src/shared/catalog.js';

export function buildMenu(app: FastifyInstance) {
  const db = app.db;
  const s = getSettings(db);
  const cats = listCategories(db).filter((c) => !c.hidden);
  const catIds = new Set(cats.map((c) => c.id));
  const items = listItems(db)
    .filter((i) => i.visible && catIds.has(i.category_id))
    .map(({ visible: _v, updated_at: _u, ...rest }) => rest);
  return {
    version: menuVersion(db),
    settings: s,
    categories: cats.map(({ hidden: _h, ...c }) => c),
    features: listFeatures(db),
    allergens: ALLERGENS,
    tables: listTables(db).map((t) => ({ code: t.code, name: t.name })),
    items,
  };
}

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/menu', async (req, reply) => {
    const etag = `W/"m${menuVersion(app.db)}"`;
    reply.header('ETag', etag).header('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return buildMenu(app);
  });
}

import type { FastifyInstance } from 'fastify';

/**
 * Ofisiant modulu: GƏLƏCƏK ÜÇÜN YER.
 *
 * Hələlik heç bir route qeydiyyata salınmır və `settings.waiter_enabled` həmişə false qaytarılır.
 * Planlaşdırılan sxem və axın üçün bu qovluqdakı README.md-yə baxın.
 * Aktivləşdirmə addımları:
 *   1. migrations: orders, order_lines, waiter_calls, staff cədvəlləri
 *   2. burada POST /api/orders, POST /api/waiter-calls, GET /api/staff/stream (SSE) route-ları
 *   3. settings.ts-də waiter_enabled-i yazılabilən et
 *   4. müştəri menyusunda `data-slot="waiter"` nav düyməsi və səbətdə "Sifarişi göndər" avtomatik görünür
 */
export const WAITER_ENABLED = false;

export async function registerWaiter(_app: FastifyInstance): Promise<void> {
  if (!WAITER_ENABLED) return;
}

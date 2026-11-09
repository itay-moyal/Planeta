import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('POST /api/identify', () => {
  it('returns a Hebrew error when no file is sent', async () => {
    const res = await request(app).post('/api/identify');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
    expect(res.body.error.message).toMatch(/[א-ת]/);
  });

  it('rejects non-image files', async () => {
    const res = await request(app).post('/api/identify').attach('image', Buffer.from('hi'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('BAD_FILE_TYPE');
  });

  it('rejects oversized images', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024);
    const res = await request(app).post('/api/identify').attach('image', big, { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
  });
});

// Cloudflare Pages Worker untuk 1Eagle VR Yard Editor
// 1. Menyimpan & menyajikan /data/denah.json lintas perangkat (Laptop/HP lain)
// 2. Mem-proxy /api/getMasterBlock & /api/getCtrLoc agar bebas masalah CORS

let memoryDenahJson = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // 1. Endpoint Autosave & Load /data/denah.json lintas perangkat
    if (url.pathname === '/data/denah.json' || url.pathname.endsWith('/data/denah.json')) {
      const cacheKey = new Request(url.origin + '/data/denah.json', { method: 'GET' });
      const cache = caches.default;

      // Fitur Reset/Clear cache ke file bawaan deploy jika parameter ?reset=1 atau ?clear=1 dipanggil
      if (url.searchParams.has('reset') || url.searchParams.has('clear') || request.method === 'DELETE') {
        try { await cache.delete(cacheKey); } catch (e) {}
        memoryDenahJson = null;
        if (env && env.DENAH_KV) {
          try { await env.DENAH_KV.delete('denah.json'); } catch (e) {}
        }
        if (request.method === 'DELETE') {
          return new Response(JSON.stringify({ status: 'ok', message: 'Cache cleared' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }

      if (request.method === 'PUT' || request.method === 'POST') {
        try {
          const body = await request.text();
          if (body && body.trim().startsWith('{')) {
            memoryDenahJson = body;

            // Simpan ke Cloudflare KV jika binding DENAH_KV tersedia
            if (env && env.DENAH_KV) {
              try { await env.DENAH_KV.put('denah.json', body); } catch (e) {}
            }

            // Simpan ke Cloudflare Edge Cache
            const cacheResp = new Response(body, {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=31536000',
                'Access-Control-Allow-Origin': '*'
              }
            });
            await cache.put(cacheKey, cacheResp);

            return new Response(JSON.stringify({ status: 'ok', saved: true }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        } catch (err) {
          return new Response(JSON.stringify({ status: 'error', message: String(err) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }

      if (request.method === 'GET') {
        // Prioritas A: Cloudflare KV (jika dikonfigurasi)
        if (env && env.DENAH_KV) {
          try {
            const kvData = await env.DENAH_KV.get('denah.json');
            if (kvData && kvData.trim().startsWith('{')) {
              return new Response(kvData, {
                status: 200,
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-store, no-cache, must-revalidate',
                  'Access-Control-Allow-Origin': '*'
                }
              });
            }
          } catch (e) {}
        }

        // Prioritas B: Cloudflare Edge Cache (Zero-config)
        try {
          const cached = await cache.match(cacheKey);
          if (cached) {
            const text = await cached.text();
            if (text && text.trim().startsWith('{')) {
              return new Response(text, {
                status: 200,
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Cache-Control': 'no-store, no-cache, must-revalidate',
                  'Access-Control-Allow-Origin': '*'
                }
              });
            }
          }
        } catch (e) {}

        // Prioritas C: In-memory isolate
        if (memoryDenahJson && memoryDenahJson.trim().startsWith('{')) {
          return new Response(memoryDenahJson, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        // Fallback: File statis /data/denah.json bawaan folder build
        const assetReq = new Request(url.origin + '/data/denah.json', { method: 'GET' });
        return env.ASSETS.fetch(assetReq);
      }
    }

    // 2. Proxy Endpoint API Backend untuk mencegah error CORS
    if (url.pathname === '/api/getMasterBlock' || url.pathname === '/api/vr/getMasterBlock') {
      try {
        const apiResp = await fetch('https://apps.globalhalalhub.co.id/global-halal-api/api/vr/getMasterBlock');
        const text = await apiResp.text();
        return new Response(text, {
          status: apiResp.status,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {}
    }

    if (url.pathname === '/api/getCtrLoc' || url.pathname === '/api/vr/getCtrLoc') {
      try {
        const apiResp = await fetch('https://apps.globalhalalhub.co.id/global-halal-api/api/vr/getCtrLoc');
        const text = await apiResp.text();
        return new Response(text, {
          status: apiResp.status,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {}
    }

    // 3. File statis lainnya
    return env.ASSETS.fetch(request);
  }
};

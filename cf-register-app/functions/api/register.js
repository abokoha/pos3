export async function onRequest(context) {
  const method = context.request.method;

  // GET: 動作確認用（ブラウザで /api/register を開いたとき）
  if (method === "GET") {
    return new Response(JSON.stringify({ ok: true, method: "GET" }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // POST以外は拒否
  if (method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed: " + method }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  try {
    const GAS_WEBAPP_URL = context.env.GAS_WEBAPP_URL;
    if (!GAS_WEBAPP_URL) {
      return new Response(JSON.stringify({ ok:false, message:"GAS_WEBAPP_URL が未設定です" }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const bodyText = await context.request.text();

    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyText,
    });

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok:false, message:String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

/* CLASS EDIT DONE - the "I'm done - let Erika know" button on
   faculty/class-edit.html (8 Oct 2026).

   A teacher's saved wording is on her class page at once; it is made
   permanent for search engines by tools/publish-class-edits.mjs, which GitHub
   runs late. This tells Erika the teacher has finished, so it can be locked
   in straight away - and it catches the teacher who thinks she saved but
   didn't: with nothing saved there is nothing to send, and she is told so.

   POST { slug } with the teacher's own sign-in token (Authorization: Bearer).
   Checks who she is and that she may edit that class (can_edit_class), reads
   what she saved, and emails Erika. Never writes anything.

   Secrets: RESEND_API_KEY (already set for the booking emails). */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://pmpaslevwimofohirves.supabase.co";
const PUBLIC_KEY = "sb_publishable_t7U8S0paeslz99Y600_ixA_PHauIQcf";   // public by design
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE = "https://quintaand.co";
const ORIGINS = [SITE, "http://localhost:8137"];
const ERIKA = "erika@quintaand.co";
const SEND_FROM = "Quinta & Co. <hello@quintaand.co>";

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : SITE,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

serve(async (req) => {
  const head = cors(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...head } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: head });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug || "");
    if (!token) return json({ error: "not_signed_in" }, 401);
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return json({ error: "bad_class" }, 400);

    // Who is asking - Supabase checks the token.
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` } });
    if (!u.ok) return json({ error: "not_signed_in" }, 401);
    const email = String((await u.json())?.email || "").toLowerCase();
    if (!email) return json({ error: "not_signed_in" }, 401);

    // May she edit this class? Asked as her, so the database decides.
    const can = await fetch(`${SUPABASE_URL}/rest/v1/rpc/can_edit_class`, {
      method: "POST",
      headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!can.ok || (await can.json()) !== true) return json({ error: "not_yours" }, 403);

    // What she saved (public columns only).
    const r = await fetch(`${SUPABASE_URL}/rest/v1/class_edits?slug=eq.${slug}` +
      `&select=description,covers,walkout,prereq,minutes,edited_by_name,updated_at`,
      { headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}` } });
    const rows = r.ok ? await r.json() : [];
    const e = rows[0];
    if (!e) return json({ error: "nothing_saved" }, 409);

    const name = String(body?.name || slug).slice(0, 120);
    const who = e.edited_by_name || email;
    const page = `${SITE}/classes/${slug}.html`;
    const html =
      `<div style="font-family:Georgia,serif;color:#2B3A33;line-height:1.6;max-width:560px">` +
      `<p style="margin:0 0 6px"><strong>${esc(who)} has finished editing ${esc(name)}.</strong></p>` +
      `<p style="margin:0 0 16px">It's already showing on <a href="${page}">the class page</a>. ` +
      `To lock it in for search engines now, tell Claude "${esc(who.split(" ")[0])} is done" - otherwise the timed job does it within a few hours.</p>` +
      `<p style="margin:0 0 10px">${esc(e.description)}</p>` +
      (e.minutes ? `<p style="margin:0 0 10px"><strong>Length:</strong> ${esc(e.minutes)} minutes</p>` : "") +
      `<p style="margin:12px 0 4px;font-weight:600">What we'll cover</p><ul style="margin:0 0 10px">` +
      (e.covers || []).map((c: string) => `<li>${esc(c)}</li>`).join("") + `</ul>` +
      (e.walkout ? `<p style="margin:12px 0 4px;font-weight:600">What you'll walk out with</p><p style="margin:0">${esc(e.walkout)}</p>` : "") +
      (e.prereq ? `<p style="margin:12px 0 4px;font-weight:600">Know before you go</p><p style="margin:0">${esc(e.prereq)}</p>` : "") +
      `<p style="margin:24px 0 0;color:#8A8E83;font-size:13px">Sent from Edit my class by ${esc(email)}.</p></div>`;

    if (!RESEND_API_KEY) { console.error("RESEND_API_KEY is not set"); return json({ error: "not_configured" }, 500); }
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: SEND_FROM, to: [ERIKA], reply_to: email,
        subject: `${who} finished editing ${name}`, html }),
    });
    if (!sent.ok) { console.error("Resend failed", sent.status, await sent.text()); return json({ error: "send_failed" }, 502); }
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: "server" }, 500);
  }
});

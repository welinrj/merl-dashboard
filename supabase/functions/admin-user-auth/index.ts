import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://welinrj.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://welinrj.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `Vu-${random}a7!`;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "The authentication request failed";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Sign in is required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return json(req, { error: "Your session is no longer valid" }, 401);

  const { data: authorized, error: authorizationError } = await service.rpc("edge_admin_authorized", {
    p_actor_auth_user_id: authData.user.id,
  });
  if (authorizationError) return json(req, { error: "Authorization could not be checked" }, 500);
  if (!authorized) return json(req, { error: "Administrator access required" }, 403);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    const profileId = typeof body?.profileId === "string" ? body.profileId : "";

    if (action === "create-user") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const fullName = String(body?.fullName ?? "").trim();
      const role = String(body?.role ?? "");
      const organisation = String(body?.organisation ?? "").trim() || null;
      const password = temporaryPassword();
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createError || !created.user) throw createError ?? new Error("Auth account was not created");
      const { error: profileError } = await service.rpc("edge_admin_create_profile", {
        p_actor_auth_user_id: authData.user.id,
        p_auth_user_id: created.user.id,
        p_email: email,
        p_full_name: fullName,
        p_role: role,
        p_organisation: organisation,
      });
      if (profileError) {
        await service.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }
      return json(req, { email, password });
    }

    if (!profileId) return json(req, { error: "A user profile is required" }, 400);
    const { data: targets, error: targetError } = await service.rpc("edge_admin_auth_target", {
      p_actor_auth_user_id: authData.user.id,
      p_profile_id: profileId,
    });
    if (targetError) throw targetError;
    const target = Array.isArray(targets) ? targets[0] : null;
    if (!target) return json(req, { error: "Administrator access required or user not found" }, 403);
    if (!target.active) return json(req, { error: "Activate the profile before managing its login" }, 400);

    if (action === "provision-login") {
      if (target.auth_user_id) return json(req, { error: "This user already has a login account" }, 409);
      const password = temporaryPassword();
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: target.email, password, email_confirm: true,
        user_metadata: { full_name: target.full_name },
      });
      if (createError || !created.user) throw createError ?? new Error("Auth account was not created");
      const { error: linkError } = await service.rpc("edge_admin_link_login", {
        p_actor_auth_user_id: authData.user.id,
        p_profile_id: profileId,
        p_auth_user_id: created.user.id,
      });
      if (linkError) {
        await service.auth.admin.deleteUser(created.user.id);
        throw linkError;
      }
      return json(req, { email: target.email, password });
    }

    if (!target.auth_user_id) return json(req, { error: "This user has no login account" }, 400);
    const password = action === "reset-password" ? temporaryPassword() : String(body?.password ?? "");
    if (action !== "reset-password" && action !== "set-password") {
      return json(req, { error: "Unknown action" }, 400);
    }
    if (password.length < 10) return json(req, { error: "Password must be at least 10 characters" }, 400);

    const { error: updateError } = await service.auth.admin.updateUserById(target.auth_user_id, { password });
    if (updateError) throw updateError;
    const { error: auditError } = await service.rpc("edge_admin_record_auth_event", {
      p_actor_auth_user_id: authData.user.id,
      p_profile_id: profileId,
      p_event: action === "reset-password" ? "password_reset_by_admin" : "password_set_by_admin",
    });
    if (auditError) throw auditError;
    return json(req, { email: target.email, ...(action === "reset-password" ? { password } : {}) });
  } catch (error) {
    return json(req, { error: message(error) }, 400);
  }
});

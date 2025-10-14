// Supabase Edge Function: invite-sales-rep
// Creates or reuses a user for a Sales Rep and ensures a sales_reps row exists for the caller's client
// Requires caller to be an authenticated client admin. Uses service role for admin operations.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InvitePayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone_no?: string;
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, message: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const payload = (await req.json()) as InvitePayload;
    const { first_name, last_name, email, phone_no } = payload || {};

    if (!first_name || !last_name || !email) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://zwhtgerardkbjvjmruvt.supabase.co";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3aHRnZXJhcmRrYmp2am1ydXZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMzAwNDIsImV4cCI6MjA3MTcwNjA0Mn0.wHJ_Ux7K39hYmNKZx1J6Ei16aHWinFfq1ORMpRr4V-A";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("Missing Supabase envs");
      return new Response(
        JSON.stringify({ success: false, message: "Server misconfiguration" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Client bound to request auth, for role checks and ensure_user_client
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch caller's profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("role, client_id, user_id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error", profileError);
      return new Response(
        JSON.stringify({ success: false, message: "Failed to load profile" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!profile || profile.role !== "client_admin") {
      return new Response(
        JSON.stringify({ success: false, message: "Forbidden: requires client_admin" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Ensure caller has a client (tenant)
    let clientId = profile.client_id as string | null;
    if (!clientId) {
      const { data: ensuredId, error: ensureError } = await supabaseClient.rpc(
        "ensure_user_client",
        { p_client_name: profile?.display_name ?? null, p_google_sheet_id: null }
      );
      if (ensureError || !ensuredId) {
        console.error("ensure_user_client error", ensureError);
        return new Response(
          JSON.stringify({ success: false, message: "Failed to ensure client" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      clientId = ensuredId as string;
    }

    // Admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Helper: find user by email by paging
    async function findUserByEmail(email: string) {
      const maxPages = 10; // safety limit
      const perPage = 1000;
      for (let page = 1; page <= maxPages; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) {
          console.warn("listUsers error", error);
          break;
        }
        const match = data.users.find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
        if (match) return match;
        if (data.users.length < perPage) break; // no more pages
      }
      return null;
    }

    let salesUser = await findUserByEmail(email);
    let created = false;

    if (!salesUser) {
      // Prefer invite flow so the user sets their own password
      const siteUrl = Deno.env.get("SUPABASE_SITE_URL") || "https://id-preview--057b4366-c50a-4d05-8f86-47decf151b3f.lovable.app";
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        { 
          data: { role: "sales_rep", display_name: `${first_name} ${last_name}` },
          redirectTo: `${siteUrl}/accept-invite` 
        }
      );

      if (inviteError) {
        // If user already exists or invite failed, try to create (idempotent-ish)
        console.warn("inviteUserByEmail error", inviteError);
        const tempPassword = `Tmp-${crypto.randomUUID().slice(0, 8)}-Pw1!`;
        const { data: createdData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { role: "sales_rep", display_name: `${first_name} ${last_name}` },
        });
        if (createError) {
          // Final attempt: look up again (maybe the user existed already)
          salesUser = await findUserByEmail(email);
          if (!salesUser) {
            console.error("createUser error", createError);
            return new Response(
              JSON.stringify({ success: false, message: "Failed to create or find user" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
        } else {
          salesUser = createdData.user;
          created = true;
        }
      } else {
        salesUser = inviteData.user;
        created = true;
      }
    } else {
      // Ensure metadata is aligned
      await supabaseAdmin.auth.admin.updateUserById(salesUser.id, {
        user_metadata: { role: "sales_rep", display_name: `${first_name} ${last_name}` },
      });
    }

    if (!salesUser) {
      return new Response(
        JSON.stringify({ success: false, message: "Failed to resolve user" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Ensure a profile exists for the sales rep and link to the client's tenant
    const { error: profileUpsertErr } = await supabaseAdmin.from("profiles").upsert(
      {
        user_id: salesUser.id,
        role: "sales_rep",
        display_name: `${first_name} ${last_name}`,
        client_id: clientId,
      },
      { onConflict: "user_id" }
    );
    if (profileUpsertErr) {
      console.warn("profile upsert error", profileUpsertErr);
    }

    // Ensure user_roles entry exists
    const { error: rolesErr } = await supabaseAdmin.from("user_roles").upsert(
      {
        user_id: salesUser.id,
        role: "sales_rep",
        tenant_id: clientId,
      },
      { onConflict: "user_id,role,tenant_id" }
    );
    if (rolesErr) {
      console.warn("user_roles upsert error", rolesErr);
    }

    // Log audit event
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: clientId,
      user_id: user.id,
      action: "invite_sales_rep",
      resource_type: "sales_rep",
      resource_id: salesUser.id,
      new_data: { email, first_name, last_name, phone_no },
    });

    // Upsert sales_reps record for this client + email
    const { data: existingRep, error: existingErr } = await supabaseAdmin
      .from("sales_reps")
      .select("id, user_id")
      .eq("client_id", clientId)
      .eq("email", email)
      .maybeSingle();

    if (existingErr) {
      console.warn("existing sales_rep lookup error", existingErr);
    }

    if (existingRep?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from("sales_reps")
        .update({
          user_id: salesUser.id,
          first_name,
          last_name,
          phone_no: phone_no ?? null,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRep.id);

      if (updateErr) {
        console.error("sales_rep update error", updateErr);
        return new Response(
          JSON.stringify({ success: false, message: "Failed to update sales rep" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } else {
      const { error: insertErr } = await supabaseAdmin.from("sales_reps").insert({
        user_id: salesUser.id,
        client_id: clientId,
        first_name,
        last_name,
        email,
        phone_no: phone_no ?? null,
        status: "active",
      });
      if (insertErr) {
        console.error("sales_rep insert error", insertErr);
        return new Response(
          JSON.stringify({ success: false, message: "Failed to create sales rep record" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, createdUser: created, user_id: salesUser.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e) {
    console.error("Unexpected error in invite-sales-rep", e);
    return new Response(
      JSON.stringify({ success: false, message: "Unexpected server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

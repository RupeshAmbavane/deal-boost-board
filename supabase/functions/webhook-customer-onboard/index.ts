// Supabase Edge Function: webhook-customer-onboard
// Receives customer data from n8n webhook and creates customer records
// Associates customers with the specified sales rep

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CustomerPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone_no: string;
  sales_rep_email: string;
  source: string;
  notes?: string;
  status?: "pending" | "active" | "won" | "lost";
}

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

    const payload = (await req.json()) as CustomerPayload;
    const { first_name, last_name, email, phone_no, sales_rep_email, source, notes, status } = payload || {};

    if (!first_name || !last_name || !email || !phone_no || !sales_rep_email) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://zwhtgerardkbjvjmruvt.supabase.co";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceKey) {
      console.error("Missing service role key");
      return new Response(
        JSON.stringify({ success: false, message: "Server misconfiguration" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Find the sales rep by email
    const { data: salesRep, error: salesRepError } = await supabaseAdmin
      .from("sales_reps")
      .select("user_id, client_id")
      .eq("email", sales_rep_email.toLowerCase())
      .maybeSingle();

    if (salesRepError || !salesRep) {
      console.error("Sales rep not found:", sales_rep_email, salesRepError);
      return new Response(
        JSON.stringify({ success: false, message: "Sales representative not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create the customer record
    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .insert({
        sales_rep_user_id: salesRep.user_id,
        client_id: salesRep.client_id,
        first_name,
        last_name,
        email: email.toLowerCase(),
        phone_no,
        source,
        notes: notes || null,
        status: status || "pending",
      })
      .select()
      .single();

    if (customerError) {
      console.error("Customer creation error:", customerError);
      return new Response(
        JSON.stringify({ success: false, message: "Failed to create customer" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Customer created successfully:", customer.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        customer_id: customer.id,
        message: "Customer onboarded successfully" 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e) {
    console.error("Unexpected error in webhook-customer-onboard:", e);
    return new Response(
      JSON.stringify({ success: false, message: "Unexpected server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

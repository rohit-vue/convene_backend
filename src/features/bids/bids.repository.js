import { supabase } from "../../config/supabase.js";

export async function listAll({ upworkAccount } = {}) {
  let query = supabase
    .from("upwork_bids")
    .select("*")
    .order("bid_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (upworkAccount) {
    query = query.eq("upwork_account", upworkAccount);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function insert(row) {
  const { data, error } = await supabase.from("upwork_bids").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

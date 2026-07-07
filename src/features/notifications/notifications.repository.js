import { supabase } from "../../config/supabase.js";

export async function insertNotification(row) {
  const { data, error } = await supabase.from("notifications").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listNotificationsForUser(userId, { limit = 20 } = {}) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, meeting_id, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function countUnreadForUser(userId) {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(userId, notificationId) {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function markNotificationsReadForMeeting(userId, meetingId) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("meeting_id", meetingId)
    .is("read_at", null);

  if (error) throw new Error(error.message);
}

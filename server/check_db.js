import { createClient } from "@supabase/supabase-js";

// Clean Supabase URL (no trailing /rest/v1/)
const supabaseUrl = "https://vcrwvxdtaayubalipheb.supabase.co";
const supabaseKey = "REMOVED_SECRET";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select("*").limit(1);
    if (error) {
      console.log(`❌ Table "${tableName}" error:`, error.message, error.details || "");
    } else {
      console.log(`✅ Table "${tableName}" is accessible. Count:`, data.length);
    }
  } catch (err) {
    console.log(`❌ Table "${tableName}" exception:`, err.message);
  }
}

async function run() {
  await checkTable("events");
  await checkTable("media");
  await checkTable("comments");
  await checkTable("notifications");
  await checkTable("user_tokens");
}

run();

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  extensionApiKey: process.env.EXTENSION_API_KEY || null,
};

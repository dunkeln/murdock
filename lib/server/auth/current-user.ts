import "server-only";

export type CurrentUser = {
  id: string;
  firmId: string;
  displayName: string;
};

function envValue(name: string, fallback: string): string {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : fallback;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return {
    id: envValue("MURDOCK_DEMO_USER_ID", "dev-user"),
    firmId: envValue("MURDOCK_DEMO_FIRM_ID", "dev-firm"),
    displayName: envValue("MURDOCK_DEMO_DISPLAY_NAME", "Dev user"),
  };
}

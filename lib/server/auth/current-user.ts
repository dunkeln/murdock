import "server-only";

export type CurrentUser = {
  id: string;
  displayName: string;
};

export async function getCurrentUser(): Promise<CurrentUser> {
  return {
    id: "dev-user",
    displayName: "Dev user",
  };
}

import "server-only";

export type CurrentUser = {
  id: string;
  firmId: string;
  displayName: string;
};

export async function getCurrentUser(): Promise<CurrentUser> {
  return {
    id: "dev-user",
    firmId: "dev-firm",
    displayName: "Dev user",
  };
}

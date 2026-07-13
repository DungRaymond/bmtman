import "server-only";

import { assertAuthenticatedAdmin } from "@/lib/thuAuth";

export async function assertAdmin() {
  await assertAuthenticatedAdmin();
}

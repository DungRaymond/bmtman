import "server-only";

export function assertAdmin(formData: FormData) {
  const configuredPin = process.env.APP_ADMIN_PIN;
  const submittedPin = String(formData.get("admin_pin") || "");

  if (process.env.NODE_ENV === "production" && !configuredPin) {
    throw new Error("Phải cấu hình APP_ADMIN_PIN trước khi cho phép thao tác quản trị.");
  }

  if (configuredPin && submittedPin !== configuredPin) {
    throw new Error("Mã quản trị không đúng.");
  }
}

export function assertCanWrite(formData: FormData) {
  assertAdmin(formData);
}

export const shouldAskForAdminPin = !!process.env.APP_ADMIN_PIN;

import "server-only";

export function assertCanWrite(formData: FormData) {
  const configuredPin = process.env.APP_ADMIN_PIN;
  const submittedPin = String(formData.get("admin_pin") || "");

  if (process.env.NODE_ENV === "production" && !configuredPin) {
    throw new Error("APP_ADMIN_PIN must be configured before writes are enabled.");
  }

  if (configuredPin && submittedPin !== configuredPin) {
    throw new Error("Mã quản trị không đúng.");
  }
}

export const shouldAskForAdminPin = !!process.env.APP_ADMIN_PIN;

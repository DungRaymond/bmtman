import "server-only";

export function assertAdmin(formData: FormData) {
  const configuredPin = process.env.APP_ADMIN_PIN;
  const submittedPin = String(formData.get("admin_pin") || "");

  if (process.env.NODE_ENV === "production" && !configuredPin) {
    throw new Error("APP_ADMIN_PIN must be configured before admin writes are enabled.");
  }

  if (configuredPin && submittedPin !== configuredPin) {
    throw new Error("Ma quan tri khong dung.");
  }
}

export function assertCanWrite(formData: FormData) {
  assertAdmin(formData);
}

export const shouldAskForAdminPin = !!process.env.APP_ADMIN_PIN;

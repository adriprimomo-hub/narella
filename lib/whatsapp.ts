export const sanitizePhoneNumber = (phone: string) => phone.replace(/[^\d]/g, "")

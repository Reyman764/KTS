export const adminApi = {
  unlock: (password: string): Promise<{ unlocked: boolean }> => window.api.admin.unlock(password),
};
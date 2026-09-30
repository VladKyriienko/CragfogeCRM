import { z } from 'zod';

export const createRoleBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_-]*$/),
});

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  key: z.string(),
  isSystem: z.boolean(),
});

export const memberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  email: z.string().email(),
  name: z.string(),
  roleId: z.string().uuid(),
  roleName: z.string(),
  roleKey: z.string(),
});

export const updateMemberRoleBodySchema = z.object({
  roleId: z.string().uuid(),
});

/** Minimal member shape any workspace member may see, e.g. for an owner/assignee picker. */
export const memberPickerItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;
export type RoleDto = z.infer<typeof roleSchema>;
export type MemberDto = z.infer<typeof memberSchema>;
export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleBodySchema>;
export type MemberPickerItem = z.infer<typeof memberPickerItemSchema>;

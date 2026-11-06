// 📂 packages/engine/src/schemas/share.ts
import { z } from "zod";

export const shareRoleSchema = z.enum(["OWNER", "MEMBER"]);
export type ShareRole = z.infer<typeof shareRoleSchema>;

export const shareGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  ownerEmail: z.string().email(),
  members: z.array(z.object({
    userId: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: shareRoleSchema,
    joinedAt: z.string(),
  })),
  createdAt: z.string(),
});
export type ShareGroup = z.infer<typeof shareGroupSchema>;

export const shareInvitationSchema = z.object({
  id: z.string().optional(),
  groupId: z.string(),
  groupName: z.string(),
  inviterEmail: z.string().email(),
  inviteeEmail: z.string().email(),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
  createdAt: z.string(),
});
export type ShareInvitation = z.infer<typeof shareInvitationSchema>;

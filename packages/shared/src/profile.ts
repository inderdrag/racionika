import { z } from 'zod';
export const ProfileSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(60),
    sex: z.enum(['male', 'female']),
    age: z.number().int().min(6).max(100),
    height: z.number().min(100).max(230),
    weight: z.number().min(25).max(350),
    activity: z.enum(['1.2', '1.375', '1.55', '1.725', '1.9']),
    goal: z.enum(['lose', 'maintain', 'gain']),
    targetWeight: z.number().min(25).max(350),
    pace: z.number().min(0.1).max(1),
    customCalories: z.number().int().min(1200).max(5000).optional(),
    individualCare: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type UserProfile = z.infer<typeof ProfileSchema>;

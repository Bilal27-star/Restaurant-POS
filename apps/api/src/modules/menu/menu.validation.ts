import { z } from "zod";

const uuid = z.string().uuid();

export const categoryIdParams = z.object({ categoryId: uuid });
export const itemIdParams = z.object({ itemId: uuid });

const optionalPrice = z.union([z.string(), z.number()]).transform((v) => String(v));

const ingredientBody = z.object({
  name: z.string().min(1).max(200),
  removable: z.boolean().optional(),
});

const modifierBody = z.object({
  name: z.string().min(1).max(200),
  extraPrice: optionalPrice,
});

export const createCategoryBody = z
  .object({
    name: z.string().min(1).max(120),
    sortOrder: z.number().int().optional(),
    colorToken: z.string().max(64).nullable().optional(),
    iconKey: z.string().max(64).nullable().optional(),
  })
  .strict();

export const patchCategoryBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    sortOrder: z.number().int().optional(),
    colorToken: z.string().max(64).nullable().optional(),
    iconKey: z.string().max(64).nullable().optional(),
  })
  .strict()
  .refine(
    (o) =>
      o.name !== undefined ||
      o.sortOrder !== undefined ||
      o.colorToken !== undefined ||
      o.iconKey !== undefined,
    { message: "At least one field required" },
  );

export const createItemBody = z
  .object({
    categoryId: uuid,
    name: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    basePrice: optionalPrice,
    available: z.boolean().optional(),
    popular: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    imageUrl: z.string().max(512_000).nullable().optional(),
    ingredients: z.array(ingredientBody).optional(),
    modifiers: z.array(modifierBody).optional(),
  })
  .strict();

export const patchItemBody = z
  .object({
    categoryId: uuid.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    basePrice: optionalPrice.optional(),
    available: z.boolean().optional(),
    popular: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    imageUrl: z.string().max(512_000).nullable().optional(),
    ingredients: z.array(ingredientBody).optional(),
    modifiers: z.array(modifierBody).optional(),
  })
  .strict()
  .refine(
    (o) =>
      o.categoryId !== undefined ||
      o.name !== undefined ||
      o.description !== undefined ||
      o.basePrice !== undefined ||
      o.available !== undefined ||
      o.popular !== undefined ||
      o.sortOrder !== undefined ||
      o.imageUrl !== undefined ||
      o.ingredients !== undefined ||
      o.modifiers !== undefined,
    { message: "At least one field required" },
  );

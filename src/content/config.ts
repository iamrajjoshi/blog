import { defineCollection, z } from "astro:content";

const blogCollection = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string().max(60).min(10),
      hero: image().optional(),
      heroAlt: z.string().optional(),
      description: z.string().max(160),
      pubDate: z.date(),
      updatedDate: z.date().optional(),
    }),
});

export const collections = {
  blog: blogCollection,
};

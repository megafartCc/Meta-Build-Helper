const { z } = require('zod');

const stageArraySchema = z.array(z.string().min(1)).default([]);
const teamItemSnapshotSchema = z.object({
  hero: z.string().max(80).optional().default(''),
  items: stageArraySchema
});

const recommendBaseSchema = z.object({
  hero_id: z.number().int().positive(),
  pos: z.number().int().min(1).max(5),
  facet: z.string().max(80).optional().default(''),
  time_s: z.number().int().min(0),
  current_items: stageArraySchema,
  allies: stageArraySchema,
  enemies: stageArraySchema,
  ally_items: z.array(teamItemSnapshotSchema).optional().default([]),
  enemy_items: z.array(teamItemSnapshotSchema).optional().default([]),
  request_id: z.string().max(120).optional()
});

const recommendSchema = recommendBaseSchema;

const coachAskSchema = recommendBaseSchema.extend({
  question: z.string().min(1).max(1200)
});

const coachBuildSchema = recommendBaseSchema.extend({
  style_request: z.string().min(1).max(500)
});

const pickerSchema = recommendBaseSchema.extend({
  mode: z.string().max(40).optional().default('')
});

const metaQuerySchema = z.object({
  hero_id: z.coerce.number().int().positive(),
  max: z.coerce.number().int().min(1).max(10).default(6)
});

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'ValidationError',
        details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      });
    }

    req.validated = parsed.data;
    return next();
  };
}

module.exports = {
  recommendSchema,
  coachAskSchema,
  coachBuildSchema,
  pickerSchema,
  metaQuerySchema,
  validate
};

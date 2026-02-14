const { z } = require('zod');

const stageArraySchema = z.array(z.string().min(1)).default([]);

const recommendSchema = z.object({
  hero_id: z.number().int().positive(),
  pos: z.number().int().min(1).max(5),
  facet: z.string().max(80).optional().default(''),
  time_s: z.number().int().min(0),
  current_items: stageArraySchema,
  allies: stageArraySchema,
  enemies: stageArraySchema
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
  metaQuerySchema,
  validate
};
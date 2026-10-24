import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { create, list, remove, suggestions, update, upcoming } from '../controllers/tasks.controller';
import { idParam, taskCreateSchema, taskListQuery, taskUpdateSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: taskListQuery }), list);
router.get('/upcoming', upcoming);
router.get('/suggestions', suggestions);
router.post('/', validate({ body: taskCreateSchema }), create);
router.patch('/:id', validate({ params: idParam, body: taskUpdateSchema }), update);
router.delete('/:id', validate({ params: idParam }), remove);

export default router;

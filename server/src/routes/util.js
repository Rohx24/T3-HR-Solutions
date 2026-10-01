import { HttpError } from '../db.js';

export function idParam(req, name = 'id') {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Not found');
  return id;
}

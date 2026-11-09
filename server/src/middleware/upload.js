import multer from 'multer';
import { config } from '../config.js';
import { AppError } from '../errors.js';

// Memory storage: the photo is never written to disk in phase 1.
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1 },
  fileFilter(req, file, cb) {
    const ok = ['image/jpeg', 'image/png'].includes(file.mimetype);
    cb(ok ? null : new AppError('BAD_FILE_TYPE'), ok);
  },
}).single('image');

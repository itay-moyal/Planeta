// One place that maps error codes to Hebrew messages shown in the UI.
const MESSAGES = {
  NO_FILE: 'לא נבחרה תמונה. נא לבחור תמונה של הצמח.',
  BAD_FILE_TYPE: 'סוג הקובץ לא נתמך. נא להעלות תמונת JPG או PNG.',
  FILE_TOO_LARGE: 'התמונה גדולה מדי. נא לבחור תמונה קטנה יותר.',
  NOT_A_PLANT: 'לא זיהינו צמח בתמונה. נסו לצלם מקרוב, עם תאורה טובה.',
  QUOTA_REACHED: 'הגענו למגבלת הזיהויים להיום. נסו שוב מחר.',
  RATE_LIMITED: 'יותר מדי בקשות. נא להמתין מעט ולנסות שוב.',
  SERVICE_DISABLED: 'שירות הזיהוי כבוי זמנית.',
  UPSTREAM_FAILED: 'שירות הזיהוי לא זמין כרגע. נסו שוב מאוחר יותר.',
  SERVER_ERROR: 'אירעה שגיאה. נסו שוב.',
  INVALID_INPUT: 'הפרטים שהוזנו אינם תקינים. נא לבדוק אימייל וסיסמה (לפחות 8 תווים).',
  EMAIL_TAKEN: 'כתובת האימייל כבר רשומה.',
  BAD_CREDENTIALS: 'אימייל או סיסמה שגויים.',
  UNAUTHORIZED: 'יש להתחבר כדי להמשיך.',
  NOT_FOUND: 'הפריט לא נמצא.',
  LIMIT_REACHED: 'הגעתם למגבלת הפריטים המותרת.',
  PENDING_EXPIRED: 'תוצאת הזיהוי פגה. נא להעלות את התמונה שוב.',
  VISITOR_LIMIT: 'הגעתם למגבלת הזיהויים היומית לאורחים. הירשמו כדי להמשיך.',
};

const STATUS = {
  NO_FILE: 400,
  BAD_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  NOT_A_PLANT: 404,
  QUOTA_REACHED: 429,
  RATE_LIMITED: 429,
  SERVICE_DISABLED: 503,
  UPSTREAM_FAILED: 502,
  SERVER_ERROR: 500,
  INVALID_INPUT: 400,
  EMAIL_TAKEN: 409,
  BAD_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  LIMIT_REACHED: 409,
  PENDING_EXPIRED: 404,
  VISITOR_LIMIT: 429,
};

export class AppError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.status = STATUS[code] ?? 500;
    this.userMessage = MESSAGES[code] ?? MESSAGES.SERVER_ERROR;
  }
}

export function errorHandler(err, req, res, next) {
  // multer's own size error
  if (err.code === 'LIMIT_FILE_SIZE') err = new AppError('FILE_TOO_LARGE');
  if (!(err instanceof AppError)) {
    console.error('Unexpected error:', err.message); // message only: never log photos/tokens
    err = new AppError('SERVER_ERROR');
  }
  res.status(err.status).json({ error: { code: err.code, message: err.userMessage } });
}

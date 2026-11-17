export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface DbErrorLike {
  code?: string;
  message?: string;
}

export function describeDbError(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as DbErrorLike;
  const code = String(e.code ?? '');
  const message = String(e.message ?? (error instanceof Error ? error.message : error ?? ''));

  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'ليست لديك صلاحية لتنفيذ هذه العملية.';
  }
  if (code === '23514' || code === '22001') {
    return 'البيانات المدخلة غير صالحة أو تتجاوز الحد المسموح (قد يكون حجم الصور كبيراً).';
  }
  if (code === '23505') {
    return 'هذا السجل موجود مسبقاً.';
  }
  if (code === 'PGRST116') {
    return 'السجل المطلوب غير موجود أو لا تملك صلاحية الوصول إليه.';
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'تعذّر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت ثم المحاولة مرة أخرى.';
  }
  return message || 'حدث خطأ غير متوقع في قاعدة البيانات.';
}

export function handleDbError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  console.error('Database error:', { operationType, path, error });
  throw new Error(describeDbError(error));
}

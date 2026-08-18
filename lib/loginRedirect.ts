interface LocationLike {
  pathname: string;
  search?: string;
  hash?: string;
}

type PendingActionType = 'autobuy' | 'autocheckout';

interface PendingResumeAction {
  type: PendingActionType;
  path: string;
  productId?: string;
  createdAt: number;
}

const PENDING_ACTION_KEY = 'pending_resume_action_v1';
const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

export const getCurrentPath = (location: LocationLike): string => {
  return `${location.pathname}${location.search || ''}${location.hash || ''}`;
};

export const withQueryParams = (
  path: string,
  params: Record<string, string | number | boolean | null | undefined>
): string => {
  const [withoutHash, hashPart] = path.split('#');
  const [pathname, queryPart] = withoutHash.split('?');
  const searchParams = new URLSearchParams(queryPart || '');

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      searchParams.delete(key);
      return;
    }
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ''}${hashPart ? `#${hashPart}` : ''}`;
};

export const setPendingResumeAction = (action: Omit<PendingResumeAction, 'createdAt'>): void => {
  const payload: PendingResumeAction = {
    ...action,
    createdAt: Date.now()
  };
  sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(payload));
};

export const getPendingResumeAction = (): PendingResumeAction | null => {
  const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingResumeAction;
    if (!parsed?.type || !parsed?.path || !parsed?.createdAt) {
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      return null;
    }
    if (Date.now() - parsed.createdAt > PENDING_ACTION_TTL_MS) {
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    return null;
  }
};

export const clearPendingResumeAction = (): void => {
  sessionStorage.removeItem(PENDING_ACTION_KEY);
};
import { useEffect, useState } from 'react';
import { loadLegalFormsCache, loadLegalFormsFull, type LegalFormEntry } from '../lib/legalFormsUtils';

export function useLegalFormsCache() {
  const [cache, setCache] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLegalFormsCache().then((map) => {
      setCache(map);
      setLoading(false);
    });
  }, []);

  return { cache, loading };
}

export function useLegalFormsFull() {
  const [forms, setForms] = useState<LegalFormEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLegalFormsFull().then((data) => {
      setForms(data);
      setLoading(false);
    });
  }, []);

  return { forms, loading };
}

'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseFileSelectionOptions {
  readonly defaultSlug: string;
}

interface FileSelectionState {
  readonly activeTab: string;
  readonly splitSlug: string | null;
}

function readFromUrl(defaultSlug: string): FileSelectionState {
  if (typeof window === 'undefined') {
    return { activeTab: defaultSlug, splitSlug: null };
  }
  const params = new URLSearchParams(window.location.search);
  const file = params.get('file');
  const split = params.get('split');
  return {
    activeTab: file || defaultSlug,
    splitSlug: split || null,
  };
}

function writeToUrl(state: FileSelectionState) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  if (state.activeTab) {
    params.set('file', state.activeTab);
  } else {
    params.delete('file');
  }

  if (state.splitSlug) {
    params.set('split', state.splitSlug);
  } else {
    params.delete('split');
  }

  const query = params.toString();
  const newUrl = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

export function useFileSelection({ defaultSlug }: UseFileSelectionOptions) {
  const [state, setState] = useState<FileSelectionState>({
    activeTab: defaultSlug,
    splitSlug: null,
  });

  // Read URL on mount
  useEffect(() => {
    setState(readFromUrl(defaultSlug));
  }, [defaultSlug]);

  // Sync state to URL
  useEffect(() => {
    writeToUrl(state);
  }, [state]);

  const setActiveTab = useCallback((slug: string) => {
    setState((prev) => ({ ...prev, activeTab: slug }));
  }, []);

  const setSplitSlug = useCallback((slug: string | null) => {
    setState((prev) => ({ ...prev, splitSlug: slug }));
  }, []);

  return {
    activeTab: state.activeTab,
    splitSlug: state.splitSlug,
    setActiveTab,
    setSplitSlug,
  } as const;
}

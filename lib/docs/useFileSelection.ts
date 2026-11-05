'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFileSelectionOptions {
  readonly defaultSlug: string;
  readonly defaultVault: string;
}

interface FileSelectionState {
  readonly activeTab: string;
  readonly splitSlug: string | null;
  readonly vault: string;
}

function readFromUrl(
  defaultSlug: string,
  defaultVault: string
): FileSelectionState {
  if (typeof window === 'undefined') {
    return { activeTab: defaultSlug, splitSlug: null, vault: defaultVault };
  }
  const params = new URLSearchParams(window.location.search);
  const file = params.get('file');
  const split = params.get('split');
  const vault = params.get('vault');
  return {
    activeTab: file || defaultSlug,
    splitSlug: split || null,
    vault: vault || defaultVault,
  };
}

function writeToUrl(state: FileSelectionState, defaultVault: string) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);

  if (state.vault && state.vault !== defaultVault) {
    params.set('vault', state.vault);
  } else {
    params.delete('vault');
  }

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
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (newUrl !== currentUrl) {
    window.history.replaceState(null, '', newUrl);
  }
}

export function useFileSelection({
  defaultSlug,
  defaultVault,
}: UseFileSelectionOptions) {
  const [state, setState] = useState<FileSelectionState>({
    activeTab: defaultSlug,
    splitSlug: null,
    vault: defaultVault,
  });
  const isInitialized = useRef(false);

  // Read URL on mount and listen to browser Back/Forward navigation
  useEffect(() => {
    setState(readFromUrl(defaultSlug, defaultVault));
    isInitialized.current = true;

    const handlePopState = () => {
      setState(readFromUrl(defaultSlug, defaultVault));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultSlug, defaultVault]);

  // Sync state to URL after initial hydration
  useEffect(() => {
    if (!isInitialized.current) return;
    writeToUrl(state, defaultVault);
  }, [state, defaultVault]);

  const setActiveTab = useCallback((slug: string) => {
    setState((prev) => ({ ...prev, activeTab: slug }));
  }, []);

  const setSplitSlug = useCallback((slug: string | null) => {
    setState((prev) => ({ ...prev, splitSlug: slug }));
  }, []);

  const setVault = useCallback((vault: string, initialSlug = '') => {
    setState({ activeTab: initialSlug, splitSlug: null, vault });
  }, []);

  return {
    activeTab: state.activeTab,
    splitSlug: state.splitSlug,
    vault: state.vault,
    setActiveTab,
    setSplitSlug,
    setVault,
  } as const;
}

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
}

interface BrowserViewProps {
  sessionId: string;
  isActive: boolean;
  initialUrl?: string;
  initialTabs?: { url: string; title: string }[];
  onTitleChange?: (id: string, title: string) => void;
  onTabsChange?: (id: string, tabs: { url: string; title: string }[]) => void;
}

let tabCounter = 0;

function createTab(url?: string): BrowserTab {
  tabCounter++;
  return {
    id: `btab-${tabCounter}`,
    url: url || 'https://www.google.com',
    title: 'New Tab',
    loading: true,
  };
}

export default function BrowserView({ sessionId, isActive, initialUrl, initialTabs, onTitleChange, onTabsChange }: BrowserViewProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    if (initialTabs && initialTabs.length > 0) {
      return initialTabs.map((t) => {
        tabCounter++;
        return { id: `btab-${tabCounter}`, url: t.url, title: t.title, loading: true };
      });
    }
    return [createTab(initialUrl)];
  });
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const webviewRefs = useRef<Map<string, any>>(new Map());
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [displayUrl, setDisplayUrl] = useState(initialUrl || 'https://www.google.com');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Report tab changes for persistence
  useEffect(() => {
    if (onTabsChange) {
      onTabsChange(sessionId, tabs.map((t) => ({ url: t.url, title: t.title })));
    }
  }, [tabs, sessionId, onTabsChange]);

  const setWebviewRef = useCallback((tabId: string, el: any) => {
    if (el) webviewRefs.current.set(tabId, el);
    else webviewRefs.current.delete(tabId);
  }, []);

  // Setup event listeners for each webview
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    for (const tab of tabs) {
      const webview = webviewRefs.current.get(tab.id);
      if (!webview || webview._listenersAttached) continue;
      webview._listenersAttached = true;

      const tabId = tab.id;

      const handleNav = () => {
        if (tabId === activeTabId) {
          setDisplayUrl(webview.getURL());
          setCanGoBack(webview.canGoBack());
          setCanGoForward(webview.canGoForward());
        }
      };

      const handleTitle = (e: any) => {
        setTabs((prev) => prev.map((t) =>
          t.id === tabId ? { ...t, title: e.title || t.title } : t
        ));
        if (tabId === activeTabId && onTitleChange) {
          onTitleChange(sessionId, e.title);
        }
      };

      const handleLoadStart = () => {
        setTabs((prev) => prev.map((t) =>
          t.id === tabId ? { ...t, loading: true } : t
        ));
      };

      const handleLoadStop = () => {
        setTabs((prev) => prev.map((t) =>
          t.id === tabId ? { ...t, loading: false, url: webview.getURL() } : t
        ));
        handleNav();
      };

      // Handle target="_blank" links — open in new tab
      const handleNewWindow = (e: any) => {
        e.preventDefault();
        const newTab = createTab(e.url);
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
      };

      // Block non-http(s) navigations to prevent file:// access
      const blockBadProtocol = (e: any) => {
        try {
          const parsed = new URL(e.url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            e.preventDefault();
          }
        } catch {
          e.preventDefault();
        }
      };

      webview.addEventListener('will-navigate', blockBadProtocol);
      webview.addEventListener('will-frame-navigate', blockBadProtocol);
      webview.addEventListener('did-navigate', handleNav);
      webview.addEventListener('did-navigate-in-page', handleNav);
      webview.addEventListener('page-title-updated', handleTitle);
      webview.addEventListener('did-start-loading', handleLoadStart);
      webview.addEventListener('did-stop-loading', handleLoadStop);
      webview.addEventListener('new-window', handleNewWindow);

      cleanups.push(() => {
        webview.removeEventListener('will-navigate', blockBadProtocol);
        webview.removeEventListener('will-frame-navigate', blockBadProtocol);
        webview.removeEventListener('did-navigate', handleNav);
        webview.removeEventListener('did-navigate-in-page', handleNav);
        webview.removeEventListener('page-title-updated', handleTitle);
        webview.removeEventListener('did-start-loading', handleLoadStart);
        webview.removeEventListener('did-stop-loading', handleLoadStop);
        webview.removeEventListener('new-window', handleNewWindow);
        webview._listenersAttached = false;
      });
    }

    return () => cleanups.forEach((c) => c());
  }, [tabs.length, activeTabId, sessionId, onTitleChange]);

  // Update URL bar when switching tabs
  useEffect(() => {
    const webview = webviewRefs.current.get(activeTabId);
    if (webview) {
      try {
        setDisplayUrl(webview.getURL());
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
      } catch {
        setDisplayUrl(activeTab?.url || '');
      }
    }
    // Update parent title
    if (activeTab && onTitleChange) {
      onTitleChange(sessionId, activeTab.title);
    }
  }, [activeTabId]);

  const navigate = (targetUrl: string) => {
    let finalUrl = targetUrl.trim();
    if (!finalUrl) return;
    if (!/^https?:\/\//i.test(finalUrl)) {
      if (/^[\w-]+(\.[\w-]+)+/.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    setDisplayUrl(finalUrl);
    const webview = webviewRefs.current.get(activeTabId);
    if (webview) webview.loadURL(finalUrl);
  };

  const handleNewTab = () => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const handleCloseTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const wasActive = tabId === activeTabId;
    if (wasActive) {
      const remaining = tabs.filter((t) => t.id !== tabId);
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    webviewRefs.current.delete(tabId);
  };

  const activeWebview = webviewRefs.current.get(activeTabId);
  const isLoading = activeTab?.loading ?? false;

  return (
    <div className="browser-view-container">
      {/* Browser tabs */}
      <div className="browser-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`browser-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <span className="browser-tab-title">
              {tab.loading ? '...' : tab.title}
            </span>
            {tabs.length > 1 && (
              <button
                className="browser-tab-close"
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
              >&times;</button>
            )}
          </div>
        ))}
        <button className="browser-tab-new" onClick={handleNewTab}>+</button>
      </div>

      {/* Toolbar */}
      <div className="browser-toolbar">
        <button
          className="browser-nav-btn"
          disabled={!canGoBack}
          onClick={() => activeWebview?.goBack()}
          title="Back"
        >&#9664;</button>
        <button
          className="browser-nav-btn"
          disabled={!canGoForward}
          onClick={() => activeWebview?.goForward()}
          title="Forward"
        >&#9654;</button>
        <button
          className="browser-nav-btn"
          onClick={() => isLoading ? activeWebview?.stop() : activeWebview?.reload()}
          title={isLoading ? 'Stop' : 'Reload'}
        >{isLoading ? '✕' : '↻'}</button>
        <input
          ref={urlInputRef}
          className="browser-url-input"
          value={displayUrl}
          onChange={(e) => setDisplayUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate(displayUrl);
          }}
          onFocus={(e) => e.target.select()}
        />
        <button
          className="browser-nav-btn"
          onClick={() => {
            const currentUrl = activeWebview?.getURL() || displayUrl;
            window.terminal.openExternal(currentUrl);
          }}
          title="Open in system browser"
        >&#8599;</button>
      </div>

      {/* Webviews — one per tab, show/hide */}
      {tabs.map((tab) => (
        <webview
          key={tab.id}
          ref={(el: any) => setWebviewRef(tab.id, el)}
          src={tab.url}
          className="browser-webview"
          style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
          // @ts-ignore
          partition="persist:browser"
          allowpopups="true"
        />
      ))}
    </div>
  );
}

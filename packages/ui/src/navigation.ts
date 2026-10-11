import { useEffect, useRef, useState } from 'react';

export function navigate(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid navigation');
  history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useLocation(): string {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const previous = useRef(location);
  useEffect(() => {
    const change = () => { setLocation(window.location.pathname + window.location.search); };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return;
      const target = new URL(anchor.href);
      if (target.origin !== window.location.origin) return;
      event.preventDefault(); navigate(target.pathname + target.search + target.hash);
    };
    window.addEventListener('popstate', change); document.addEventListener('click', click);
    return () => { window.removeEventListener('popstate', change); document.removeEventListener('click', click); };
  }, []);
  useEffect(() => { document.body.dataset.route = location.split('?')[0] ?? '/'; if (previous.current === location) return; previous.current = location; window.scrollTo(0, 0); const id = requestAnimationFrame(() => document.getElementById('page-title')?.focus()); return () => cancelAnimationFrame(id); }, [location]);
  return location;
}

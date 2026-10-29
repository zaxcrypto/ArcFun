import { useState, useEffect } from 'react';

export function useVirtualKeyboard() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    let maxViewportHeight = window.innerHeight;

    const checkKeyboard = () => {
      const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      
      if (currentHeight > maxViewportHeight) {
        maxViewportHeight = currentHeight;
      }

      if (currentHeight < maxViewportHeight - 120) {
        setIsKeyboardOpen(true);
      } else {
        setIsKeyboardOpen(false);
      }
    };

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        setIsKeyboardOpen(true);
        setTimeout(checkKeyboard, 300);
      }
    };

    const handleFocusOut = () => {
      setTimeout(checkKeyboard, 200);
    };

    window.addEventListener('resize', checkKeyboard);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', checkKeyboard);
    }
    
    document.addEventListener('focus', handleFocusIn, true);
    document.addEventListener('blur', handleFocusOut, true);

    return () => {
      window.removeEventListener('resize', checkKeyboard);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', checkKeyboard);
      }
      document.removeEventListener('focus', handleFocusIn, true);
      document.removeEventListener('blur', handleFocusOut, true);
    };
  }, []);

  return { isKeyboardOpen };
}
